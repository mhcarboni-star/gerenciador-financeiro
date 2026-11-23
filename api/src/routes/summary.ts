import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { hid, type AuthRequest } from "../lib/auth.js";
import { ah } from "../lib/http.js";
import { currentMonth, monthRange } from "../lib/dates.js";

export const summaryRouter = Router();

/** Tipos que entram no resumo. A parcela de empréstimo conta inteira como despesa. */
const SUMMARY_TYPES = { in: ["INCOME", "EXPENSE", "LOAN_PAYMENT"] as ("INCOME" | "EXPENSE" | "LOAN_PAYMENT")[] };
export const LOANS_CATEGORY_ID = "__emprestimos__";

/**
 * Totais do mês (previstos + efetivados), gastos por categoria e saldo acumulado
 * (saldo real das contas incluídas no total, ao fim do mês, só efetivados).
 */
summaryRouter.get(
  "/",
  ah(async (req: AuthRequest, res) => {
    const householdId = hid(req);
    const month = typeof req.query.month === "string" ? req.query.month : currentMonth();
    const range = monthRange(month);

    const [byCategory, categories, accumulated] = await Promise.all([
      prisma.transaction.groupBy({
        by: ["categoryId", "type"],
        where: { householdId, type: SUMMARY_TYPES, date: range },
        _sum: { amountCents: true },
      }),
      prisma.category.findMany({ where: { householdId } }),
      prisma.$queryRaw<{ total: bigint | null }[]>`
        SELECT SUM(a."initialBalanceCents") + COALESCE((
          SELECT SUM(CASE
                       WHEN t."type" IN ('INCOME','LOAN_RECEIPT') AND t."accountId" = a2.id THEN t."amountCents"
                       WHEN t."type" = 'TRANSFER' AND t."destinationAccountId" = a2.id THEN t."amountCents"
                       WHEN t."accountId" = a2.id THEN -t."amountCents"
                       ELSE 0 END)
          FROM "Transaction" t JOIN "Account" a2 ON a2.id IN (t."accountId", t."destinationAccountId")
          WHERE a2."householdId" = ${householdId} AND a2."includeInTotals"
            AND t.status = 'PAID' AND t.date < ${range.lt}
        ), 0) AS total
        FROM "Account" a
        WHERE a."householdId" = ${householdId} AND a."includeInTotals"`,
    ]);

    const catMap = new Map(categories.map((c) => [c.id, c]));
    let income = 0;
    let expense = 0;
    let loans = 0;
    const rows: { categoryId: string | null; name: string; color: string; type: "INCOME" | "EXPENSE"; totalCents: number }[] = [];

    for (const r of byCategory) {
      const total = r._sum.amountCents ?? 0;
      if (r.type === "INCOME") income += total;
      else expense += total;
      if (r.type === "LOAN_PAYMENT") {
        loans += total;
        continue;
      }
      const c = r.categoryId ? catMap.get(r.categoryId) : undefined;
      rows.push({
        categoryId: r.categoryId,
        name: c?.name ?? "Sem categoria",
        color: c?.color ?? "#94a3b8",
        type: r.type as "INCOME" | "EXPENSE",
        totalCents: total,
      });
    }
    if (loans > 0) {
      rows.push({ categoryId: LOANS_CATEGORY_ID, name: "Empréstimos", color: "#b45309", type: "EXPENSE", totalCents: loans });
    }

    res.json({
      month,
      incomeCents: income,
      expenseCents: expense,
      balanceCents: income - expense,
      accumulatedCents: Number(accumulated[0]?.total ?? 0),
      byCategory: rows.sort((a, b) => b.totalCents - a.totalCents),
    });
  }),
);
