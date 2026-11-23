import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { buildSchedule, splitPayment, type LoanInterestType } from "./loans.js";

type Db = Prisma.TransactionClient;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const d = (s: string) => new Date(`${s}T00:00:00Z`);

/** Estado atual: saldo de principal e data do último evento (último pagamento ou início). */
export async function loanState(db: Db, loanId: string) {
  const loan = await db.loan.findUniqueOrThrow({ where: { id: loanId } });
  const paid = await db.transaction.findMany({
    where: { loanId, type: "LOAN_PAYMENT", status: "PAID" },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  const amortized = paid.reduce((s, t) => s + (t.loanPrincipalCents ?? t.amountCents), 0);
  const last = paid.at(-1);
  return {
    loan,
    rate: loan.monthlyRate ? Number(loan.monthlyRate) : 0,
    type: loan.interestType as LoanInterestType,
    outstanding: loan.principalCents - amortized,
    lastEventDate: last ? iso(last.date) : iso(loan.startDate),
  };
}

/** Divide um pagamento em juros + amortização conforme o tipo do empréstimo. */
export async function computeSplit(db: Db, loanId: string, amountCents: number, paymentDate: string, scheduled: boolean) {
  const s = await loanState(db, loanId);
  return splitPayment({
    type: s.type,
    amountCents,
    outstandingPrincipalCents: s.outstanding,
    monthlyRate: s.rate,
    isScheduledInstallment: scheduled,
    lastEventDate: s.lastEventDate,
    paymentDate,
  });
}

/**
 * Depois de qualquer pagamento (ou desfazer): recalcula as parcelas previstas com o saldo atual,
 * mantendo as datas e a quantidade; quita o empréstimo se o saldo zerou.
 */
export async function recalcLoan(db: Db, loanId: string) {
  const s = await loanState(db, loanId);
  const pending = await db.transaction.findMany({
    where: { loanId, type: "LOAN_PAYMENT", status: "PENDING" },
    orderBy: [{ date: "asc" }, { loanInstallmentNumber: "asc" }],
  });

  if (s.outstanding <= 0) {
    await db.transaction.deleteMany({ where: { loanId, type: "LOAN_PAYMENT", status: "PENDING" } });
    if (s.loan.status !== "PAID_OFF") {
      await db.loan.update({ where: { id: loanId }, data: { status: "PAID_OFF", paidOffAt: d(s.lastEventDate) } });
    }
    return;
  }
  if (s.loan.status === "PAID_OFF") await db.loan.update({ where: { id: loanId }, data: { status: "ACTIVE", paidOffAt: null } });
  if (pending.length === 0) return;

  const schedule = buildSchedule({
    type: s.type,
    principalCents: s.outstanding,
    monthlyRate: s.rate,
    count: pending.length,
    firstDueDate: iso(pending[0].date),
  });
  for (let i = 0; i < pending.length; i++) {
    const it = schedule[i];
    await db.transaction.update({
      where: { id: pending[i].id },
      data: {
        amountCents: it.amountCents,
        expectedAmountCents: it.amountCents,
        loanPrincipalCents: it.principalCents,
        loanInterestCents: it.interestCents,
      },
    });
  }
}

export { prisma };
