-- DropIndex
DROP INDEX "Transaction_recurrenceId_date_key";

-- AlterTable
ALTER TABLE "Recurrence" ADD COLUMN     "amountIsEstimate" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "expectedAmountCents" INTEGER,
ADD COLUMN     "occurrenceDate" DATE;

-- CreateIndex
CREATE INDEX "Transaction_householdId_status_date_idx" ON "Transaction"("householdId", "status", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_recurrenceId_occurrenceDate_key" ON "Transaction"("recurrenceId", "occurrenceDate");


-- ═══════════════ Regras ═══════════════

-- Ocorrência gerada por recorrência sempre tem data programada
ALTER TABLE "Transaction" ADD CONSTRAINT "tx_occurrence_date" CHECK ("recurrenceId" IS NULL OR "occurrenceDate" IS NOT NULL);
ALTER TABLE "Transaction" ADD CONSTRAINT "tx_expected_positive" CHECK ("expectedAmountCents" IS NULL OR "expectedAmountCents" > 0);
-- Valor estimado precisa de confirmação: não pode ser gerado já como pago
ALTER TABLE "Recurrence" ADD CONSTRAINT "rec_estimate_needs_confirmation" CHECK (NOT ("amountIsEstimate" AND "autoMarkPaid"));

-- ═══════════════ Views ═══════════════

-- Faturas: separa o que já foi confirmado do que ainda é previsão (ex.: assinatura recorrente no cartão)
DROP VIEW invoice_totals;
CREATE VIEW invoice_totals AS
SELECT
  i.id AS "invoiceId",
  i."creditCardId",
  i."referenceMonth",
  COALESCE(SUM(t."amountCents") FILTER (WHERE t."type" = 'EXPENSE' AND t.status = 'PAID'), 0)
    - COALESCE(SUM(t."amountCents") FILTER (WHERE t."type" = 'INCOME' AND t.status = 'PAID'), 0) AS "totalCents",
  COALESCE(SUM(t."amountCents") FILTER (WHERE t."type" = 'EXPENSE'), 0)
    - COALESCE(SUM(t."amountCents") FILTER (WHERE t."type" = 'INCOME'), 0) AS "projectedTotalCents",
  COALESCE(SUM(t."amountCents") FILTER (WHERE t."type" = 'INVOICE_PAYMENT' AND t.status = 'PAID'), 0) AS "paidCents"
FROM "CreditCardInvoice" i
LEFT JOIN "Transaction" t ON t."invoiceId" = i.id
GROUP BY i.id;

-- Previsto × realizado das ocorrências de recorrências já confirmadas
CREATE VIEW recurrence_variance AS
SELECT
  t.id AS "transactionId",
  t."householdId",
  t."recurrenceId",
  t."occurrenceDate",
  t.date AS "paidDate",
  t."expectedAmountCents",
  t."amountCents",
  t."amountCents" - t."expectedAmountCents" AS "differenceCents"
FROM "Transaction" t
WHERE t."recurrenceId" IS NOT NULL AND t.status = 'PAID' AND t."expectedAmountCents" IS NOT NULL;
