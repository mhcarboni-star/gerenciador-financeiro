import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hid, type AuthRequest } from "../lib/auth.js";
import { ah, HttpError } from "../lib/http.js";
import { generateOccurrences, regenerateFuture } from "../lib/recurrenceService.js";
import { addDays, todayIso } from "../lib/schedule.js";

export const recurrencesRouter = Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const schema = z
  .object({
    type: z.enum(["INCOME", "EXPENSE"]),
    description: z.string().trim().min(1, "Informe a descrição").max(120),
    amountCents: z.number().int().positive("O valor precisa ser maior que zero"),
    frequency: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]),
    interval: z.number().int().min(1).max(24).default(1),
    startDate: isoDate,
    endDate: isoDate.nullable().optional(),
    accountId: z.string().nullable().optional(),
    creditCardId: z.string().nullable().optional(),
    categoryId: z.string().nullable().optional(),
    amountIsEstimate: z.boolean().default(false),
    autoMarkPaid: z.boolean().default(false),
  })
  .refine((v) => !(v.amountIsEstimate && v.autoMarkPaid), "Valor estimado precisa de confirmação; desmarque a confirmação automática")
  .refine((v) => !v.endDate || v.endDate >= v.startDate, "A data final deve ser depois do início")
  .refine((v) => !!v.accountId !== !!v.creditCardId, "Escolha uma conta ou um cartão");

const d = (s: string) => new Date(`${s}T00:00:00Z`);

async function checkRefs(req: AuthRequest, v: z.infer<typeof schema>) {
  const householdId = hid(req);
  if (v.accountId && !(await prisma.account.findFirst({ where: { id: v.accountId, householdId } }))) throw new HttpError(400, "Conta inválida");
  if (v.creditCardId && !(await prisma.creditCard.findFirst({ where: { id: v.creditCardId, householdId } }))) throw new HttpError(400, "Cartão inválido");
  if (v.categoryId && !(await prisma.category.findFirst({ where: { id: v.categoryId, householdId, type: v.type } }))) throw new HttpError(400, "Categoria inválida");
}

async function own(req: AuthRequest, id: string) {
  const r = await prisma.recurrence.findFirst({ where: { id, householdId: hid(req) } });
  if (!r) throw new HttpError(404, "Recorrência não encontrada");
  return r;
}

const INCLUDE = {
  category: { select: { id: true, name: true, color: true } },
  account: { select: { id: true, name: true } },
  creditCard: { select: { id: true, name: true } },
} as const;

recurrencesRouter.get(
  "/",
  ah(async (req: AuthRequest, res) => {
    const list = await prisma.recurrence.findMany({
      where: { householdId: hid(req) },
      include: {
        ...INCLUDE,
        transactions: { where: { status: "PENDING" }, orderBy: { date: "asc" }, take: 1, select: { id: true, date: true, amountCents: true } },
      },
      orderBy: [{ active: "desc" }, { description: "asc" }],
    });
    res.json(list.map(({ transactions, ...r }) => ({ ...r, nextPending: transactions[0] ?? null })));
  }),
);

recurrencesRouter.post(
  "/",
  ah(async (req: AuthRequest, res) => {
    const v = schema.parse(req.body);
    await checkRefs(req, v);
    const rec = await prisma.recurrence.create({
      data: {
        ...v,
        householdId: hid(req),
        startDate: d(v.startDate),
        endDate: v.endDate ? d(v.endDate) : null,
        nextDate: d(v.startDate),
        accountId: v.accountId ?? null,
        creditCardId: v.creditCardId ?? null,
      },
    });
    await generateOccurrences(rec.id);
    res.status(201).json(await prisma.recurrence.findUnique({ where: { id: rec.id }, include: INCLUDE }));
  }),
);

/** Atualiza o modelo e refaz as ocorrências futuras ainda não confirmadas. */
recurrencesRouter.put(
  "/:id",
  ah(async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    await own(req, id);
    const v = schema.parse(req.body);
    await checkRefs(req, v);
    await prisma.recurrence.update({
      where: { id },
      data: {
        ...v,
        startDate: d(v.startDate),
        endDate: v.endDate ? d(v.endDate) : null,
        accountId: v.accountId ?? null,
        creditCardId: v.creditCardId ?? null,
        active: true,
      },
    });
    await regenerateFuture(id);
    res.json(await prisma.recurrence.findUnique({ where: { id }, include: INCLUDE }));
  }),
);

/**
 * Encerra a recorrência: para de gerar e remove as ocorrências futuras não confirmadas.
 * Confirmadas e atrasadas ficam no histórico.
 */
recurrencesRouter.post(
  "/:id/encerrar",
  ah(async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    const rec = await own(req, id);
    const today = todayIso();
    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { recurrenceId: id, status: "PENDING", occurrenceDate: { gt: d(today) } } }),
      prisma.recurrence.update({
        where: { id },
        data: {
          active: false,
          endDate: rec.startDate > d(today) ? rec.startDate : d(today),
          nextDate: d(addDays(today, 1)),
        },
      }),
    ]);
    res.json({ ok: true });
  }),
);
