import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hid, uid, type AuthRequest } from "../lib/auth.js";
import { ah, HttpError } from "../lib/http.js";
import { monthRange } from "../lib/dates.js";
import { commitmentKind, computePlan, type PlanItem } from "../lib/plan.js";
import { generateForHousehold } from "../lib/recurrenceService.js";
import { todayIso } from "../lib/schedule.js";
import { membersOf } from "../lib/members.js";

export const planRouter = Router();

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthDate = (month: string) => new Date(`${month}-01T00:00:00Z`);
const monthParam = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês deve estar no formato YYYY-MM");
/** "eu" = só o que está no nome de quem pede; "familia" = tudo do grupo. */
const scopeParam = z.enum(["eu", "familia"]).default("eu");

function prevMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
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
    responsibleId: t.responsibleId,
  }));
}

planRouter.get(
  "/",
  ah(async (req: AuthRequest, res) => {
    const householdId = hid(req);
    const me = uid(req);
    const month = monthParam.parse(req.query.month);
    const scope = scopeParam.parse(req.query.escopo);
    await generateForHousehold(householdId);
    const today = todayIso();
    const [allItems, plans, budgets, categories, prevCount, members] = await Promise.all([
      loadItems(householdId, month),
      prisma.monthPlan.findMany({ where: { householdId, month: monthDate(month) } }),
      prisma.budget.findMany({ where: { householdId, month: monthDate(month) } }),
      prisma.category.findMany({ where: { householdId, type: "EXPENSE", parentId: null, archivedAt: null }, orderBy: { name: "asc" } }),
      prisma.budget.count({ where: { householdId, month: monthDate(prevMonth(month)), userId: scope === "eu" ? me : null } }),
      membersOf(householdId),
    ]);

    // Dono que a tela edita: eu, ou a parte "Família (conjunto)"
    const editOwner = scope === "eu" ? me : null;
    const items = scope === "eu" ? allItems.filter((i) => i.responsibleId === me) : allItems;
    const savingsFor = (owner: string | null) => plans.find((p) => p.userId === owner)?.savingsGoalCents ?? 0;
    const savings = scope === "eu" ? savingsFor(me) : plans.reduce((s, p) => s + p.savingsGoalCents, 0);
    const r = computePlan(items, { month, savingsGoalCents: savings, today });

    const scopedBudgets = scope === "eu" ? budgets.filter((b) => b.userId === me) : budgets;
    const limitOf = (catId: string) => {
      const rows = scopedBudgets.filter((b) => b.categoryId === catId);
      return rows.length ? rows.reduce((s, b) => s + b.limitCents, 0) : null;
    };
    const ownLimitOf = (catId: string) => budgets.find((b) => b.categoryId === catId && b.userId === editOwner)?.limitCents ?? null;
    const budgeted = scopedBudgets.reduce((s, b) => s + b.limitCents, 0);

    const name = (id: string | null | undefined) => (id ? (members.find((m) => m.userId === id)?.name ?? "Ex-membro") : "Família");
    const commitments = items
      .filter((i) => i.type !== "INCOME" && commitmentKind(i))
      .map((i) => ({ ...i, kind: commitmentKind(i), responsibleName: name(i.responsibleId) }))
      .sort((a, b) => a.cashDate.localeCompare(b.cashDate));
    const incomes = items
      .filter((i) => i.type === "INCOME" && !i.viaCard)
      .map((i) => ({ ...i, responsibleName: name(i.responsibleId) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Família: o mesmo cálculo para cada pessoa e para a parte conjunta
    const byMember =
      scope === "familia"
        ? [...members.map((m) => m.userId as string | null), null].map((owner) => {
            const p = computePlan(
              allItems.filter((i) => (i.responsibleId ?? null) === owner),
              { month, savingsGoalCents: savingsFor(owner), today },
            );
            return {
              userId: owner,
              name: name(owner),
              incomeCents: p.incomeCents,
              commitmentsCents: p.commitmentsCents,
              savingsGoalCents: p.savingsGoalCents,
              availableCents: p.availableCents,
              variableSpentCents: p.variableSpentCents,
              remainingCents: p.remainingCents,
            };
          }).filter((m) => m.userId !== null || m.incomeCents || m.commitmentsCents || m.variableSpentCents || m.savingsGoalCents)
        : [];

    res.json({
      month,
      scope,
      today,
      incomeCents: r.incomeCents,
      commitmentsCents: r.commitmentsCents,
      commitmentsByKind: r.commitmentsByKind,
      savingsGoalCents: r.savingsGoalCents,
      editableSavingsCents: savingsFor(editOwner),
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
      canCopyBudgets: prevCount > 0,
      budgets: categories.map((c) => ({
        categoryId: c.id,
        name: c.name,
        color: c.color,
        limitCents: limitOf(c.id),
        ownLimitCents: ownLimitOf(c.id),
        spentCents: r.spentByCategory.get(c.id) ?? 0,
      })),
      uncategorizedSpentCents: r.spentByCategory.get(null) ?? 0,
      byMember,
    });
  }),
);

/** Grava (ou atualiza) o plano do dono: eu, ou a parte Família (conjunto). */
async function upsertPlan(householdId: string, month: string, userId: string | null, savingsGoalCents: number) {
  const m = monthDate(month);
  const existing = await prisma.monthPlan.findFirst({ where: { householdId, month: m, userId } });
  if (existing) await prisma.monthPlan.update({ where: { id: existing.id }, data: { savingsGoalCents } });
  else await prisma.monthPlan.create({ data: { householdId, month: m, userId, savingsGoalCents } });
}

const ownerFor = (req: AuthRequest, scope: "eu" | "familia") => (scope === "eu" ? uid(req) : null);

/** Meta de guardar no mês (escopo "familia" = parte conjunta). */
planRouter.put(
  "/:month",
  ah(async (req: AuthRequest, res) => {
    const month = monthParam.parse(req.params.month);
    const v = z.object({ savingsGoalCents: z.number().int().min(0), scope: scopeParam }).parse(req.body);
    await upsertPlan(hid(req), month, ownerFor(req, v.scope), v.savingsGoalCents);
    res.json({ ok: true });
  }),
);

/** Substitui os limites por categoria do dono no mês (limite vazio/zero remove). */
planRouter.put(
  "/:month/orcamentos",
  ah(async (req: AuthRequest, res) => {
    const month = monthParam.parse(req.params.month);
    const v = z
      .object({
        scope: scopeParam,
        items: z.array(z.object({ categoryId: z.string(), limitCents: z.number().int().min(0).nullable() })).max(200),
      })
      .parse(req.body);
    const householdId = hid(req);
    const userId = ownerFor(req, v.scope);
    const valid = await prisma.category.findMany({
      where: { householdId, type: "EXPENSE", parentId: null, id: { in: v.items.map((i) => i.categoryId) } },
      select: { id: true },
    });
    if (valid.length !== new Set(v.items.map((i) => i.categoryId)).size) throw new HttpError(400, "Categoria inválida");
    const m = monthDate(month);
    await prisma.$transaction([
      prisma.budget.deleteMany({ where: { householdId, month: m, userId } }),
      prisma.budget.createMany({
        data: v.items
          .filter((i) => i.limitCents && i.limitCents > 0)
          .map((i) => ({ householdId, categoryId: i.categoryId, month: m, userId, limitCents: i.limitCents! })),
      }),
    ]);
    res.json({ ok: true });
  }),
);

/** Copia os limites e a meta de guardar do mês anterior (do mesmo dono). */
planRouter.post(
  "/:month/copiar-anterior",
  ah(async (req: AuthRequest, res) => {
    const month = monthParam.parse(req.params.month);
    const { scope } = z.object({ scope: scopeParam }).parse(req.body ?? {});
    const householdId = hid(req);
    const userId = ownerFor(req, scope);
    const prev = monthDate(prevMonth(month));
    const [budgets, plan] = await Promise.all([
      prisma.budget.findMany({ where: { householdId, month: prev, userId } }),
      prisma.monthPlan.findFirst({ where: { householdId, month: prev, userId } }),
    ]);
    const m = monthDate(month);
    await prisma.$transaction([
      prisma.budget.deleteMany({ where: { householdId, month: m, userId } }),
      prisma.budget.createMany({ data: budgets.map((b) => ({ householdId, categoryId: b.categoryId, month: m, userId, limitCents: b.limitCents })) }),
    ]);
    await upsertPlan(householdId, month, userId, plan?.savingsGoalCents ?? 0);
    res.json({ copied: budgets.length });
  }),
);
