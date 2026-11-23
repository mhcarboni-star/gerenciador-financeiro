-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CHECKING', 'SAVINGS', 'CASH', 'INVESTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER', 'INVOICE_PAYMENT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'CLOSED', 'PAID');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMember" (
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("householdId","userId")
);

-- CreateTable
CREATE TABLE "HouseholdInvite" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'MEMBER',
    "token" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL DEFAULT 'CHECKING',
    "institution" TEXT,
    "initialBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "includeInTotals" BOOLEAN NOT NULL DEFAULT true,
    "ownerId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCard" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "limitCents" INTEGER NOT NULL DEFAULT 0,
    "closingDay" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "paymentAccountId" TEXT,
    "holderId" TEXT,
    "color" TEXT NOT NULL DEFAULT '#334155',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCardInvoice" (
    "id" TEXT NOT NULL,
    "creditCardId" TEXT NOT NULL,
    "referenceMonth" DATE NOT NULL,
    "closingDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCardInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "type" "CategoryType" NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "icon" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PAID',
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "accountId" TEXT,
    "destinationAccountId" TEXT,
    "creditCardId" TEXT,
    "invoiceId" TEXT,
    "categoryId" TEXT,
    "installmentPlanId" TEXT,
    "installmentNumber" INTEGER,
    "recurrenceId" TEXT,
    "goalId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentPlan" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "totalAmountCents" INTEGER NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "firstDate" DATE NOT NULL,
    "accountId" TEXT,
    "creditCardId" TEXT,
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recurrence" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "frequency" "Frequency" NOT NULL DEFAULT 'MONTHLY',
    "interval" INTEGER NOT NULL DEFAULT 1,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "nextDate" DATE NOT NULL,
    "accountId" TEXT,
    "destinationAccountId" TEXT,
    "creditCardId" TEXT,
    "categoryId" TEXT,
    "autoMarkPaid" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "limitCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetCents" INTEGER NOT NULL,
    "initialCents" INTEGER NOT NULL DEFAULT 0,
    "targetDate" DATE,
    "accountId" TEXT,
    "color" TEXT NOT NULL DEFAULT '#0f766e',
    "icon" TEXT,
    "achievedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "HouseholdMember_userId_idx" ON "HouseholdMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdInvite_token_key" ON "HouseholdInvite"("token");

-- CreateIndex
CREATE INDEX "HouseholdInvite_householdId_idx" ON "HouseholdInvite"("householdId");

-- CreateIndex
CREATE INDEX "HouseholdInvite_email_idx" ON "HouseholdInvite"("email");

-- CreateIndex
CREATE INDEX "Account_householdId_idx" ON "Account"("householdId");

-- CreateIndex
CREATE INDEX "CreditCard_householdId_idx" ON "CreditCard"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCardInvoice_creditCardId_referenceMonth_key" ON "CreditCardInvoice"("creditCardId", "referenceMonth");

-- CreateIndex
CREATE INDEX "Category_householdId_idx" ON "Category"("householdId");

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE INDEX "Transaction_householdId_date_idx" ON "Transaction"("householdId", "date");

-- CreateIndex
CREATE INDEX "Transaction_accountId_date_idx" ON "Transaction"("accountId", "date");

-- CreateIndex
CREATE INDEX "Transaction_destinationAccountId_idx" ON "Transaction"("destinationAccountId");

-- CreateIndex
CREATE INDEX "Transaction_invoiceId_idx" ON "Transaction"("invoiceId");

-- CreateIndex
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_installmentPlanId_installmentNumber_key" ON "Transaction"("installmentPlanId", "installmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_recurrenceId_date_key" ON "Transaction"("recurrenceId", "date");

-- CreateIndex
CREATE INDEX "InstallmentPlan_householdId_idx" ON "InstallmentPlan"("householdId");

-- CreateIndex
CREATE INDEX "Recurrence_householdId_active_nextDate_idx" ON "Recurrence"("householdId", "active", "nextDate");

