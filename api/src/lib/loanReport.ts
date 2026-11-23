import { prisma } from "./prisma.js";

export type LoanInterestType = "NONE" | "PRICE" | "MONTHLY_ON_BALANCE";

export interface StatementLine {
  number: number | null; // nº da parcela; null = pagamento avulso
  date: string;
  status: "PAID" | "PENDING";
  description: string;
  amountCents: number;
  interestCents: number | null;
  principalCents: number | null;
  balanceAfterCents: number; // saldo de principal após a linha (previsto para pendentes)
}

export interface LoanReport {
  id: string;
  name: string;
  lender: string | null;
  interestType: LoanInterestType;
  monthlyRate: number | null;
  installmentCount: number | null;
  principalCents: number;
  startDate: string;
  status: "ACTIVE" | "PAID_OFF" | "CANCELLED";
  paidOffAt: string | null;
  principalOutstandingCents: number;
  accruedInterestCents: number;
  balanceTodayCents: number;
  totalPaidCents: number;
  interestPaidCents: number;
  paidInstallments: number;
  pendingInstallments: number;
  pendingAmountCents: number;
  nextDueDate: string | null;
  statement: StatementLine[];
}

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

interface BalanceRow {
  loanId: string;
  principalOutstandingCents: number;
  accruedInterestCents: number;
  totalPaidCents: number;
  interestPaidCents: number;
  paidInstallments: number;
  pendingInstallments: number;
  pendingAmountCents: number;
  nextDueDate: Date | null;
}

/** Dados do relatório de empréstimos de um grupo (todos, ou só os ativos). */
export async function buildLoanReport(householdId: string, opts: { onlyActive?: boolean } = {}): Promise<LoanReport[]> {
  const loans = await prisma.loan.findMany({
    where: { householdId, ...(opts.onlyActive ? { status: "ACTIVE" } : { status: { not: "CANCELLED" } }) },
    include: {
      transactions: {
        where: { type: "LOAN_PAYMENT" },
        orderBy: [{ date: "asc" }, { loanInstallmentNumber: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ status: "asc" }, { startDate: "asc" }],
  });
  if (loans.length === 0) return [];

  const balances = await prisma.$queryRaw<BalanceRow[]>`
    SELECT * FROM loan_balances WHERE "householdId" = ${householdId}`;
  const byId = new Map(balances.map((b) => [b.loanId, b]));

  return loans.map((l) => {
    const b = byId.get(l.id)!;
    // Pagos primeiro (em ordem de data), depois os previstos: o saldo previsto parte do saldo real.
    const paid = l.transactions.filter((t) => t.status === "PAID");
    const pending = l.transactions.filter((t) => t.status === "PENDING");
    let balance = l.principalCents;
    const statement: StatementLine[] = [...paid, ...pending].map((t) => {
      balance -= t.loanPrincipalCents ?? t.amountCents;
      return {
        number: t.loanInstallmentNumber,
        date: iso(t.date)!,
        status: t.status,
        description: t.description,
        amountCents: t.amountCents,
        interestCents: t.loanInterestCents,
        principalCents: t.loanPrincipalCents,
        balanceAfterCents: Math.max(balance, 0),
      };
    });

    return {
      id: l.id,
      name: l.name,
      lender: l.lender,
      interestType: l.interestType,
      monthlyRate: l.monthlyRate === null ? null : Number(l.monthlyRate),
      installmentCount: l.installmentCount,
      principalCents: l.principalCents,
      startDate: iso(l.startDate)!,
      status: l.status,
      paidOffAt: iso(l.paidOffAt),
      principalOutstandingCents: b.principalOutstandingCents,
      accruedInterestCents: b.accruedInterestCents,
      balanceTodayCents: b.principalOutstandingCents + b.accruedInterestCents,
      totalPaidCents: b.totalPaidCents,
      interestPaidCents: b.interestPaidCents,
      paidInstallments: b.paidInstallments,
      pendingInstallments: b.pendingInstallments,
      pendingAmountCents: b.pendingAmountCents,
      nextDueDate: iso(b.nextDueDate),
      statement,
    };
  });
}
