/**
 * Regra de fatura do cartão (funções puras, datas YYYY-MM-DD).
 *
 * A fatura é identificada pelo mês do vencimento (referenceMonth = dia 1 desse mês).
 * - Vencimento: dia `dueDay` do mês de referência (ou o último dia, se o mês for mais curto).
 * - Fechamento: dia `closingDay` do mesmo mês se closingDay < dueDay; senão, do mês anterior.
 * - Compra feita ANTES do dia de fechamento entra nessa fatura; no dia do fechamento ou depois,
 *   vai para a seguinte (o dia de fechamento é o "melhor dia de compra").
 */

export interface InvoicePeriod {
  referenceMonth: string; // YYYY-MM-01
  closingDate: string;
  dueDate: string;
}

function ymd(y: number, m0: number, day: number): string {
  // m0 pode sair de 0..11; Date normaliza. Dia limitado ao último dia do mês.
  const first = new Date(Date.UTC(y, m0, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return first.toISOString().slice(0, 10);
}

/** Datas da fatura que vence no mês (ano, mês 0-11). */
export function invoicePeriod(year: number, month0: number, closingDay: number, dueDay: number): InvoicePeriod {
  const closingMonth0 = closingDay < dueDay ? month0 : month0 - 1;
  return {
    referenceMonth: ymd(year, month0, 1),
    closingDate: ymd(year, closingMonth0, closingDay),
    dueDate: ymd(year, month0, dueDay),
  };
}

/** Em qual fatura cai uma compra feita em `purchaseDate`. */
export function invoiceForPurchase(purchaseDate: string, closingDay: number, dueDay: number): InvoicePeriod {
  const [y, m] = purchaseDate.split("-").map(Number);
  // Começa pela fatura que vence no mês da compra e avança até achar a que ainda não fechou.
  for (let offset = 0; offset < 3; offset++) {
    const p = invoicePeriod(y, m - 1 + offset, closingDay, dueDay);
    if (purchaseDate < p.closingDate) return p;
  }
  throw new Error("Não foi possível determinar a fatura");
}
