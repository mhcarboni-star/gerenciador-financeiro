

-- CreateTable
CREATE TABLE "BalanceCheckpoint" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "balanceCents" INTEGER NOT NULL,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BalanceCheckpoint_transactionId_key" ON "BalanceCheckpoint"("transactionId");

-- CreateIndex
CREATE INDEX "BalanceCheckpoint_accountId_date_idx" ON "BalanceCheckpoint"("accountId", "date");

-- AddForeignKey
ALTER TABLE "BalanceCheckpoint" ADD CONSTRAINT "BalanceCheckpoint_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceCheckpoint" ADD CONSTRAINT "BalanceCheckpoint_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══════════════ Forma do lançamento: ajuste só em conta, sem mais nada ligado ═══════════════
ALTER TABLE "Transaction" DROP CONSTRAINT "tx_shape_by_type";
ALTER TABLE "Transaction" ADD CONSTRAINT "tx_shape_by_type" CHECK (
  CASE "type"
    WHEN 'INCOME' THEN
      "destinationAccountId" IS NULL AND "loanId" IS NULL
      AND (("accountId" IS NOT NULL AND "creditCardId" IS NULL AND "invoiceId" IS NULL)
        OR ("accountId" IS NULL AND "creditCardId" IS NOT NULL AND "invoiceId" IS NOT NULL))
    WHEN 'EXPENSE' THEN
      "destinationAccountId" IS NULL AND "loanId" IS NULL
      AND (("accountId" IS NOT NULL AND "creditCardId" IS NULL AND "invoiceId" IS NULL)
        OR ("accountId" IS NULL AND "creditCardId" IS NOT NULL AND "invoiceId" IS NOT NULL))
    WHEN 'TRANSFER' THEN
      "accountId" IS NOT NULL AND "destinationAccountId" IS NOT NULL
      AND "accountId" <> "destinationAccountId" AND "loanId" IS NULL
      AND "creditCardId" IS NULL AND "invoiceId" IS NULL AND "categoryId" IS NULL
    WHEN 'INVOICE_PAYMENT' THEN
      "accountId" IS NOT NULL AND "invoiceId" IS NOT NULL AND "loanId" IS NULL
      AND "destinationAccountId" IS NULL AND "categoryId" IS NULL
    WHEN 'LOAN_RECEIPT' THEN
      "accountId" IS NOT NULL AND "loanId" IS NOT NULL
      AND "destinationAccountId" IS NULL AND "creditCardId" IS NULL AND "invoiceId" IS NULL AND "categoryId" IS NULL
      AND "loanInstallmentNumber" IS NULL AND "loanPrincipalCents" IS NULL
    WHEN 'LOAN_PAYMENT' THEN
      "accountId" IS NOT NULL AND "loanId" IS NOT NULL
      AND "destinationAccountId" IS NULL AND "creditCardId" IS NULL AND "invoiceId" IS NULL AND "categoryId" IS NULL
    WHEN 'ADJUSTMENT_IN' THEN
      "accountId" IS NOT NULL AND "status" = 'PAID'
      AND "destinationAccountId" IS NULL AND "creditCardId" IS NULL AND "invoiceId" IS NULL AND "categoryId" IS NULL
      AND "loanId" IS NULL AND "recurrenceId" IS NULL AND "installmentPlanId" IS NULL
    WHEN 'ADJUSTMENT_OUT' THEN
      "accountId" IS NOT NULL AND "status" = 'PAID'
      AND "destinationAccountId" IS NULL AND "creditCardId" IS NULL AND "invoiceId" IS NULL AND "categoryId" IS NULL
      AND "loanId" IS NULL AND "recurrenceId" IS NULL AND "installmentPlanId" IS NULL
    ELSE FALSE
  END
);

-- O lançamento do marco precisa ser um ajuste da mesma conta, na mesma data
CREATE FUNCTION check_checkpoint_tx() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."transactionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Transaction" t WHERE t.id = NEW."transactionId" AND t."accountId" = NEW."accountId"
      AND t.date = NEW.date AND t."type" IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT')) THEN
    RAISE EXCEPTION 'O lançamento do ajuste precisa ser um ajuste da mesma conta e data';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER checkpoint_tx BEFORE INSERT OR UPDATE ON "BalanceCheckpoint"
  FOR EACH ROW EXECUTE FUNCTION check_checkpoint_tx();

-- ═══════════════ Saldo de uma conta em uma data ═══════════════
-- Parte do último marco de saldo até a data (ou do saldo inicial) e soma só o que veio
-- DEPOIS dele: data posterior, ou mesma data mas registrado depois do ajuste.
-- Lançamentos de ajuste nunca entram na soma (o marco já é o valor certo).
CREATE FUNCTION account_balance_on(p_account text, p_date date, p_include_pending boolean)
RETURNS integer LANGUAGE sql STABLE AS $$
  WITH cp AS (
    SELECT c.date, c."balanceCents", c."createdAt"
    FROM "BalanceCheckpoint" c
    WHERE c."accountId" = p_account AND c.date <= p_date
    ORDER BY c.date DESC, c."createdAt" DESC
    LIMIT 1
  )
  SELECT (
    COALESCE((SELECT "balanceCents" FROM cp), (SELECT "initialBalanceCents" FROM "Account" WHERE id = p_account))
    + COALESCE((
      SELECT SUM(CASE
                   WHEN t."type" = 'TRANSFER' AND t."destinationAccountId" = p_account THEN t."amountCents"
                   WHEN t."type" IN ('INCOME', 'LOAN_RECEIPT') THEN t."amountCents"
                   ELSE -t."amountCents"
                 END)
      FROM "Transaction" t
      WHERE (t."accountId" = p_account OR (t."type" = 'TRANSFER' AND t."destinationAccountId" = p_account))
        AND t."type" NOT IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT')
        AND t.date <= p_date
        AND (p_include_pending OR t.status = 'PAID')
        AND (NOT EXISTS (SELECT 1 FROM cp)
             OR t.date > (SELECT date FROM cp)
             OR (t.date = (SELECT date FROM cp) AND t."createdAt" > (SELECT "createdAt" FROM cp)))
    ), 0)
  )::int
$$;

CREATE OR REPLACE VIEW account_balances AS
SELECT
  a.id AS "accountId",
  a."householdId",
  account_balance_on(a.id, 'infinity'::date, false)::bigint AS "balanceCents",
  account_balance_on(a.id, 'infinity'::date, true)::bigint  AS "projectedBalanceCents"
FROM "Account" a;
