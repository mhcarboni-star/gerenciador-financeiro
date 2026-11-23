-- DropIndex
DROP INDEX "Budget_categoryId_month_key";

-- DropIndex
DROP INDEX "MonthPlan_householdId_month_key";

-- AlterTable
ALTER TABLE "Budget" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "InstallmentPlan" ADD COLUMN     "responsibleId" TEXT;

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "responsibleId" TEXT;

-- AlterTable
ALTER TABLE "MonthPlan" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Recurrence" ADD COLUMN     "responsibleId" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "responsibleId" TEXT;

-- CreateIndex
CREATE INDEX "MonthPlan_householdId_month_idx" ON "MonthPlan"("householdId", "month");

-- CreateIndex
CREATE INDEX "Transaction_householdId_responsibleId_date_idx" ON "Transaction"("householdId", "responsibleId", "date");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recurrence" ADD CONSTRAINT "Recurrence_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthPlan" ADD CONSTRAINT "MonthPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ═══════════════ Dados existentes ═══════════════
-- Lançamentos: responsável = quem cadastrou
UPDATE "Transaction" SET "responsibleId" = "createdById" WHERE "responsibleId" IS NULL AND "createdById" IS NOT NULL;
-- Modelos, planos e limites antigos ficam com o dono do grupo
UPDATE "Recurrence" r SET "responsibleId" = m."userId" FROM "HouseholdMember" m WHERE m."householdId" = r."householdId" AND m.role = 'OWNER' AND r."responsibleId" IS NULL;
UPDATE "InstallmentPlan" r SET "responsibleId" = m."userId" FROM "HouseholdMember" m WHERE m."householdId" = r."householdId" AND m.role = 'OWNER' AND r."responsibleId" IS NULL;
UPDATE "Loan" r SET "responsibleId" = m."userId" FROM "HouseholdMember" m WHERE m."householdId" = r."householdId" AND m.role = 'OWNER' AND r."responsibleId" IS NULL;
UPDATE "MonthPlan" r SET "userId" = m."userId" FROM "HouseholdMember" m WHERE m."householdId" = r."householdId" AND m.role = 'OWNER' AND r."userId" IS NULL;
UPDATE "Budget" r SET "userId" = m."userId" FROM "HouseholdMember" m WHERE m."householdId" = r."householdId" AND m.role = 'OWNER' AND r."userId" IS NULL;
-- Lançamentos gerados por recorrência/parcelamento/empréstimo sem responsável herdam do modelo
UPDATE "Transaction" t SET "responsibleId" = r."responsibleId" FROM "Recurrence" r WHERE t."recurrenceId" = r.id AND t."responsibleId" IS NULL;
UPDATE "Transaction" t SET "responsibleId" = r."responsibleId" FROM "InstallmentPlan" r WHERE t."installmentPlanId" = r.id AND t."responsibleId" IS NULL;
UPDATE "Transaction" t SET "responsibleId" = r."responsibleId" FROM "Loan" r WHERE t."loanId" = r.id AND t."responsibleId" IS NULL;

-- ═══════════════ Unicidade (null = Família conta como um "dono") ═══════════════
CREATE UNIQUE INDEX "MonthPlan_unique_owner" ON "MonthPlan" ("householdId", month, "userId") NULLS NOT DISTINCT;
CREATE UNIQUE INDEX "Budget_unique_owner" ON "Budget" ("categoryId", month, "userId") NULLS NOT DISTINCT;

-- ═══════════════ Responsável precisa ser membro do grupo ═══════════════
CREATE FUNCTION check_member(p_household text, p_user text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_user IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "HouseholdMember" WHERE "householdId" = p_household AND "userId" = p_user) THEN
    RAISE EXCEPTION 'O responsável precisa ser membro do grupo';
  END IF;
END $$;

CREATE FUNCTION check_responsible() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM check_member(NEW."householdId", NEW."responsibleId");
  RETURN NEW;
END $$;
CREATE TRIGGER transaction_responsible BEFORE INSERT OR UPDATE OF "responsibleId" ON "Transaction" FOR EACH ROW EXECUTE FUNCTION check_responsible();
CREATE TRIGGER recurrence_responsible BEFORE INSERT OR UPDATE OF "responsibleId" ON "Recurrence" FOR EACH ROW EXECUTE FUNCTION check_responsible();
CREATE TRIGGER installment_responsible BEFORE INSERT OR UPDATE OF "responsibleId" ON "InstallmentPlan" FOR EACH ROW EXECUTE FUNCTION check_responsible();
CREATE TRIGGER loan_responsible BEFORE INSERT OR UPDATE OF "responsibleId" ON "Loan" FOR EACH ROW EXECUTE FUNCTION check_responsible();

CREATE FUNCTION check_plan_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM check_member(NEW."householdId", NEW."userId");
  RETURN NEW;
END $$;
CREATE TRIGGER month_plan_owner BEFORE INSERT OR UPDATE OF "userId" ON "MonthPlan" FOR EACH ROW EXECUTE FUNCTION check_plan_owner();
CREATE TRIGGER budget_owner BEFORE INSERT OR UPDATE OF "userId" ON "Budget" FOR EACH ROW EXECUTE FUNCTION check_plan_owner();
