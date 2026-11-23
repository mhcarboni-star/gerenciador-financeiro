-- CreateEnum
CREATE TYPE "LoanInterestType" AS ENUM ('NONE', 'PRICE', 'MONTHLY_ON_BALANCE');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'PAID_OFF', 'CANCELLED');



-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "loanId" TEXT,
ADD COLUMN     "loanInstallmentNumber" INTEGER,
ADD COLUMN     "loanInterestCents" INTEGER,
ADD COLUMN     "loanPrincipalCents" INTEGER;

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lender" TEXT,
    "principalCents" INTEGER NOT NULL,
    "interestType" "LoanInterestType" NOT NULL DEFAULT 'NONE',
    "monthlyRate" DECIMAL(9,6),
    "installmentCount" INTEGER,
    "startDate" DATE NOT NULL,
    "firstDueDate" DATE,
    "receivedAccountId" TEXT,
    "paymentAccountId" TEXT,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "paidOffAt" DATE,
    "color" TEXT NOT NULL DEFAULT '#b45309',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Loan_householdId_status_idx" ON "Loan"("householdId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_loanId_loanInstallmentNumber_key" ON "Transaction"("loanId", "loanInstallmentNumber");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_receivedAccountId_fkey" FOREIGN KEY ("receivedAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ═══════════════ Regras do empréstimo ═══════════════
ALTER TABLE "Loan" ADD CONSTRAINT "loan_principal_positive" CHECK ("principalCents" > 0);
ALTER TABLE "Loan" ADD CONSTRAINT "loan_rate_range"         CHECK ("monthlyRate" IS NULL OR "monthlyRate" BETWEEN 0 AND 1);
ALTER TABLE "Loan" ADD CONSTRAINT "loan_installments_range" CHECK ("installmentCount" IS NULL OR "installmentCount" BETWEEN 1 AND 600);
ALTER TABLE "Loan" ADD CONSTRAINT "loan_due_after_start"    CHECK ("firstDueDate" IS NULL OR "firstDueDate" >= "startDate");
ALTER TABLE "Loan" ADD CONSTRAINT "loan_plan_pair"          CHECK (("installmentCount" IS NULL) = ("firstDueDate" IS NULL));
ALTER TABLE "Loan" ADD CONSTRAINT "loan_paid_off_date"      CHECK (("status" = 'PAID_OFF') = ("paidOffAt" IS NOT NULL));
ALTER TABLE "Loan" ADD CONSTRAINT "loan_rate_by_type" CHECK (
  CASE "interestType"
    WHEN 'NONE'               THEN COALESCE("monthlyRate", 0) = 0
    WHEN 'PRICE'              THEN "monthlyRate" IS NOT NULL AND "installmentCount" IS NOT NULL
    WHEN 'MONTHLY_ON_BALANCE' THEN "monthlyRate" > 0
    ELSE FALSE
  END
);

-- ═══════════════ Lançamentos: forma por tipo (agora com empréstimos) ═══════════════
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
    ELSE FALSE
  END
);

-- Divisão do pagamento: amortização + juros = valor; juros nunca negativos
ALTER TABLE "Transaction" ADD CONSTRAINT "tx_loan_split" CHECK (
  ("loanPrincipalCents" IS NULL) = ("loanInterestCents" IS NULL)
  AND ("loanInterestCents" IS NULL OR ("loanInterestCents" >= 0 AND "loanPrincipalCents" + "loanInterestCents" = "amountCents"))
);
ALTER TABLE "Transaction" ADD CONSTRAINT "tx_loan_installment_positive" CHECK ("loanInstallmentNumber" IS NULL OR "loanInstallmentNumber" >= 1);

-- Empréstimo do mesmo grupo do lançamento
CREATE FUNCTION check_transaction_loan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."loanId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Loan" WHERE id = NEW."loanId" AND "householdId" = NEW."householdId") THEN
    RAISE EXCEPTION 'Empréstimo não pertence a este grupo';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER transaction_loan BEFORE INSERT OR UPDATE ON "Transaction"
  FOR EACH ROW EXECUTE FUNCTION check_transaction_loan();

