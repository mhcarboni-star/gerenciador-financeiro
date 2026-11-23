const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const money = (cents: number) => brl.format(cents / 100);

/** "1.234,56" ou "1234.56" → 123456 centavos (aceita "-" com allowNegative). NaN se inválido. */
export function parseMoney(input: string, allowNegative = false): number {
  let s = input.trim().replace(/[R$\s]/g, "");
  const negative = allowNegative && /^[-−]/.test(s);
  if (negative) s = s.slice(1);
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const cents = Math.round(Number(s) * 100);
  return negative ? -cents : cents;
}

export const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/** "2026-12-10" → "10/12". */
export const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export const COLORS = ["#16a34a", "#0d9488", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04", "#64748b", "#334155"];

export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function today() {
  const d = new Date();
  return `${currentMonth()}-${String(d.getDate()).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Data vinda da API (ISO em UTC) → "dd/mm". */
export function shortDate(iso: string) {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}
