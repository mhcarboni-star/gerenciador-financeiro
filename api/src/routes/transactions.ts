import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hid, uid, type AuthRequest } from "../lib/auth.js";
import { ah, HttpError } from "../lib/http.js";
import { currentMonth, monthRange } from "../lib/dates.js";

export const transactionsRouter = Router();

const schema = z.object({
  description: z.string().trim().min(1, "Informe a descrição"),
  amountCents: z.number().int().positive("O valor precisa ser maior que zero"),
  type: z.enum(["INCOME", "EXPENSE"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  categoryId: z.string().nullable().optional(),
  accountId: z.string().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

async function checkCategory(req: AuthRequest, categoryId?: string | null) {
  if (!categoryId) return;
  const cat = await prisma.category.findFirst({ where: { id: categoryId, householdId: hid(req) } });
  if (!cat) throw new HttpError(400, "Categoria inválida");
}

async function own(req: AuthRequest, id: string) {
  const t = await prisma.transaction.findFirst({ where: { id, householdId: hid(req) } });
  if (!t) throw new HttpError(404, "Lançamento não encontrado");
}

/** Conta informada (validada) ou, se omitida, a primeira conta ativa do grupo. */
async function resolveAccount(req: AuthRequest, accountId?: string) {
  const acc = await prisma.account.findFirst({
    where: { householdId: hid(req), archivedAt: null, ...(accountId ? { id: accountId } : {}) },
    orderBy: { createdAt: "asc" },
  });
  if (!acc) throw new HttpError(400, accountId ? "Conta inválida" : "Cadastre uma conta primeiro");
  return acc.id;
}

// Por enquanto esta rota trata só receitas e despesas em conta; cartão,
// transferências e parcelas ganham rotas próprias.
const SIMPLE_TYPES = { in: ["INCOME", "EXPENSE"] as ("INCOME" | "EXPENSE")[] };

const toDate = (s: string) => new Date(`${s}T00:00:00Z`);

transactionsRouter.get(
  "/",
  ah(async (req: AuthRequest, res) => {
    const month = typeof req.query.month === "string" ? req.query.month : currentMonth();
    const list = await prisma.transaction.findMany({
      where: { householdId: hid(req), type: SIMPLE_TYPES, date: monthRange(month) },
      include: { category: true },
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
    const accountId = await resolveAccount(req, data.accountId);
    const t = await prisma.transaction.create({
      data: { ...data, accountId, date: toDate(data.date), householdId: hid(req), createdById: uid(req) },
      include: { category: true },
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
    const accountId = data.accountId ? await resolveAccount(req, data.accountId) : undefined;
    const t = await prisma.transaction.update({
      where: { id },
      data: { ...data, accountId, date: toDate(data.date) },
      include: { category: true },
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
