import { test } from "node:test";
import assert from "node:assert/strict";
import { invoiceForPurchase, invoicePeriod } from "../src/lib/invoices.js";

test("fecha dia 3, vence dia 10: compra dia 2 entra na fatura do mês; dia 3 vai para a próxima", () => {
  assert.deepEqual(invoiceForPurchase("2026-12-02", 3, 10), { referenceMonth: "2026-12-01", closingDate: "2026-12-03", dueDate: "2026-12-10" });
  assert.equal(invoiceForPurchase("2026-12-03", 3, 10).referenceMonth, "2027-01-01");
  assert.equal(invoiceForPurchase("2026-11-20", 3, 10).referenceMonth, "2026-12-01");
});

test("fecha dia 25, vence dia 5 do mês seguinte", () => {
  assert.deepEqual(invoicePeriod(2027, 0, 25, 5), { referenceMonth: "2027-01-01", closingDate: "2026-12-25", dueDate: "2027-01-05" });
  assert.equal(invoiceForPurchase("2026-12-24", 25, 5).referenceMonth, "2027-01-01");
  assert.equal(invoiceForPurchase("2026-12-25", 25, 5).referenceMonth, "2027-02-01");
  assert.equal(invoiceForPurchase("2026-12-01", 25, 5).referenceMonth, "2027-01-01");
});

test("dias 31 e 30 se ajustam ao fim de fevereiro", () => {
  const p = invoicePeriod(2027, 1, 30, 31);
  assert.equal(p.closingDate, "2027-02-28");
  assert.equal(p.dueDate, "2027-02-28");
  assert.equal(invoiceForPurchase("2027-02-27", 30, 31).referenceMonth, "2027-02-01");
  assert.equal(invoiceForPurchase("2027-02-28", 30, 31).referenceMonth, "2027-03-01");
});

test("virada de ano", () => {
  assert.equal(invoiceForPurchase("2026-12-28", 20, 28).referenceMonth, "2027-01-01");
});
