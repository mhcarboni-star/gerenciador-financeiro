import { test } from "node:test";
import assert from "node:assert/strict";
process.env.JWT_SECRET ??= "teste";
const { horizonFor } = await import("../src/lib/recurrenceService.js");
const { todayIso, addMonths } = await import("../src/lib/schedule.js");

test("recorrência sem fim: sempre gerada pelo menos até 31/12 do ano corrente e 3 meses à frente", () => {
  const h = horizonFor();
  const today = todayIso();
  assert.ok(h >= `${today.slice(0, 4)}-12-31`);
  assert.ok(h >= addMonths(today, 3));
});

test("abrir um mês distante gera até ele, com limite de 5 anos", () => {
  const today = todayIso();
  const far = addMonths(today, 30);
  assert.equal(horizonFor(far), far);
  assert.equal(horizonFor("2099-12-31"), addMonths(today, 60));
  assert.equal(horizonFor("2000-01-31"), horizonFor()); // mês passado não reduz
});