-- ═══════════════ Views ═══════════════

-- Saldo das contas: entrada do empréstimo soma; pagamento do empréstimo subtrai (como as demais saídas)
CREATE OR REPLACE VIEW account_balances AS
SELECT
  a.id AS "accountId",
  a."householdId",
  a."initialBalanceCents"
    + COALESCE(SUM(m.delta) FILTER (WHERE m.status = 'PAID'), 0) AS "balanceCents",
  a."initialBalanceCents"
    + COALESCE(SUM(m.delta), 0) AS "projectedBalanceCents"
FROM "Account" a
LEFT JOIN (
  SELECT "accountId" AS acc, status,
         CASE WHEN "type" IN ('INCOME', 'LOAN_RECEIPT') THEN "amountCents" ELSE -"amountCents" END AS delta
  FROM "Transaction" WHERE "accountId" IS NOT NULL
  UNION ALL
  SELECT "destinationAccountId", status, "amountCents"
  FROM "Transaction" WHERE "type" = 'TRANSFER'
) m ON m.acc = a.id
GROUP BY a.id;

-- Situação de cada empréstimo. Saldo devedor hoje = saldo de principal + juros acumulados
-- desde o último pagamento (compostos, pró-rata por dia, mês de 30 dias).
CREATE VIEW loan_balances AS
WITH agg AS (
  SELECT
    l.id,
    COALESCE(SUM(t."loanPrincipalCents") FILTER (WHERE t."type" = 'LOAN_PAYMENT' AND t.status = 'PAID'), 0) AS amortized,
    COALESCE(SUM(t."amountCents")        FILTER (WHERE t."type" = 'LOAN_PAYMENT' AND t.status = 'PAID'), 0) AS paid,
    COALESCE(SUM(t."loanInterestCents")  FILTER (WHERE t."type" = 'LOAN_PAYMENT' AND t.status = 'PAID'), 0) AS interest_paid,
    COUNT(*) FILTER (WHERE t."type" = 'LOAN_PAYMENT' AND t.status = 'PAID' AND t."loanInstallmentNumber" IS NOT NULL) AS paid_inst,
    COUNT(*) FILTER (WHERE t."type" = 'LOAN_PAYMENT' AND t.status = 'PENDING') AS pending_inst,
    COALESCE(SUM(t."amountCents") FILTER (WHERE t."type" = 'LOAN_PAYMENT' AND t.status = 'PENDING'), 0) AS pending_amount,
    MIN(t.date) FILTER (WHERE t."type" = 'LOAN_PAYMENT' AND t.status = 'PENDING') AS next_due,
    MAX(t.date) FILTER (WHERE t."type" = 'LOAN_PAYMENT' AND t.status = 'PAID') AS last_paid
  FROM "Loan" l
  LEFT JOIN "Transaction" t ON t."loanId" = l.id
  GROUP BY l.id
)
SELECT
  l.id AS "loanId",
  l."householdId",
  l.status,
  l."principalCents",
  GREATEST(l."principalCents" - a.amortized, 0)::int AS "principalOutstandingCents",
  CASE WHEN l."interestType" = 'NONE' OR l.status <> 'ACTIVE' OR l."principalCents" - a.amortized <= 0 THEN 0
       ELSE ROUND((l."principalCents" - a.amortized)
              * (POWER(1 + l."monthlyRate", GREATEST(CURRENT_DATE - COALESCE(a.last_paid, l."startDate"), 0) / 30.0) - 1))::int
  END AS "accruedInterestCents",
  a.paid::int          AS "totalPaidCents",
  a.interest_paid::int AS "interestPaidCents",
  a.paid_inst::int     AS "paidInstallments",
  a.pending_inst::int  AS "pendingInstallments",
  a.pending_amount::int AS "pendingAmountCents",
  a.next_due           AS "nextDueDate",
  a.last_paid          AS "lastPaymentDate"
FROM "Loan" l JOIN agg a ON a.id = l.id;
