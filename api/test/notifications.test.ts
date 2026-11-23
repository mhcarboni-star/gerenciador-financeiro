import { test } from "node:test";
import assert from "node:assert/strict";
process.env.JWT_SECRET ??= "teste";
const { buildMessage, localNow } = await import("../src/lib/dueNotifications.js");

const d = (s: string) => new Date(`${s}T00:00:00Z`);

test("hora local de São Paulo a partir de UTC (vira o dia antes)", () => {
  assert.deepEqual(localNow("America/Sao_Paulo", new Date("2026-11-24T02:30:00Z")), { date: "2026-11-23", hour: 23 });
  assert.deepEqual(localNow("America/Sao_Paulo", new Date("2026-11-24T11:05:00Z")), { date: "2026-11-24", hour: 8 });
});

test("aviso com contas de hoje e atrasadas", () => {
  const m = buildMessage(
    [
      { description: "Energia", amountCents: 21347, date: d("2026-11-24"), type: "EXPENSE" },
      { description: "Internet", amountCents: 11990, date: d("2026-11-24"), type: "EXPENSE" },
      { description: "Consignado · parcela 3/12", amountCents: 94501, date: d("2026-11-24"), type: "LOAN_PAYMENT" },
      { description: "Água", amountCents: 8000, date: d("2026-11-20"), type: "EXPENSE" },
    ],
    "2026-11-24",
  );
  assert.equal(m.title, "Contas do dia");
  assert.equal(m.body, "3 contas para hoje · R$ 1.278,38 — Energia, Internet, Consignado\n1 atrasada · R$ 80,00");
});

test("só recebimento hoje; mais de 3 itens resume", () => {
  const r = buildMessage([{ description: "Salário", amountCents: 650000, date: d("2026-12-05"), type: "INCOME" }], "2026-12-05");
  assert.equal(r.title, "Previstos para hoje");
  assert.equal(r.body, "1 recebimento hoje · R$ 6.500,00 — Salário");
  const many = buildMessage(["A", "B", "C", "D", "E"].map((n) => ({ description: n, amountCents: 100, date: d("2026-12-05"), type: "EXPENSE" })), "2026-12-05");
  assert.match(many.body, /^5 contas para hoje · R\$ 5,00 — A, B, C e mais 2$/);
});

test("só atrasadas", () => {
  const m = buildMessage([{ description: "Água", amountCents: 8000, date: d("2026-11-20"), type: "EXPENSE" }], "2026-11-24");
  assert.equal(m.title, "Contas atrasadas");
  assert.equal(m.body, "1 atrasada · R$ 80,00");
});