-- CreateIndex
CREATE INDEX "Budget_householdId_month_idx" ON "Budget"("householdId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_categoryId_month_key" ON "Budget"("categoryId", "month");

-- CreateIndex
CREATE INDEX "Goal_householdId_idx" ON "Goal"("householdId");

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdInvite" ADD CONSTRAINT "HouseholdInvite_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdInvite" ADD CONSTRAINT "HouseholdInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardInvoice" ADD CONSTRAINT "CreditCardInvoice_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "CreditCardInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_installmentPlanId_fkey" FOREIGN KEY ("installmentPlanId") REFERENCES "InstallmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "Recurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recurrence" ADD CONSTRAINT "Recurrence_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recurrence" ADD CONSTRAINT "Recurrence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recurrence" ADD CONSTRAINT "Recurrence_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recurrence" ADD CONSTRAINT "Recurrence_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recurrence" ADD CONSTRAINT "Recurrence_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════ Regras de integridade (não expressáveis no Prisma) ═══════════════

-- Valores
ALTER TABLE "Transaction"     ADD CONSTRAINT "tx_amount_positive"       CHECK ("amountCents" > 0);
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "plan_amount_positive"     CHECK ("totalAmountCents" > 0);
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "plan_count_range"         CHECK ("installmentCount" BETWEEN 2 AND 420);
ALTER TABLE "Recurrence"      ADD CONSTRAINT "rec_amount_positive"      CHECK ("amountCents" > 0);
ALTER TABLE "Recurrence"      ADD CONSTRAINT "rec_interval_positive"    CHECK ("interval" >= 1);
ALTER TABLE "Recurrence"      ADD CONSTRAINT "rec_dates"                CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "Budget"          ADD CONSTRAINT "budget_limit_positive"    CHECK ("limitCents" > 0);
ALTER TABLE "Budget"          ADD CONSTRAINT "budget_month_first_day"   CHECK (EXTRACT(DAY FROM "month") = 1);
ALTER TABLE "Goal"            ADD CONSTRAINT "goal_target_positive"     CHECK ("targetCents" > 0);
ALTER TABLE "Goal"            ADD CONSTRAINT "goal_initial_nonnegative" CHECK ("initialCents" >= 0);
ALTER TABLE "CreditCard"      ADD CONSTRAINT "card_limit_nonnegative"   CHECK ("limitCents" >= 0);
ALTER TABLE "CreditCard"      ADD CONSTRAINT "card_days_range"          CHECK ("closingDay" BETWEEN 1 AND 31 AND "dueDay" BETWEEN 1 AND 31);
ALTER TABLE "CreditCardInvoice" ADD CONSTRAINT "invoice_month_first_day" CHECK (EXTRACT(DAY FROM "referenceMonth") = 1);

-- Parcelas: número e plano andam juntos
ALTER TABLE "Transaction" ADD CONSTRAINT "tx_installment_pair" CHECK (
  ("installmentPlanId" IS NULL) = ("installmentNumber" IS NULL)
  AND ("installmentNumber" IS NULL OR "installmentNumber" >= 1)
);

-- Forma do lançamento conforme o tipo
ALTER TABLE "Transaction" ADD CONSTRAINT "tx_shape_by_type" CHECK (
  CASE "type"
    WHEN 'INCOME' THEN
      "destinationAccountId" IS NULL
      AND (("accountId" IS NOT NULL AND "creditCardId" IS NULL AND "invoiceId" IS NULL)
        OR ("accountId" IS NULL AND "creditCardId" IS NOT NULL AND "invoiceId" IS NOT NULL))
    WHEN 'EXPENSE' THEN
      "destinationAccountId" IS NULL
      AND (("accountId" IS NOT NULL AND "creditCardId" IS NULL AND "invoiceId" IS NULL)
        OR ("accountId" IS NULL AND "creditCardId" IS NOT NULL AND "invoiceId" IS NOT NULL))
    WHEN 'TRANSFER' THEN
      "accountId" IS NOT NULL AND "destinationAccountId" IS NOT NULL
      AND "accountId" <> "destinationAccountId"
      AND "creditCardId" IS NULL AND "invoiceId" IS NULL AND "categoryId" IS NULL
    WHEN 'INVOICE_PAYMENT' THEN
      "accountId" IS NOT NULL AND "invoiceId" IS NOT NULL
      AND "destinationAccountId" IS NULL AND "categoryId" IS NULL
  END
);

-- Recorrência segue as mesmas regras (sem fatura: ela é resolvida na geração)
ALTER TABLE "Recurrence" ADD CONSTRAINT "rec_shape_by_type" CHECK (
  CASE "type"
    WHEN 'INCOME'   THEN "destinationAccountId" IS NULL AND (("accountId" IS NULL) <> ("creditCardId" IS NULL))
    WHEN 'EXPENSE'  THEN "destinationAccountId" IS NULL AND (("accountId" IS NULL) <> ("creditCardId" IS NULL))
    WHEN 'TRANSFER' THEN "accountId" IS NOT NULL AND "destinationAccountId" IS NOT NULL
                         AND "accountId" <> "destinationAccountId" AND "creditCardId" IS NULL
    ELSE FALSE -- pagamento de fatura não é recorrência
  END
);

ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "plan_one_source" CHECK (("accountId" IS NULL) <> ("creditCardId" IS NULL));

-- Coerência entre lançamento e cartão/fatura; e entre categoria pai/filha
CREATE FUNCTION check_transaction_refs() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  inv_card text;
BEGIN
  IF NEW."invoiceId" IS NOT NULL THEN
    SELECT "creditCardId" INTO inv_card FROM "CreditCardInvoice" WHERE id = NEW."invoiceId";
    IF NEW."type" <> 'INVOICE_PAYMENT' AND inv_card IS DISTINCT FROM NEW."creditCardId" THEN
      RAISE EXCEPTION 'A fatura não pertence ao cartão do lançamento';
    END IF;
  END IF;
  IF NEW."categoryId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Category" c WHERE c.id = NEW."categoryId" AND c."householdId" = NEW."householdId"
      AND c."type"::text = NEW."type"::text
  ) THEN
    RAISE EXCEPTION 'Categoria inválida para este lançamento (grupo ou tipo diferente)';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER transaction_refs BEFORE INSERT OR UPDATE ON "Transaction"
  FOR EACH ROW EXECUTE FUNCTION check_transaction_refs();

