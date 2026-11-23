import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hid, uid, type AuthRequest } from "../lib/auth.js";
import { ah, HttpError } from "../lib/http.js";
import { currentMonth, monthRange } from "../lib/dates.js";
import { getOrCreateInvoice } from "../lib/invoiceStore.js";
import { refreshInvoiceStatus } from "../lib/invoiceStatus.js";
import { generateForHousehold } from "../lib/recurrenceService.js";
import { addDays, todayIso } from "../lib/schedule.js";
import { isBeforeCheckpoint, latestCheckpoints } from "../lib/balances.js";

export const transactionsRouter = Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const toDate = (s: string) => new Date(`${s}T00:00:00Z`);

const schema = z.object({
  description: z.string().trim().min(1, "Informe a descrição").max(120),
  amountCents: z.number().int().positive("O valor precisa ser maior que zero"),
  type: z.enum(["INCOME", "EXPENSE"]),
  date: isoDate,
  categoryId: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  creditCardId: z.string().nullable().optional(),
  status: z.enum(["PAID", "PENDING"]).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

const transferSchema = z
  .object({
    description: z.string().trim().max(120).optional(),
    amountCents: z.number().int().positive("O valor precisa ser maior que zero"),
    date: isoDate,
    accountId: z.string().min(1, "Escolha a conta de origem"),
    destinationAccountId: z.string().min(1, "Escolha a conta de destino"),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => v.accountId !== v.destinationAccountId, "Origem e destino precisam ser contas diferentes");

const INCLUDE = {
  category: true,
  account: { select: { id: true, name: true, color: true } },
  destinationAccount: { select: { id: true, name: true, color: true } },
  creditCard: { select: { id: true, name: true, color: true } },
  loan: { select: { id: true, name: true } },
} as const;

async function checkCategory(req: AuthRequest, categoryId: string | null | undefined, type: "INCOME" | "EXPENSE") {
  if (!categoryId) return;
  const cat = await prisma.category.findFirst({ where: { id: categoryId, householdId: hid(req), type } });
  if (!cat) throw new HttpError(400, "Categoria inválida");
}

async function own(req: AuthRequest, id: string) {
  const t = await prisma.transaction.findFirst({ where: { id, householdId: hid(req) } });
  if (!t) throw new HttpError(404, "Lançamento não encontrado");
  return t;
}

async function checkAccount(req: AuthRequest, id: string) {
  const a = await prisma.account.findFirst({ where: { id, householdId: hid(req) } });
  if (!a) throw new HttpError(400, "Conta inválida");
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

/** Lançamentos do mês (todos os tipos, exceto a entrada de empréstimo, que aparece na aba Empréstimos). */
transactionsRouter.get(
  "/",
  ah(async (req: AuthRequest, res) => {
    await generateForHousehold(hid(req));
    const month = typeof req.query.month === "string" ? req.query.month : currentMonth();
    const [list, checkpoints] = await Promise.all([
      prisma.transaction.findMany({
        where: { householdId: hid(req), type: { not: "LOAN_RECEIPT" }, date: monthRange(month) },
        include: INCLUDE,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      }),
      latestCheckpoints(hid(req)),
    ]);
    // Marca o que ficou antes do último ajuste de saldo da conta (só registro).
    res.json(
      list.map((t) => ({
        ...t,
        beforeAdjustment:
          t.type !== "ADJUSTMENT_IN" &&
          t.type !== "ADJUSTMENT_OUT" &&
          ((!!t.accountId && isBeforeCheckpoint(checkpoints.get(t.accountId), t)) ||
            (!!t.destinationAccountId && isBeforeCheckpoint(checkpoints.get(t.destinationAccountId), t))),
      })),
    );
  }),
);

/** Para confirmar: atrasados, de hoje e dos próximos 7 dias. */
transactionsRouter.get(
  "/pendentes",
  ah(async (req: AuthRequest, res) => {
    await generateForHousehold(hid(req));
    const today = todayIso();
    const list = await prisma.transaction.findMany({
      where: { householdId: hid(req), status: "PENDING", date: { lte: toDate(addDays(today, 7)) } },
      include: { ...INCLUDE, recurrence: { select: { id: true, amountIsEstimate: true, amountCents: true } } },
      orderBy: [{ date: "asc" }, { description: "asc" }],
    });
    const day = (t: { date: Date }) => t.date.toISOString().slice(0, 10);
    res.json({
      today,
      overdue: list.filter((t) => day(t) < today),
      dueToday: list.filter((t) => day(t) === today),
      upcoming: list.filter((t) => day(t) > today),
    });
  }),
);

transactionsRouter.post(
  "/",
  ah(async (req: AuthRequest, res) => {
    const data = schema.parse(req.body);
    await checkCategory(req, data.categoryId, data.type);
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
    const old = await own(req, id);
    if (old.type !== "INCOME" && old.type !== "EXPENSE") throw new HttpError(400, "Este lançamento é editado em outra tela");
    const data = schema.parse(req.body);
    await checkCategory(req, data.categoryId, data.type);
    const source = await resolveSource(req, data);
    const t = await prisma.transaction.update({
      where: { id },
      data: { ...data, ...source, date: toDate(data.date) },
      include: INCLUDE,
    });
    res.json(t);
  }),
);

const confirmSchema = z.object({
  amountCents: z.number().int().positive("O valor precisa ser maior que zero"),
  date: isoDate,
  accountId: z.string().nullable().optional(),
  creditCardId: z.string().nullable().optional(),
  /** Usar o valor confirmado como nova previsão das próximas ocorrências (padrão: não). */
  updateForecast: z.boolean().default(false),
});

/**
 * Confirma um lançamento previsto, podendo corrigir valor, data e conta/cartão.
 * O valor previsto original continua em expectedAmountCents.
 */
transactionsRouter.post(
  "/:id/confirmar",
  ah(async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    const t = await own(req, id);
    if (t.status !== "PENDING") throw new HttpError(400, "Este lançamento já foi confirmado");
    if (t.type !== "INCOME" && t.type !== "EXPENSE") throw new HttpError(400, "Este lançamento é confirmado em outra tela");
    const v = confirmSchema.parse(req.body);
    const source = await resolveSource(req, {
      accountId: v.accountId === undefined && v.creditCardId === undefined ? t.accountId : v.accountId,
      creditCardId: v.accountId === undefined && v.creditCardId === undefined ? t.creditCardId : v.creditCardId,
      date: v.date,
    });
    const updated = await prisma.transaction.update({
      where: { id },
      data: {
        status: "PAID",
        amountCents: v.amountCents,
        expectedAmountCents: t.expectedAmountCents ?? t.amountCents,
        date: toDate(v.date),
        ...source,
      },
      include: INCLUDE,
    });
    if (v.updateForecast && t.recurrenceId) {
      await prisma.$transaction([
        prisma.recurrence.update({ where: { id: t.recurrenceId }, data: { amountCents: v.amountCents } }),
        prisma.transaction.updateMany({
          where: { recurrenceId: t.recurrenceId, status: "PENDING", id: { not: id } },
          data: { amountCents: v.amountCents, expectedAmountCents: v.amountCents },
        }),
      ]);
    }
    res.json(updated);
  }),
);

/** Transferência entre contas (não entra em receitas nem despesas). */
transactionsRouter.post(
  "/transferencia",
  ah(async (req: AuthRequest, res) => {
    const v = transferSchema.parse(req.body);
    await checkAccount(req, v.accountId);
    await checkAccount(req, v.destinationAccountId);
    const t = await prisma.transaction.create({
      data: {
        householdId: hid(req),
        type: "TRANSFER",
        status: "PAID",
        description: v.description || "Transferência",
        amountCents: v.amountCents,
        date: toDate(v.date),
        accountId: v.accountId,
        destinationAccountId: v.destinationAccountId,
        notes: v.notes ?? null,
        createdById: uid(req),
      },
      include: INCLUDE,
    });
    res.status(201).json(t);
  }),
);

transactionsRouter.put(
  "/transferencia/:id",
  ah(async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    const old = await own(req, id);
    if (old.type !== "TRANSFER") throw new HttpError(400, "Não é uma transferência");
    const v = transferSchema.parse(req.body);
    await checkAccount(req, v.accountId);
    await checkAccount(req, v.destinationAccountId);
    const t = await prisma.transaction.update({
      where: { id },
      data: {
        description: v.description || "Transferência",
        amountCents: v.amountCents,
        date: toDate(v.date),
        accountId: v.accountId,
        destinationAccountId: v.destinationAccountId,
        notes: v.notes ?? null,
      },
      include: INCLUDE,
    });
    res.json(t);
  }),
);

/** Exclui um lançamento (ou "pula" uma ocorrência prevista). Empréstimos têm tela própria. */
transactionsRouter.delete(
  "/:id",
  ah(async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    const t = await own(req, id);
    if (t.type === "LOAN_RECEIPT" || t.type === "LOAN_PAYMENT") throw new HttpError(400, "Pagamentos de empréstimo são excluídos na aba Empréstimos");
    await prisma.transaction.delete({ where: { id } });
    if (t.invoiceId) await refreshInvoiceStatus(t.invoiceId);
    res.status(204).end();
  }),
);
