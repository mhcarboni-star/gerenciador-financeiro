import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hid, uid, type AuthRequest } from "../lib/auth.js";
import { ah, HttpError } from "../lib/http.js";
import { currentMonth, monthRange } from "../lib/dates.js";
import { getOrCreateInvoice } from "../lib/invoiceStore.js";

export const transactionsRouter = Router();

const schema = z.object({
  description: z.string().trim().min(1, "Informe a descrição"),
  amountCents: z.number().int().positive("O valor precisa ser maior que zero"),
  type: z.enum(["INCOME", "EXPENSE"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  categoryId: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  creditCardId: z.string().nullable().optional(),
  status: z.enum(["PAID", "PENDING"]).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

async function checkCategory(req: AuthRequest, categoryId?: string | null) {
  if (!categoryId) return;
  const cat = await prisma.category.findFirst({ where: { id: categoryId, householdId: hid(req) } });
  if (!cat) throw new HttpError(400, "Categoria inválida");
}

async function own(req: AuthRequest, id: string) {
  const t = await prisma.transaction.findFirst({ where: { id, householdId: hid(req), type: SIMPLE_TYPES } });
  if (!t) throw new HttpError(404, "Lançamento não encontrado");
}

/**
 * Onde o lançamento acontece: em um cartão (resolve a fatura pela data) ou em uma conta
 * (a informada ou, se nenhuma, a primeira conta ativa do grupo).
 */
async function resolveSource(req: AuthRequest, data: { accountId?: string | null; creditCardId?: string | null; date: string }) {
  if (data.accountId && data.creditCardId) throw new HttpError(400, "Escolha uma conta ou um cartão, não os dois");
  if (data.creditCardId) {
    const card = await prisma.creditCard.findFirst({ where: { id: data.creditCardId, householdId: hid(req) } });
    if (!card) throw new HttpError(400, "Cartão inválido");
    const invoice = await getOrCreateInvoice(prisma, card, data.date);
    if (invoice.status === "PAID") throw new HttpError(400, "A fatura desta data já foi paga");
    return { accountId: null, creditCardId: card.id, invoiceId: invoice.id };
  }
  const acc = await prisma.account.findFirst({
    where: { householdId: hid(req), ...(data.accountId ? { id: data.accountId } : { archivedAt: null }) },
    orderBy: { createdAt: "asc" },
  });
  if (!acc) throw new HttpError(400, data.accountId ? "Conta inválida" : "Cadastre uma conta primeiro");
  return { accountId: acc.id, creditCardId: null, invoiceId: null };
}

// Esta rota trata receitas e despesas (em conta ou cartão). Transferências, parcelas,
// recorrências e empréstimos têm fluxos próprios.
const SIMPLE_TYPES = { in: ["INCOME", "EXPENSE"] as ("INCOME" | "EXPENSE")[] };
const INCLUDE = {
  category: true,
  account: { select: { id: true, name: true, color: true } },
  creditCard: { select: { id: true, name: true, color: true } },
} as const;

const toDate = (s: string) => new Date(`${s}T00:00:00Z`);

transactionsRouter.get(
  "/",
  ah(async (req: AuthRequest, res) => {
    const month = typeof req.query.month === "string" ? req.query.month : currentMonth();
    const list = await prisma.transaction.findMany({
      where: { householdId: hid(req), type: SIMPLE_TYPES, date: monthRange(month) },
      include: INCLUDE,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    res.json(list);
  }),
);

transactionsRouter.post(
  "/",
  ah(async (req: AuthRequest, res) => {
    const data = schema.parse(req.body);
    await checkCategory(req, data.categoryId);
    const source = await resolveSource(req, data);
    const t = await prisma.transaction.create({
      data: { ...data, ...source, date: toDate(data.date), householdId: hid(req), createdById: uid(req) },
      include: INCLUDE,
    });
    res.status(201).json(t);
  }),
);

transactionsRouter.put(
  "/:id",
  ah(async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    await own(req, id);
    const data = schema.parse(req.body);
    await checkCategory(req, data.categoryId);
    const source = await resolveSource(req, data);
    const t = await prisma.transaction.update({
      where: { id },
      data: { ...data, ...source, date: toDate(data.date) },
      include: INCLUDE,
    });
    res.json(t);
  }),
);

transactionsRouter.delete(
  "/:id",
  ah(async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    await own(req, id);
    await prisma.transaction.delete({ where: { id } });
    res.status(204).end();
  }),
);