CREATE FUNCTION check_category_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."parentId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Category" p WHERE p.id = NEW."parentId" AND p."parentId" IS NULL
      AND p."householdId" = NEW."householdId" AND p."type" = NEW."type"
  ) THEN
    RAISE EXCEPTION 'Subcategoria precisa de uma categoria principal do mesmo grupo e tipo (apenas 1 nível)';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER category_parent BEFORE INSERT OR UPDATE ON "Category"
  FOR EACH ROW EXECUTE FUNCTION check_category_parent();

-- Nome de categoria único por grupo/tipo/nível (NULLS NOT DISTINCT: PostgreSQL 15+)
CREATE UNIQUE INDEX "Category_unique_name" ON "Category" ("householdId", "type", "parentId", lower("name")) NULLS NOT DISTINCT;
-- Um usuário não recebe dois convites pendentes para o mesmo grupo
CREATE UNIQUE INDEX "HouseholdInvite_pending" ON "HouseholdInvite" ("householdId", lower("email")) WHERE "acceptedAt" IS NULL;

-- ═══════════════ Views de leitura ═══════════════

-- Saldo das contas (somente lançamentos efetivados até hoje e previstos separados)
CREATE VIEW account_balances AS
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
         CASE WHEN "type" = 'INCOME' THEN "amountCents" ELSE -"amountCents" END AS delta
  FROM "Transaction" WHERE "accountId" IS NOT NULL
  UNION ALL
  SELECT "destinationAccountId", status, "amountCents"
  FROM "Transaction" WHERE "type" = 'TRANSFER'
) m ON m.acc = a.id
GROUP BY a.id;

-- Total de cada fatura: compras − estornos − pagamentos
CREATE VIEW invoice_totals AS
SELECT
  i.id AS "invoiceId",
  i."creditCardId",
  i."referenceMonth",
  COALESCE(SUM(t."amountCents") FILTER (WHERE t."type" = 'EXPENSE'), 0)
    - COALESCE(SUM(t."amountCents") FILTER (WHERE t."type" = 'INCOME'), 0) AS "totalCents",
  COALESCE(SUM(t."amountCents") FILTER (WHERE t."type" = 'INVOICE_PAYMENT' AND t.status = 'PAID'), 0) AS "paidCents"
FROM "CreditCardInvoice" i
LEFT JOIN "Transaction" t ON t."invoiceId" = i.id
GROUP BY i.id;
