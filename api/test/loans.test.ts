import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, buildSchedule, outstandingBalance, splitPayment, accruedInterest } from "../src/lib/loans.js";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test("addMonths mantém o dia e ajusta fim de mês", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-01-15", 12), "2027-01-15");
  assert.equal(addMonths("2027-12-10", 2), "2028-02-10");
});

test("Price: R$ 10.000 a 2% a.m. em 12x → parcela R$ 945,60 e amortização fecha o valor", () => {
  const s = buildSchedule({ type: "PRICE", principalCents: 1_000_000, monthlyRate: 0.02, count: 12, firstDueDate: "2026-12-10" });
  assert.equal(s.length, 12);
  assert.equal(s[0].amountCents, 94_560);
  assert.equal(s[0].interestCents, 20_000); // 2% de 10.000
  assert.equal(s[0].principalCents, 74_560);
  assert.equal(sum(s.map((x) => x.principalCents)), 1_000_000);
  assert.equal(s[11].balanceAfterCents, 0);
  assert.ok(Math.abs(s[11].amountCents - 94_560) <= 5, "última parcela só absorve arredondamento");
  assert.equal(s[11].dueDate, "2027-11-10");
});

test("Sem juros: R$ 1.000 em 3x → 333,33 / 333,33 / 333,34", () => {
  const s = buildSchedule({ type: "NONE", principalCents: 100_000, monthlyRate: 0, count: 3, firstDueDate: "2026-12-05" });
  assert.deepEqual(s.map((x) => x.amountCents), [33_333, 33_333, 33_334]);
  assert.ok(s.every((x) => x.interestCents === 0));
});

test("Price: parcela prevista divide juros e amortização; antecipação amortiza tudo", () => {
  const prevista = splitPayment({ type: "PRICE", amountCents: 94_560, outstandingPrincipalCents: 1_000_000, monthlyRate: 0.02, isScheduledInstallment: true, lastEventDate: "2026-11-10", paymentDate: "2026-12-10" });
  assert.deepEqual(prevista, { principalCents: 74_560, interestCents: 20_000 });
  const avulso = splitPayment({ type: "PRICE", amountCents: 200_000, outstandingPrincipalCents: 925_440, monthlyRate: 0.02, isScheduledInstallment: false, lastEventDate: "2026-12-10", paymentDate: "2026-12-20" });
  assert.deepEqual(avulso, { principalCents: 200_000, interestCents: 0 });
});

test("Price: após antecipação, recalcula as parcelas restantes com o novo saldo", () => {
  const novo = buildSchedule({ type: "PRICE", principalCents: 725_440, monthlyRate: 0.02, count: 11, firstDueDate: "2027-01-10", firstNumber: 2 });
  assert.equal(novo[0].number, 2);
  assert.ok(novo[0].amountCents < 94_560, "parcela menor depois de antecipar");
  assert.equal(sum(novo.map((x) => x.principalCents)), 725_440);
});

test("Juros mensais sobre saldo: 30 dias a 3% sobre R$ 5.000 = R$ 150", () => {
  assert.equal(accruedInterest(500_000, 0.03, "2026-11-01", "2026-12-01"), 15_000);
  const p = splitPayment({ type: "MONTHLY_ON_BALANCE", amountCents: 100_000, outstandingPrincipalCents: 500_000, monthlyRate: 0.03, isScheduledInstallment: false, lastEventDate: "2026-11-01", paymentDate: "2026-12-01" });
  assert.deepEqual(p, { principalCents: 85_000, interestCents: 15_000 });
});

test("Juros mensais: pagamento menor que os juros aumenta o saldo (amortização negativa)", () => {
  const p = splitPayment({ type: "MONTHLY_ON_BALANCE", amountCents: 10_000, outstandingPrincipalCents: 500_000, monthlyRate: 0.03, isScheduledInstallment: false, lastEventDate: "2026-11-01", paymentDate: "2026-12-01" });
  assert.deepEqual(p, { principalCents: -5_000, interestCents: 15_000 });
});

test("Saldo devedor hoje inclui juros acumulados desde o último pagamento", () => {
  assert.equal(outstandingBalance({ type: "NONE", outstandingPrincipalCents: 70_000, monthlyRate: 0, lastEventDate: "2026-01-01", onDate: "2026-12-01" }), 70_000);
  assert.equal(outstandingBalance({ type: "MONTHLY_ON_BALANCE", outstandingPrincipalCents: 500_000, monthlyRate: 0.03, lastEventDate: "2026-11-01", onDate: "2026-12-01" }), 515_000);
});
