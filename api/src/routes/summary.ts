import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { uid, type AuthRequest } from "../lib/auth.js";
import { ah } from "../lib/http.js";
import { currentMonth, monthRange } from "../lib/dates.js";

export const summaryRouter = Router();

/** Totais do mês, gastos por categoria e saldo acumulado até o fim do mês. */
summaryRouter.get(
  "/",
  ah(async (req: AuthRequest, res) => {
    const userId = uid(req);
    const month = typeof req.query.month === "string" ? req.query.month : currentMonth();
    const range = monthRange(month);

    const [byType, byCategory, cumulative, categories] = await Promise.all([
      prisma.transaction.groupBy({
        by: ["type"],
        where: { userId, date: range },
        _sum: { amountCents: true },
      }),
      prisma.transaction.groupBy({
        by: ["categoryId", "type"],
        where: { userId, date: range },
        _sum: { amountCents: true },
      }),
      prisma.transaction.groupBy({
        by: ["type"],
        where: { userId, date: { lt: range.lt } },
        _sum: { amountCents: true },
      }),
      prisma.category.findMany({ where: { userId } }),
    ]);

    const sum = (rows: typeof byType, type: string) =>
      rows.find((r) => r.type === type)?._sum.amountCents ?? 0;
    const income = sum(byType, "INCOME");
    const expense = sum(byType, "EXPENSE");
    const catMap = new Map(categories.map((c) => [c.id, c]));

    res.json({
      month,
      incomeCents: income,
      expenseCents: expense,
      balanceCents: income - expense,
      accumulatedCents: sum(cumulative, "INCOME") - sum(cumulative, "EXPENSE"),
      byCategory: byCategory
        .map((r) => {
          const c = r.categoryId ? catMap.get(r.categoryId) : undefined;
          return {
            categoryId: r.categoryId,
            name: c?.name ?? "Sem categoria",
            color: c?.color ?? "#94a3b8",
            type: r.type,
            totalCents: r._sum.amountCents ?? 0,
          };
        })
        .sort((a, b) => b.totalCents - a.totalCents),
    });
  }),
);
