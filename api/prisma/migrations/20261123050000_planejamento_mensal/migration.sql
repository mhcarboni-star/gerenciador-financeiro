-- CreateTable
CREATE TABLE "MonthPlan" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "savingsGoalCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthPlan_householdId_month_key" ON "MonthPlan"("householdId", "month");

-- AddForeignKey
ALTER TABLE "MonthPlan" ADD CONSTRAINT "MonthPlan_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "MonthPlan" ADD CONSTRAINT "plan_month_first_day" CHECK (EXTRACT(DAY FROM "month") = 1);
ALTER TABLE "MonthPlan" ADD CONSTRAINT "plan_savings_nonneg"  CHECK ("savingsGoalCents" >= 0);
