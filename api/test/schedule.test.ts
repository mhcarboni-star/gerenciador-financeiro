import { test } from "node:test";
import assert from "node:assert/strict";
import { firstOnOrAfter, occurrencesBetween, todayIso } from "../src/lib/schedule.js";

test("mensal a partir de 31/01 não escorrega", () => {
  assert.deepEqual(occurrencesBetween("2027-01-31", "MONTHLY", 1, "2027-01-01", "2027-04-30"), [
    "2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30",
  ]);
});

test("a cada 2 meses, semanal, anual", () => {
  assert.deepEqual(occurrencesBetween("2026-11-10", "MONTHLY", 2, "2026-11-01", "2027-05-31"), ["2026-11-10", "2027-01-10", "2027-03-10", "2027-05-10"]);
  assert.deepEqual(occurrencesBetween("2026-11-02", "WEEKLY", 1, "2026-11-10", "2026-11-30"), ["2026-11-16", "2026-11-23", "2026-11-30"]);
  assert.deepEqual(occurrencesBetween("2024-02-29", "YEARLY", 1, "2025-01-01", "2028-12-31"), ["2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
});

test("respeita a data final", () => {
  assert.deepEqual(occurrencesBetween("2026-11-05", "MONTHLY", 1, "2026-11-01", "2027-12-31", "2027-01-31"), ["2026-11-05", "2026-12-05", "2027-01-05"]);
  assert.equal(firstOnOrAfter("2026-11-05", "MONTHLY", 1, "2027-02-01", "2027-01-31"), null);
});

test("próxima ocorrência a partir de uma data", () => {
  assert.equal(firstOnOrAfter("2026-01-15", "MONTHLY", 1, "2026-11-16"), "2026-12-15");
  assert.equal(firstOnOrAfter("2026-01-15", "MONTHLY", 1, "2026-11-15"), "2026-11-15");
});

test("hoje no formato YYYY-MM-DD", () => {
  assert.match(todayIso(), /^\d{4}-\d{2}-\d{2}$/);
});
