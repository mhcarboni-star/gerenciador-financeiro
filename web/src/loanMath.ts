/** Prévia das parcelas no cadastro (mesma fórmula da API, só para exibir). */
export function previewInstallment(principalCents: number, monthlyRate: number, count: number) {
  if (!principalCents || !count) return 0;
  if (!monthlyRate) return Math.round(principalCents / count);
  return Math.round((principalCents * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -count)));
}

/** "1,99" → 0.0199 ; NaN se inválido. */
export function parseRate(input: string) {
  const s = input.trim().replace("%", "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s) / 100;
}

export const rateLabel = (r: number | null) =>
  r === null ? "—" : `${(r * 100).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}% a.m.`;

export const INTEREST_LABEL = {
  NONE: "Sem juros",
  PRICE: "Parcelas fixas (banco)",
  MONTHLY_ON_BALANCE: "Juros mensais sobre o saldo",
} as const;
