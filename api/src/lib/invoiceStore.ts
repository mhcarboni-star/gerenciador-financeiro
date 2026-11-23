import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { invoiceForPurchase } from "./invoices.js";

type Db = Prisma.TransactionClient | typeof prisma;
const d = (s: string) => new Date(`${s}T00:00:00Z`);

/** Fatura em que cai uma compra no cartão; cria se ainda não existir. */
export async function getOrCreateInvoice(db: Db, card: { id: string; closingDay: number; dueDay: number }, purchaseDate: string) {
  const p = invoiceForPurchase(purchaseDate, card.closingDay, card.dueDay);
  return db.creditCardInvoice.upsert({
    where: { creditCardId_referenceMonth: { creditCardId: card.id, referenceMonth: d(p.referenceMonth) } },
    create: { creditCardId: card.id, referenceMonth: d(p.referenceMonth), closingDate: d(p.closingDate), dueDate: d(p.dueDate) },
    update: {},
  });
}
