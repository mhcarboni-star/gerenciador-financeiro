import { test } from "node:test";
import assert from "node:assert/strict";
import { computePlan, type PlanItem } from "../src/lib/plan.js";

let n = 0;
const item = (p: Partial<PlanItem>): PlanItem => ({
  id: String(n++), type: "EXPENSE", status: "PAID", description: "x", amountCents: 0,
  date: "2026-12-05", cashDate: "2026-12-05", viaCard: false, recurrenceId: null, installmentPlanId: null,
  categoryId: null, sourceName: null, ...p,
});

test("disponível = receitas − compromissos − guardar; resta desconta o dia a dia", () => {
  const items = [
    item({ type: "INCOME", amountCents: 600_000, recurrenceId: "sal", status: "PENDING" }),
    item({ amountCents: 180_000, recurrenceId: "aluguel", status: "PENDING" }), // fixa
    item({ amountCents: 18_000, recurrenceId: "luz", status: "PENDING" }), // fixa (estimada)
    item({ type: "LOAN_PAYMENT", amountCents: 94_560, status: "PENDING" }), // empréstimo
    item({ amountCents: 35_000, installmentPlanId: "gel", viaCard: true, date: "2026-11-20", cashDate: "2026-12-10" }), // parcela no cartão
    item({ amountCents: 120_000, status: "PENDING" }), // previsão (IPVA)
    item({ amountCents: 30_000, categoryId: "mercado" }), // dia a dia na conta
    item({ amountCents: 15_000, categoryId: "lazer", viaCard: true, date: "2026-11-25", cashDate: "2026-12-10" }), // compra no cartão em nov, vence dez
  ];
  const r = computePlan(items, { month: "2026-12", savingsGoalCents: 50_000, today: "2026-11-23" });
  assert.equal(r.incomeCents, 600_000);
  assert.deepEqual(r.commitmentsByKind, { FIXED: 198_000, INSTALLMENT: 35_000, LOAN: 94_560, PLANNED: 120_000 });
  assert.equal(r.commitmentsCents, 447_560);
  assert.equal(r.availableCents, 600_000 - 447_560 - 50_000); // 102.440
  assert.equal(r.variableSpentCents, 45_000);
  assert.equal(r.remainingCents, 102_440 - 45_000);
  assert.equal(r.cardCarryCents, 15_000);
  assert.equal(r.spentByCategory.get("mercado"), 30_000);
  assert.equal(r.daysLeft, 31); // mês futuro: inteiro
  assert.equal(r.perDayCents, Math.floor(57_440 / 31));
});

test("estorno no cartão reduz o gasto; dias restantes no mês atual", () => {
  const r = computePlan(
    [
      item({ type: "INCOME", amountCents: 100_000 }),
      item({ amountCents: 20_000, viaCard: true, categoryId: "c" }),
      item({ type: "INCOME", amountCents: 5_000, viaCard: true, categoryId: "c" }),
    ],
    { month: "2026-11", savingsGoalCents: 0, today: "2026-11-23" },
  );
  assert.equal(r.incomeCents, 100_000);
  assert.equal(r.variableSpentCents, 15_000);
  assert.equal(r.daysLeft, 8); // 23 a 30 de novembro
  assert.equal(r.perDayCents, Math.floor(85_000 / 8));
});

test("mês passado não tem dias restantes; gasto além do disponível deixa 'resta' negativo", () => {
  const r = computePlan([item({ type: "INCOME", amountCents: 10_000 }), item({ amountCents: 15_000 })], { month: "2026-10", savingsGoalCents: 0, today: "2026-11-23" });
  assert.equal(r.remainingCents, -5_000);
  assert.equal(r.daysLeft, 0);
  assert.equal(r.perDayCents, 0);
});
