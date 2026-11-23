import { prisma } from "./prisma.js";

/** Marca a fatura como paga (ou reabre) conforme o total pago cobre o total da fatura. */
export async function refreshInvoiceStatus(invoiceId: string) {
  const [t] = await prisma.$queryRaw<{ projectedTotalCents: bigint; paidCents: bigint }[]>`
    SELECT "projectedTotalCents", "paidCents" FROM invoice_totals WHERE "invoiceId" = ${invoiceId}`;
  if (!t) return;
  const paid = Number(t.paidCents) >= Number(t.projectedTotalCents) && Number(t.paidCents) > 0;
  await prisma.creditCardInvoice.update({ where: { id: invoiceId }, data: { status: paid ? "PAID" : "OPEN" } });
}
