/**
 * Datas de recorrência (funções puras, YYYY-MM-DD).
 * A ocorrência k é sempre calculada a partir da data inicial, para não "escorregar":
 * mensal começando em 31/01 → 28/02 → 31/03 (e não 28/03).
 */
import { addMonths } from "./loans.js";

export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function occurrenceAt(start: string, frequency: Frequency, interval: number, k: number): string {
  switch (frequency) {
    case "DAILY":
      return addDays(start, k * interval);
    case "WEEKLY":
      return addDays(start, 7 * k * interval);
    case "MONTHLY":
      return addMonths(start, k * interval);
    case "YEARLY":
      return addMonths(start, 12 * k * interval);
  }
}

/** Primeira ocorrência na data `from` ou depois dela (null se passar de `end`). */
export function firstOnOrAfter(start: string, frequency: Frequency, interval: number, from: string, end?: string | null): string | null {
  for (let k = 0; k < 100_000; k++) {
    const d = occurrenceAt(start, frequency, interval, k);
    if (end && d > end) return null;
    if (d >= from) return d;
  }
  return null;
}

/** Ocorrências em [from, to], respeitando a data final da recorrência. */
export function occurrencesBetween(
  start: string,
  frequency: Frequency,
  interval: number,
  from: string,
  to: string,
  end?: string | null,
): string[] {
  const out: string[] = [];
  let d = firstOnOrAfter(start, frequency, interval, from, end);
  if (!d) return out;
  // índice da primeira ocorrência encontrada
  let k = 0;
  while (occurrenceAt(start, frequency, interval, k) < d) k++;
  while (d <= to && (!end || d <= end)) {
    out.push(d);
    k++;
    d = occurrenceAt(start, frequency, interval, k);
  }
  return out;
}

/** "Hoje" no fuso do Brasil (o servidor roda em UTC). */
export function todayIso(timeZone = "America/Sao_Paulo"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export { addDays, addMonths };
