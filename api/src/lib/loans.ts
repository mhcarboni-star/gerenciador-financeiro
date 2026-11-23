/**
 * Cálculos de empréstimo (funções puras, valores em centavos).
 *
 * Tipos de juros:
 * - NONE:               sem juros. Parcelas = valor / n (a última absorve o arredondamento).
 * - PRICE:              parcelas fixas com juros compostos mensais (Tabela Price).
 * - MONTHLY_ON_BALANCE: juros compostos mensais sobre o saldo, cobrados pró-rata por dia
 *                       desde o último pagamento. Plano de parcelas opcional (calculado como Price).
 */

export type LoanInterestType = "NONE" | "PRICE" | "MONTHLY_ON_BALANCE";

export interface ScheduleItem {
  number: number;
  dueDate: string; // YYYY-MM-DD
  amountCents: number;
  principalCents: number;
  interestCents: number;
  balanceAfterCents: number;
}

export interface PaymentSplit {
  principalCents: number;
  interestCents: number;
}

/** Soma meses mantendo o dia; se o mês não tiver o dia (ex.: 31), usa o último dia. */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/** Parcela fixa da Tabela Price (sem arredondar). */
export function pricePayment(principalCents: number, monthlyRate: number, count: number): number {
  if (monthlyRate === 0) return principalCents / count;
  return (principalCents * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -count));
}

/**
 * Tabela de parcelas a partir de um saldo. Usada no cadastro e para recalcular as parcelas
 * restantes depois de um pagamento antecipado.
 */
export function buildSchedule(opts: {
  type: LoanInterestType;
  principalCents: number;
  monthlyRate: number;
  count: number;
  firstDueDate: string;
  firstNumber?: number;
}): ScheduleItem[] {
  const { type, principalCents, count, firstDueDate } = opts;
  const rate = type === "NONE" ? 0 : opts.monthlyRate;
  const firstNumber = opts.firstNumber ?? 1;
  const fixed = Math.round(pricePayment(principalCents, rate, count));
  const items: ScheduleItem[] = [];
  let balance = principalCents;

  for (let i = 0; i < count; i++) {
    const interest = Math.round(balance * rate);
    const last = i === count - 1;
    // Última parcela quita exatamente o saldo restante (absorve arredondamentos).
    const principal = last ? balance : Math.min(fixed - interest, balance);
    balance -= principal;
    items.push({
      number: firstNumber + i,
      dueDate: addMonths(firstDueDate, i),
      amountCents: principal + interest,
      principalCents: principal,
      interestCents: interest,
      balanceAfterCents: balance,
    });
  }
  return items;
}

/** Juros acumulados sobre um saldo entre duas datas (compostos, mês de 30 dias). */
export function accruedInterest(balanceCents: number, monthlyRate: number, fromIso: string, toIso: string): number {
  const days = Math.max(daysBetween(fromIso, toIso), 0);
  if (balanceCents <= 0 || monthlyRate === 0 || days === 0) return 0;
  return Math.round(balanceCents * (Math.pow(1 + monthlyRate, days / 30) - 1));
}

/**
 * Divide um pagamento em juros e amortização.
 * - NONE: tudo amortiza.
 * - PRICE, parcela prevista: juros de 1 mês sobre o saldo de principal.
 * - PRICE, pagamento avulso/antecipado: tudo amortiza (antecipação abate juros futuros).
 * - MONTHLY_ON_BALANCE: juros pró-rata desde o último pagamento; se o pagamento não cobrir
 *   os juros, a amortização fica negativa (o que falta de juros soma ao saldo).
 */
export function splitPayment(opts: {
  type: LoanInterestType;
  amountCents: number;
  outstandingPrincipalCents: number;
  monthlyRate: number;
  isScheduledInstallment: boolean;
  lastEventDate: string; // último pagamento confirmado, ou data do empréstimo
  paymentDate: string;
}): PaymentSplit {
  const { type, amountCents, outstandingPrincipalCents, monthlyRate } = opts;
  let interest = 0;
  if (type === "PRICE" && opts.isScheduledInstallment) {
    interest = Math.round(outstandingPrincipalCents * monthlyRate);
  } else if (type === "MONTHLY_ON_BALANCE") {
    interest = accruedInterest(outstandingPrincipalCents, monthlyRate, opts.lastEventDate, opts.paymentDate);
  }
  // Na Price os juros nunca passam do pagamento; no saldo mensal o excedente vira amortização negativa.
  if (type === "PRICE") interest = Math.min(interest, amountCents);
  return { principalCents: amountCents - interest, interestCents: interest };
}

/** Saldo devedor em uma data: principal restante + juros acumulados desde o último pagamento. */
export function outstandingBalance(opts: {
  type: LoanInterestType;
  outstandingPrincipalCents: number;
  monthlyRate: number;
  lastEventDate: string;
  onDate: string;
}): number {
  if (opts.type === "NONE") return Math.max(opts.outstandingPrincipalCents, 0);
  return (
    Math.max(opts.outstandingPrincipalCents, 0) +
    accruedInterest(opts.outstandingPrincipalCents, opts.monthlyRate, opts.lastEventDate, opts.onDate)
  );
}
