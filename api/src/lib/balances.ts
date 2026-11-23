import { prisma } from "./prisma.js";

/** Saldo efetivado de uma conta ao fim de uma data, respeitando os ajustes de saldo. */
export async function balanceOn(accountId: string, date: string) {
  const [r] = await prisma.$queryRaw<{ v: number }[]>`SELECT account_balance_on(${accountId}, ${date}::date, false) AS v`;
  return Number(r.v);
}

/** Último ajuste de saldo de cada conta do grupo. */
export async function latestCheckpoints(householdId: string) {
  const rows = await prisma.$queryRaw<{ accountId: string; date: Date; balanceCents: number; createdAt: Date }[]>`
    SELECT DISTINCT ON (c."accountId") c."accountId", c.date, c."balanceCents", c."createdAt"
    FROM "BalanceCheckpoint" c JOIN "Account" a ON a.id = c."accountId"
    WHERE a."householdId" = ${householdId}
    ORDER BY c."accountId", c.date DESC, c."createdAt" DESC`;
  return new Map(rows.map((r) => [r.accountId, r]));
}

/**
 * O lançamento ficou antes do último ajuste da conta (só registro, não muda o saldo)?
 * Pendentes nunca: não estavam no saldo do banco. No mesmo dia, vale o momento da efetivação.
 */
export function isBeforeCheckpoint(
  cp: { date: Date; createdAt: Date } | undefined,
  t: { date: Date; createdAt: Date; paidAt: Date | null; status: string },
) {
  if (!cp || t.status !== "PAID") return false;
  const a = t.date.toISOString().slice(0, 10);
  const b = cp.date.toISOString().slice(0, 10);
  return a < b || (a === b && (t.paidAt ?? t.createdAt) <= cp.createdAt);
}
