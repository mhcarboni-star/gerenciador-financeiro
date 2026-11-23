import { HttpError } from "./http.js";

/** Converte "YYYY-MM" no intervalo [início, início do mês seguinte). */
export function monthRange(month: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new HttpError(400, "Mês deve estar no formato YYYY-MM");
  const year = Number(m[1]);
  const mon = Number(m[2]) - 1;
  if (mon < 0 || mon > 11) throw new HttpError(400, "Mês inválido");
  return { gte: new Date(Date.UTC(year, mon, 1)), lt: new Date(Date.UTC(year, mon + 1, 1)) };
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}
