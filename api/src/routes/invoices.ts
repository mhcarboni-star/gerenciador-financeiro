import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hid, uid, type AuthRequest } from "../lib/auth.js";
import { ah, HttpError } from "../lib/http.js";
import { todayIso } from "../lib/schedule.js";
import { refreshInvoiceStatus } from "../lib/invoiceStatus.js";

export const invoicesRouter = Router();

const iso = (d: Date) => d.toISOString().slice(0, 10);

interface Totals {
  invoiceId: string;
  totalCents: bigint;
  projectedTotalCents: bigint;
  paidCents: bigint;
}

/** Situação exibida: paga, fechada (aguardando pagamento) ou aberta (recebendo compras). */
function displayStatus(inv: { status: string; closingDate: Date }, today: string) {
  if (inv.status === "PAID") return "PAID";
  return iso(inv.closingDate) <= today ? "CLOSED" : "OPEN";
}

async function totalsFor(ids: string[]) {
  if (ids.length === 0) return new Map<string, Totals>();
  const rows = await prisma.$queryRaw<Totals[]>`SELECT * FROM invoice_totals WHERE "invoiceId" = ANY(${ids})`;
  return new Map(rows.map((r) => [r.invoiceId, r]));
}

/** Faturas de um cartão, mais recentes primeiro. */
invoicesRouter.get(
  "/card/:cardId",
  ah(async (req: AuthRequest, res) => {
    const card = await prisma.creditCard.findFirst({ where: { id: req.params.cardId as string, householdId: hid(req) } });
    if (!card) throw new HttpError(404, "Cartão não encontrado");
    const invoices = await prisma.creditCardInvoice.findMany({ where: { creditCardId: card.id }, orderBy: { referenceMonth: "desc" } });
    const totals = await totalsFor(invoices.map((i) => i.id));
    const today = todayIso();
    res.json({
      card,
      invoices: invoices.map((i) => {
        const t = totals.get(i.id);
        return {
          id: i.id,
          referenceMonth: iso(i.referenceMonth),
          closingDate: iso(i.closingDate),
          dueDate: iso(i.dueDate),
          status: displayStatus(i, today),
          totalCents: Number(t?.totalCents ?? 0),
          projectedTotalCents: Number(t?.projectedTotalCents ?? 0),
          paidCents: Number(t?.paidCents ?? 0),
        };
      }),
    });
  }),
);

async function ownInvoice(req: AuthRequest, id: string) {
  const inv = await prisma.creditCardInvoice.findFirst({ where: { id, creditCard: { householdId: hid(req) } }, include: { creditCard: true } });
  if (!inv) throw new HttpError(404, "Fatura não encontrada");
  return inv;
}

/** Lançamentos de uma fatura (compras, estornos e pagamentos). */
invoicesRouter.get(
  "/:id",
  ah(async (req: AuthRequest, res) => {
    const inv = await ownInvoice(req, req.params.id as string);
    const [transactions, totals] = await Promise.all([
      prisma.transaction.findMany({
        where: { invoiceId: inv.id },
        include: { category: true, account: { select: { id: true, name: true, color: true } } },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      }),
      totalsFor([inv.id]),
    ]);
    const t = totals.get(inv.id);
    res.json({
      id: inv.id,
      creditCard: inv.creditCard,
      referenceMonth: iso(inv.referenceMonth),
      closingDate: iso(inv.closingDate),
      dueDate: iso(inv.dueDate),
      status: displayStatus(inv, todayIso()),
      totalCents: Number(t?.totalCents ?? 0),
      projectedTotalCents: Number(t?.projectedTotalCents ?? 0),
      paidCents: Number(t?.paidCents ?? 0),
      transactions,
    });
  }),
);

const paySchema = z.object({
  accountId: z.string().min(1, "Escolha a conta"),
  amountCents: z.number().int().positive("O valor precisa ser maior que zero"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
});

/** Paga a fatura (total ou parcial). Quando o pago cobre o total, a fatura fica PAGA. */
invoicesRouter.post(
  "/:id/pagar",
  ah(async (req: AuthRequest, res) => {
    const inv = await ownInvoice(req, req.params.id as string);
    const v = paySchema.parse(req.body);
    const account = await prisma.account.findFirst({ where: { id: v.accountId, householdId: hid(req) } });
    if (!account) throw new HttpError(400, "Conta inválida");
    await prisma.transaction.create({
      data: {
        householdId: hid(req),
        type: "INVOICE_PAYMENT",
        status: "PAID",
        description: `Fatura ${inv.creditCard.name} ${iso(inv.referenceMonth).slice(5, 7)}/${iso(inv.referenceMonth).slice(0, 4)}`,
        amountCents: v.amountCents,
        date: new Date(`${v.date}T00:00:00Z`),
        accountId: account.id,
        invoiceId: inv.id,
        createdById: uid(req),
      },
    });
    await refreshInvoiceStatus(inv.id);
    const t = (await totalsFor([inv.id])).get(inv.id)!;
    const paidOff = Number(t.paidCents) >= Number(t.projectedTotalCents);
    res.status(201).json({ paidOff, paidCents: Number(t.paidCents), totalCents: Number(t.projectedTotalCents) });
  }),
);
