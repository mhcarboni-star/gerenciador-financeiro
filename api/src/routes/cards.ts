import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hid, type AuthRequest } from "../lib/auth.js";
import { ah, HttpError } from "../lib/http.js";
import { invoiceForPurchase } from "../lib/invoices.js";

export const cardsRouter = Router();

const day = z.number().int().min(1, "Dia entre 1 e 31").max(31, "Dia entre 1 e 31");
const schema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(60),
  brand: z.string().trim().max(30).nullable().optional(),
  limitCents: z.number().int().min(0),
  closingDay: day,
  dueDay: day,
  paymentAccountId: z.string().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida").optional(),
});

async function own(req: AuthRequest, id: string) {
  const c = await prisma.creditCard.findFirst({ where: { id, householdId: hid(req) } });
  if (!c) throw new HttpError(404, "Cartão não encontrado");
  return c;
}

async function checkAccount(req: AuthRequest, accountId?: string | null) {
  if (!accountId) return;
  const a = await prisma.account.findFirst({ where: { id: accountId, householdId: hid(req) } });
  if (!a) throw new HttpError(400, "Conta de pagamento inválida");
}

const today = () => new Date().toISOString().slice(0, 10);

interface InvoiceRow {
  invoiceId: string;
  creditCardId: string;
  referenceMonth: Date;
  totalCents: bigint;
  projectedTotalCents: bigint;
  paidCents: bigint;
}

/**
 * Cartões com limite usado/disponível e a fatura atual (a que recebe compras feitas hoje).
 * Limite usado = soma do que falta pagar nas faturas ainda não quitadas (inclui previstos).
 */
cardsRouter.get(
  "/",
  ah(async (req: AuthRequest, res) => {
    const householdId = hid(req);
    const cards = await prisma.creditCard.findMany({
      where: { householdId, ...(req.query.arquivados === "1" ? {} : { archivedAt: null }) },
      include: { paymentAccount: { select: { id: true, name: true } } },
      orderBy: [{ archivedAt: "asc" }, { createdAt: "asc" }],
    });
    const rows = await prisma.$queryRaw<(InvoiceRow & { status: string; closingDate: Date; dueDate: Date })[]>`
      SELECT t.*, i.status, i."closingDate", i."dueDate"
      FROM invoice_totals t JOIN "CreditCardInvoice" i ON i.id = t."invoiceId"
      JOIN "CreditCard" c ON c.id = t."creditCardId"
      WHERE c."householdId" = ${householdId}`;

    res.json(
      cards.map((c) => {
        const mine = rows.filter((r) => r.creditCardId === c.id);
        const used = mine
          .filter((r) => r.status !== "PAID")
          .reduce((s, r) => s + Math.max(Number(r.projectedTotalCents) - Number(r.paidCents), 0), 0);
        const p = invoiceForPurchase(today(), c.closingDay, c.dueDay);
        const cur = mine.find((r) => r.referenceMonth.toISOString().slice(0, 10) === p.referenceMonth);
        return {
          ...c,
          usedCents: used,
          availableCents: c.limitCents - used,
          currentInvoice: {
            id: cur?.invoiceId ?? null,
            referenceMonth: p.referenceMonth,
            closingDate: p.closingDate,
            dueDate: p.dueDate,
            totalCents: Number(cur?.totalCents ?? 0),
            projectedTotalCents: Number(cur?.projectedTotalCents ?? 0),
          },
        };
      }),
    );
  }),
);

cardsRouter.post(
  "/",
  ah(async (req: AuthRequest, res) => {
    const data = schema.parse(req.body);
    await checkAccount(req, data.paymentAccountId);
    res.status(201).json(await prisma.creditCard.create({ data: { ...data, householdId: hid(req) } }));
  }),
);

cardsRouter.put(
  "/:id",
  ah(async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    await own(req, id);
    const data = schema.parse(req.body);
    await checkAccount(req, data.paymentAccountId);
    res.json(await prisma.creditCard.update({ where: { id }, data }));
  }),
);

cardsRouter.delete(
  "/:id",
  ah(async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    await own(req, id);
    const used = await prisma.transaction.count({ where: { creditCardId: id } });
    if (used > 0) {
      await prisma.creditCard.update({ where: { id }, data: { archivedAt: new Date() } });
      return res.json({ archived: true });
    }
    await prisma.creditCard.delete({ where: { id } });
    res.json({ archived: false });
  }),
);

cardsRouter.post(
  "/:id/reativar",
  ah(async (req: AuthRequest, res) => {
    const id = req.params.id as string;
    await own(req, id);
    res.json(await prisma.creditCard.update({ where: { id }, data: { archivedAt: null } }));
  }),
);
