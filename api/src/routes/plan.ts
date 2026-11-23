import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hid, type AuthRequest } from "../lib/auth.js";
import { ah, HttpError } from "../lib/http.js";
import { monthRange } from "../lib/dates.js";
import { commitmentKind, computePlan, type PlanItem } from "../lib/plan.js";
import { generateForHousehold } from "../lib/recurrenceService.js";
import { todayIso } from "../lib/schedule.js";

export const planRouter = Router();

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthDate = (month: string) => new Date(`${month}-01T00:00:00Z`);
const monthParam = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês deve estar no formato YYYY-MM");

function prevMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

/** Itens do mês no regime de caixa (contas pela data, cartão pelo vencimento da fatura). */
async function loadItems(householdId: string, month: string): Promise<PlanItem[]> {
  const range = monthRange(month);
  const include = {
    category: { select: { id: true, parentId: true } },
    account: { select: { name: true } },
    creditCard: { select: { name: true } },
    invoice: { select: { dueDate: true } },
  } as const;
  const [inAccounts, inCards] = await Promise.all([
    prisma.transaction.findMany({
      where: { householdId, accountId: { not: null }, type: { in: ["INCOME", "EXPENSE", "LOAN_PAYMENT"] }, date: range },
      include,
    }),
    prisma.transaction.findMany({
      where: { householdId, creditCardId: { not: null }, type: { in: ["INCOME", "EXPENSE"] }, invoice: { dueDate: range } },
      include,
    }),
  ]);
  return [...inAccounts, ...inCards].map((t) => ({
    id: t.id,
    type: t.type as PlanItem["type"],
    status: t.status,
    description: t.description,
    amountCents: t.amountCents,
    date: iso(t.date),
    cashDate: t.invoice ? iso(t.invoice.dueDate) : iso(t.date),
    viaCard: !!t.creditCardId,
    recurrenceId: t.recurrenceId,
    installmentPlanId: t.installmentPlanId,
    categoryId: t.category ? (t.category.parentId ?? t.category.id) : null,
    sourceName: t.creditCard?.name ?? t.account?.name ?? null,
  }));
}

planRouter.get(
  "/",
  ah(async (req: AuthRequest, res) => {
    const householdId = hid(req);
    const month = monthParam.parse(req.query.month);
    await generateForHousehold(householdId);
    const [items, plan, budgets, categories, prevBudgets] = await Promise.all([
      loadItems(householdId, month),
      prisma.monthPlan.findUnique({ where: { householdId_month: { householdId, month: monthDate(month) } } }),
      prisma.budget.findMany({ where: { householdId, month: monthDate(month) } }),
      prisma.category.findMany({ where: { householdId, type: "EXPENSE", parentId: null, archivedAt: null }, orderBy: { name: "asc" } }),
      prisma.budget.count({ where: { householdId, month: monthDate(prevMonth(month)) } }),
    ]);
    const r = computePlan(items, { month, savingsGoalCents: plan?.savingsGoalCents ?? 0, today: todayIso() });
    const limits = new Map(budgets.map((b) => [b.categoryId, b.limitCents]));
    const budgeted = budgets.reduce((s, b) => s + b.limitCents, 0);

    const commitments = items
      .filter((i) => i.type !== "INCOME" && commitmentKind(i))
      .map((i) => ({ ...i, kind: commitmentKind(i) }))
      .sort((a, b) => a.cashDate.localeCompare(b.cashDate));
    const incomes = items.filter((i) => i.type === "INCOME" && !i.viaCard).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      month,
      today: todayIso(),
      incomeCents: r.incomeCents,
      commitmentsCents: r.commitmentsCents,
      commitmentsByKind: r.commitmentsByKind,
      savingsGoalCents: r.savingsGoalCents,
      availableCents: r.availableCents,
      variableSpentCents: r.variableSpentCents,
      remainingCents: r.remainingCents,
      cardCarryCents: r.cardCarryCents,
      perDayCents: r.perDayCents,
      daysLeft: r.daysLeft,
      incomes,
      commitments,
      budgetedCents: budgeted,
      unbudgetedCents: r.availableCents - budgeted,
      canCopyBudgets: prevBudgets > 0,
      budgets: categories.map((c) => ({
        categoryId: c.id,
        name: c.name,
        color: c.color,
        limitCents: limits.get(c.id) ?? null,
        spentCents: r.spentByCategory.get(c.id) ?? 0,
      })),
      uncategorizedSpentCents: r.spentByCategory.get(null) ?? 0,
    });
  }),
);

/** Meta de guardar no mês. */
planRouter.put(
  "/:month",
  ah(async (req: AuthRequest, res) => {
    const month = monthParam.parse(req.params.month);
    const { savingsGoalCents } = z.object({ savingsGoalCents: z.number().int().min(0) }).parse(req.body);
    const householdId = hid(req);
    await prisma.monthPlan.upsert({
      where: { householdId_month: { householdId, month: monthDate(month) } },
      create: { householdId, month: monthDate(month), savingsGoalCents },
      update: { savingsGoalCents },
    });
    res.json({ ok: true });
  }),
);

/** Substitui os limites por categoria do mês (limite vazio/zero remove). */
planRouter.put(
  "/:month/orcamentos",
  ah(async (req: AuthRequest, res) => {
    const month = monthParam.parse(req.params.month);
    const { items } = z
      .object({ items: z.array(z.object({ categoryId: z.string(), limitCents: z.number().int().min(0).nullable() })).max(200) })
      .parse(req.body);
    const householdId = hid(req);
    const valid = await prisma.category.findMany({
      where: { householdId, type: "EXPENSE", parentId: null, id: { in: items.map((i) => i.categoryId) } },
      select: { id: true },
    });
    if (valid.length !== new Set(items.map((i) => i.categoryId)).size) throw new HttpError(400, "Categoria inválida");
    const m = monthDate(month);
    await prisma.$transaction([
      prisma.budget.deleteMany({ where: { householdId, month: m } }),
      prisma.budget.createMany({
        data: items.filter((i) => i.limitCents && i.limitCents > 0).map((i) => ({ householdId, categoryId: i.categoryId, month: m, limitCents: i.limitCents! })),
      }),
    ]);
    res.json({ ok: true });
  }),
);

/** Copia os limites e a meta de guardar do mês anterior. */
planRouter.post(
  "/:month/copiar-anterior",
  ah(async (req: AuthRequest, res) => {
    const month = monthParam.parse(req.params.month);
    const householdId = hid(req);
    const prev = monthDate(prevMonth(month));
    const [budgets, plan] = await Promise.all([
      prisma.budget.findMany({ where: { householdId, month: prev } }),
      prisma.monthPlan.findUnique({ where: { householdId_month: { householdId, month: prev } } }),
    ]);
    const m = monthDate(month);
    await prisma.$transaction([
      prisma.budget.deleteMany({ where: { householdId, month: m } }),
      prisma.budget.createMany({ data: budgets.map((b) => ({ householdId, categoryId: b.categoryId, month: m, limitCents: b.limitCents })) }),
      prisma.monthPlan.upsert({
        where: { householdId_month: { householdId, month: m } },
        create: { householdId, month: m, savingsGoalCents: plan?.savingsGoalCents ?? 0 },
        update: { savingsGoalCents: plan?.savingsGoalCents ?? 0 },
      }),
    ]);
    res.json({ copied: budgets.length });
  }),
);
