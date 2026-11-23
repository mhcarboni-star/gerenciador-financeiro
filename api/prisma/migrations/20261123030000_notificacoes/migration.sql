-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('DUE_ITEMS');

-- AlterTable
ALTER TABLE "HouseholdMember" ADD COLUMN     "notifyDueItems" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationSettings" (
    "userId" TEXT NOT NULL,
    "dueItemsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "includeOverdue" BOOLEAN NOT NULL DEFAULT true,
    "sendHour" INTEGER NOT NULL DEFAULT 8,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "referenceDate" DATE NOT NULL,
    "transactionCount" INTEGER NOT NULL,
    "devicesReached" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_userId_kind_referenceDate_key" ON "NotificationLog"("userId", "kind", "referenceDate");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "NotificationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ═══════════════ Regras ═══════════════
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "notif_hour_range"      CHECK ("sendHour" BETWEEN 0 AND 23);
ALTER TABLE "NotificationSettings" ADD CONSTRAINT "notif_timezone_format" CHECK ("timezone" ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$');
ALTER TABLE "PushSubscription"     ADD CONSTRAINT "push_failures_nonneg"  CHECK ("failureCount" >= 0);
ALTER TABLE "PushSubscription"     ADD CONSTRAINT "push_endpoint_https"   CHECK ("endpoint" LIKE 'https://%');
ALTER TABLE "NotificationLog"      ADD CONSTRAINT "notif_counts_nonneg"   CHECK ("transactionCount" >= 0 AND "devicesReached" >= 0);

-- Lançamentos pendentes até uma data, para os grupos em que o usuário quer aviso.
-- Usado pela tarefa de avisos: SELECT * FROM due_items_for_user('<userId>', '<hoje no fuso dele>');
CREATE FUNCTION due_items_for_user(p_user text, p_today date)
RETURNS TABLE (
  "transactionId" text, "householdId" text, "householdName" text, "type" "TransactionType",
  description text, "amountCents" int, date date, overdue boolean
) LANGUAGE sql STABLE AS $$
  SELECT t.id, t."householdId", h.name, t."type", t.description, t."amountCents", t.date, t.date < p_today
  FROM "Transaction" t
  JOIN "HouseholdMember" m ON m."householdId" = t."householdId" AND m."userId" = p_user AND m."notifyDueItems"
  JOIN "Household" h ON h.id = t."householdId"
  WHERE t.status = 'PENDING' AND t.date <= p_today
  ORDER BY t.date, t.description
$$;
