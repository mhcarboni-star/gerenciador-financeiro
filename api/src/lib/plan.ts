/**
 * Planejamento do mês, pelo regime de caixa (quando o dinheiro sai da conta).
 *
 * Itens do mês M:
 * - Receitas: INCOME em conta com data em M.
 * - Saídas em conta: EXPENSE e LOAN_PAYMENT em conta com data em M.
 * - Cartão: compras/estornos das faturas que VENCEM em M (o que se compra no cartão
 *   em um mês pesa no mês do vencimento da fatura).
 *
 * Cada saída é COMPROMISSO (já se sabe que vai acontecer: recorrência, parcela, empréstimo
 * ou previsão cadastrada como pendente) ou GASTO DO DIA A DIA (compra avulsa).
 *
 * Disponível para gastar = receitas − compromissos − meta de guardar.
 * Resta = disponível − gastos do dia a dia já feitos.
 */

export type CommitmentKind = "FIXED" | "INSTALLMENT" | "LOAN" | "PLANNED";

export interface PlanItem {
  id: string;
  type: "INCOME" | "EXPENSE" | "LOAN_PAYMENT";
  status: "PAID" | "PENDING";
  description: string;
  amountCents: number;
  date: string; // data do lançamento
  cashDate: string; // quando o dinheiro sai: data (conta) ou vencimento da fatura (cartão)
  viaCard: boolean;
  recurrenceId: string | null;
  installmentPlanId: string | null;
  categoryId: string | null; // categoria principal (subcategoria já agrupada)
  sourceName: string | null;
  responsibleId?: string | null; // null = Família (conjunto)
}

/**
 * Compromisso = já se sabe que vai acontecer: recorrência, parcela, empréstimo, ou lançamento
 * avulso previsto (pendente) ou com data FUTURA (já lançado para frente, mesmo marcado como pago).
 * Gasto do dia a dia = compra avulsa com data de hoje ou anterior.
 * No cartão, vale a data da compra (a fatura futura não torna a compra um compromisso).
 */
export function commitmentKind(i: PlanItem, today?: string): CommitmentKind | null {
  if (i.type === "LOAN_PAYMENT") return "LOAN";
  if (i.installmentPlanId) return "INSTALLMENT";
  if (i.recurrenceId) return "FIXED";
  if (i.status === "PENDING") return "PLANNED";
  if (today && i.date > today) return "PLANNED";
  return null; // gasto do dia a dia
}

export interface PlanResult {
  incomeCents: number;
  commitmentsCents: number;
  commitmentsByKind: Record<CommitmentKind, number>;
  savingsGoalCents: number;
  availableCents: number;
  variableSpentCents: number;
  remainingCents: number;
  /** compras avulsas no cartão feitas antes do mês, mas que vencem nele */
  cardCarryCents: number;
  perDayCents: number;
  daysLeft: number;
  spentByCategory: Map<string | null, number>;
}

function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function computePlan(items: PlanItem[], opts: { month: string; savingsGoalCents: number; today: string }): PlanResult {
  const byKind: Record<CommitmentKind, number> = { FIXED: 0, INSTALLMENT: 0, LOAN: 0, PLANNED: 0 };
  let income = 0;
  let variable = 0;
  let cardCarry = 0;
  const spentByCategory = new Map<string | null, number>();

  for (const i of items) {
    if (i.type === "INCOME" && !i.viaCard) {
      income += i.amountCents;
      continue;
    }
    // estorno no cartão reduz a fatura (conta como gasto negativo)
    const amount = i.type === "INCOME" ? -i.amountCents : i.amountCents;
    const kind = i.type === "INCOME" ? null : commitmentKind(i, opts.today);
    if (kind) {
      byKind[kind] += amount;
    } else {
      variable += amount;
      spentByCategory.set(i.categoryId, (spentByCategory.get(i.categoryId) ?? 0) + amount);
      if (i.viaCard && i.date.slice(0, 7) < opts.month) cardCarry += amount;
    }
  }

  const commitments = byKind.FIXED + byKind.INSTALLMENT + byKind.LOAN + byKind.PLANNED;
  const available = income - commitments - opts.savingsGoalCents;
  const remaining = available - variable;

  // Dias restantes: mês atual = de hoje até o fim; futuro = mês inteiro; passado = 0.
  const total = daysInMonth(opts.month);
  const curMonth = opts.today.slice(0, 7);
  const daysLeft = opts.month > curMonth ? total : opts.month === curMonth ? total - Number(opts.today.slice(8, 10)) + 1 : 0;

  return {
    incomeCents: income,
    commitmentsCents: commitments,
    commitmentsByKind: byKind,
    savingsGoalCents: opts.savingsGoalCents,
    availableCents: available,
    variableSpentCents: variable,
    remainingCents: remaining,
    cardCarryCents: cardCarry,
    perDayCents: daysLeft > 0 ? Math.floor(Math.max(remaining, 0) / daysLeft) : 0,
    daysLeft,
    spentByCategory,
  };
}
