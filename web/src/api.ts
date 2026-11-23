export type TxType = "INCOME" | "EXPENSE";
export type AnyTxType = TxType | "TRANSFER" | "INVOICE_PAYMENT" | "LOAN_RECEIPT" | "LOAN_PAYMENT" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT";
export type Frequency = "WEEKLY" | "MONTHLY" | "YEARLY";

export interface User {
  id: string;
  name: string;
  email: string;
  households?: { id: string; name: string; role: "OWNER" | "MEMBER" }[];
  activeHouseholdId?: string;
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "MEMBER";
}

export interface HouseholdInfo {
  id: string;
  name: string;
  myRole: "OWNER" | "MEMBER";
  members: Member[];
  invites: { id: string; email: string; token: string; expiresAt: string; invitedBy: string }[];
}

export type Scope = "eu" | "familia";

export interface Category {
  id: string;
  name: string;
  type: TxType;
  color: string;
  parentId: string | null;
}

export type AccountType = "CHECKING" | "SAVINGS" | "CASH" | "INVESTMENT" | "OTHER";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  institution: string | null;
  initialBalanceCents: number;
  color: string;
  includeInTotals: boolean;
  archivedAt: string | null;
  balanceCents: number;
  projectedBalanceCents: number;
  lastAdjustment: { date: string; balanceCents: number } | null;
}

export type AccountInput = Pick<Account, "name" | "type" | "institution" | "initialBalanceCents" | "color" | "includeInTotals">;

export interface CreditCard {
  id: string;
  name: string;
  brand: string | null;
  limitCents: number;
  closingDay: number;
  dueDay: number;
  paymentAccountId: string | null;
  color: string;
  archivedAt: string | null;
  usedCents: number;
  availableCents: number;
  currentInvoice: {
    id: string | null;
    referenceMonth: string;
    closingDate: string;
    dueDate: string;
    totalCents: number;
    projectedTotalCents: number;
  };
}

export type CardInput = Pick<CreditCard, "name" | "brand" | "limitCents" | "closingDay" | "dueDay" | "paymentAccountId" | "color">;

type SourceRef = { id: string; name: string; color: string } | null;

export interface Transaction {
  id: string;
  description: string;
  amountCents: number;
  type: AnyTxType;
  date: string;
  notes: string | null;
  categoryId: string | null;
  category: Category | null;
  status: "PAID" | "PENDING";
  accountId: string | null;
  creditCardId: string | null;
  account: SourceRef;
  creditCard: SourceRef;
  responsibleId: string | null;
  responsible: { id: string; name: string } | null;
  destinationAccountId: string | null;
  destinationAccount: SourceRef;
  invoiceId: string | null;
  recurrenceId: string | null;
  installmentPlanId: string | null;
  installmentNumber: number | null;
  expectedAmountCents: number | null;
  loan: { id: string; name: string } | null;
  recurrence?: { id: string; amountIsEstimate: boolean; amountCents: number } | null;
  /** Data anterior ao último ajuste de saldo da conta: só registro, não muda o saldo. */
  beforeAdjustment?: boolean;
}

export interface TransferInput {
  description?: string;
  amountCents: number;
  date: string;
  accountId: string;
  destinationAccountId: string;
  notes: string | null;
}

export interface InstallmentInput {
  description: string;
  totalAmountCents: number;
  installmentCount: number;
  firstDate: string;
  accountId: string | null;
  creditCardId: string | null;
  categoryId: string | null;
  notes: string | null;
  responsibleId?: string | null;
}

export interface RecurrenceInput {
  type: TxType;
  description: string;
  amountCents: number;
  frequency: Frequency;
  interval: number;
  startDate: string;
  endDate: string | null;
  accountId: string | null;
  creditCardId: string | null;
  categoryId: string | null;
  amountIsEstimate: boolean;
  autoMarkPaid: boolean;
  responsibleId?: string | null;
}

export interface Recurrence extends RecurrenceInput {
  id: string;
  active: boolean;
  nextDate: string;
  category: { id: string; name: string; color: string } | null;
  account: { id: string; name: string } | null;
  creditCard: { id: string; name: string } | null;
  nextPending: { id: string; date: string; amountCents: number } | null;
}

export type LoanInterestType = "NONE" | "PRICE" | "MONTHLY_ON_BALANCE";

export interface LoanStatementLine {
  id: string;
  accountId: string | null;
  number: number | null;
  date: string;
  status: "PAID" | "PENDING";
  description: string;
  amountCents: number;
  interestCents: number | null;
  principalCents: number | null;
  balanceAfterCents: number;
}

export interface Loan {
  id: string;
  name: string;
  lender: string | null;
  color: string;
  notes: string | null;
  interestType: LoanInterestType;
  monthlyRate: number | null;
  installmentCount: number | null;
  principalCents: number;
  startDate: string;
  firstDueDate: string | null;
  receivedAccountId: string | null;
  paymentAccountId: string | null;
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
  statement: LoanStatementLine[];
}

export interface LoanInput {
  name: string;
  lender: string | null;
  principalCents: number;
  interestType: LoanInterestType;
  monthlyRate: number | null;
  installmentCount: number | null;
  startDate: string;
  firstDueDate: string | null;
  receivedAccountId: string | null;
  paymentAccountId: string;
  color: string;
  notes: string | null;
  responsibleId?: string | null;
}

export interface LoanPaymentInput {
  amountCents: number;
  date: string;
  accountId: string;
}

export type CommitmentKind = "FIXED" | "INSTALLMENT" | "LOAN" | "PLANNED";

export interface PlanItem {
  id: string;
  type: "INCOME" | "EXPENSE" | "LOAN_PAYMENT";
  status: "PAID" | "PENDING";
  description: string;
  amountCents: number;
  date: string;
  cashDate: string;
  viaCard: boolean;
  sourceName: string | null;
  kind?: CommitmentKind;
  responsibleName?: string;
}

export interface MemberPlan {
  userId: string | null;
  name: string;
  incomeCents: number;
  commitmentsCents: number;
  savingsGoalCents: number;
  availableCents: number;
  variableSpentCents: number;
  remainingCents: number;
}

export interface MonthPlan {
  month: string;
  scope: Scope;
  editableSavingsCents: number;
  byMember: MemberPlan[];
  today: string;
  incomeCents: number;
  commitmentsCents: number;
  commitmentsByKind: Record<CommitmentKind, number>;
  savingsGoalCents: number;
  availableCents: number;
  variableSpentCents: number;
  remainingCents: number;
  cardCarryCents: number;
  perDayCents: number;
  daysLeft: number;
  incomes: PlanItem[];
  commitments: PlanItem[];
  budgetedCents: number;
  unbudgetedCents: number;
  canCopyBudgets: boolean;
  budgets: { categoryId: string; name: string; color: string; limitCents: number | null; ownLimitCents: number | null; spentCents: number }[];
  uncategorizedSpentCents: number;
}

export interface AlertSettings {
  dueItemsEnabled: boolean;
  includeOverdue: boolean;
  sendHour: number;
  timezone: string;
}

export interface AlertsInfo {
  enabled: boolean;
  publicKey: string | null;
  settings: AlertSettings;
  notifyThisHousehold: boolean;
  devices: { id: string; endpoint: string; userAgent: string | null; createdAt: string; lastSuccessAt: string | null }[];
}

export interface Pending {
  today: string;
  overdue: Transaction[];
  dueToday: Transaction[];
  upcoming: Transaction[];
}

export interface ConfirmInput {
  amountCents: number;
  date: string;
  accountId: string | null;
  creditCardId: string | null;
  updateForecast: boolean;
}

export type InvoiceStatus = "OPEN" | "CLOSED" | "PAID";

export interface InvoiceSummary {
  id: string;
  referenceMonth: string;
  closingDate: string;
  dueDate: string;
  status: InvoiceStatus;
  totalCents: number;
  projectedTotalCents: number;
  paidCents: number;
}

export interface InvoiceDetail extends InvoiceSummary {
  creditCard: CreditCard;
  transactions: Transaction[];
}

export interface TransactionInput {
  description: string;
  amountCents: number;
  type: TxType;
  date: string;
  categoryId: string | null;
  notes: string | null;
  accountId: string | null;
  creditCardId: string | null;
  status?: "PAID" | "PENDING";
  responsibleId?: string | null;
}

export interface Summary {
  month: string;
  scope?: Scope;
  byPerson?: PersonSummary[];
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  accumulatedCents: number;
  byCategory: { categoryId: string | null; name: string; color: string; type: TxType; totalCents: number }[];
}

export interface PersonSummary {
  userId: string | null;
  name: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
}

const TOKEN_KEY = "gf_token";
const HOUSEHOLD_KEY = "gf_household";

const safe = <T,>(fn: () => T, fallback: T) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const tokenStore = {
  get: () => safe(() => localStorage.getItem(TOKEN_KEY), null),
  set: (t: string) => safe(() => localStorage.setItem(TOKEN_KEY, t), undefined),
  clear: () => safe(() => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(HOUSEHOLD_KEY); }, undefined),
};

/** Grupo ativo (para quem participa de mais de um). */
export const householdStore = {
  get: () => safe(() => localStorage.getItem(HOUSEHOLD_KEY), null),
  set: (id: string) => safe(() => localStorage.setItem(HOUSEHOLD_KEY, id), undefined),
  clear: () => safe(() => localStorage.removeItem(HOUSEHOLD_KEY), undefined),
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: Record<string, string[]>) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const household = householdStore.get();
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(token && household ? { "X-Household-Id": household } : {}),
      ...init.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    // grupo salvo não vale mais (saiu ou foi removido): volta para o grupo padrão
    if (res.status === 403 && household && body.error === "Sem acesso a este grupo") {
      householdStore.clear();
      location.reload();
    }
    const details = body.details as Record<string, string[]> | undefined;
    const first = details ? Object.values(details).flat()[0] : undefined;
    throw new ApiError(res.status, first ?? body.error ?? "Erro inesperado", details);
  }
  return body as T;
}

const json = (data: unknown) => JSON.stringify(data);

export const api = {
  register: (d: { name: string; email: string; password: string }) =>
    request<{ token: string; user: User }>("/auth/register", { method: "POST", body: json(d) }),
  login: (d: { email: string; password: string }) =>
    request<{ token: string; user: User }>("/auth/login", { method: "POST", body: json(d) }),
  me: () => request<User>("/auth/me"),

  categories: () => request<Category[]>("/categories"),
  createCategory: (d: Omit<Category, "id" | "parentId"> & { parentId?: string | null }) =>
    request<Category>("/categories", { method: "POST", body: json(d) }),
  updateCategory: (id: string, d: Partial<Omit<Category, "id">>) =>
    request<Category>(`/categories/${id}`, { method: "PUT", body: json(d) }),
  deleteCategory: (id: string) => request<void>(`/categories/${id}`, { method: "DELETE" }),

  transactions: (month: string) => request<Transaction[]>(`/transactions?month=${month}`),
  createTransaction: (d: TransactionInput) =>
    request<Transaction>("/transactions", { method: "POST", body: json(d) }),
  updateTransaction: (id: string, d: TransactionInput) =>
    request<Transaction>(`/transactions/${id}`, { method: "PUT", body: json(d) }),
  deleteTransaction: (id: string) => request<void>(`/transactions/${id}`, { method: "DELETE" }),

  accounts: (archived = false) => request<Account[]>(`/accounts${archived ? "?arquivadas=1" : ""}`),
  createAccount: (d: AccountInput) => request<Account>("/accounts", { method: "POST", body: json(d) }),
  updateAccount: (id: string, d: AccountInput) => request<Account>(`/accounts/${id}`, { method: "PUT", body: json(d) }),
  deleteAccount: (id: string) => request<{ archived: boolean }>(`/accounts/${id}`, { method: "DELETE" }),
  accountBalanceOn: (id: string, date: string) => request<{ date: string; balanceCents: number }>(`/accounts/${id}/saldo?data=${date}`),
  adjustBalance: (id: string, d: { balanceCents: number; date: string }) =>
    request<{ previousBalanceCents: number; deltaCents: number }>(`/accounts/${id}/ajustar-saldo`, { method: "POST", body: json(d) }),
  restoreAccount: (id: string) => request<Account>(`/accounts/${id}/reativar`, { method: "POST" }),

  cards: (archived = false) => request<CreditCard[]>(`/cards${archived ? "?arquivados=1" : ""}`),
  createCard: (d: CardInput) => request<CreditCard>("/cards", { method: "POST", body: json(d) }),
  updateCard: (id: string, d: CardInput) => request<CreditCard>(`/cards/${id}`, { method: "PUT", body: json(d) }),
  deleteCard: (id: string) => request<{ archived: boolean }>(`/cards/${id}`, { method: "DELETE" }),
  restoreCard: (id: string) => request<CreditCard>(`/cards/${id}/reativar`, { method: "POST" }),

  pending: () => request<Pending>("/transactions/pendentes"),
  confirm: (id: string, d: ConfirmInput) => request<Transaction>(`/transactions/${id}/confirmar`, { method: "POST", body: json(d) }),
  createTransfer: (d: TransferInput) => request<Transaction>("/transactions/transferencia", { method: "POST", body: json(d) }),
  updateTransfer: (id: string, d: TransferInput) =>
    request<Transaction>(`/transactions/transferencia/${id}`, { method: "PUT", body: json(d) }),

  createInstallments: (d: InstallmentInput) => request<{ id: string }>("/installments", { method: "POST", body: json(d) }),
  deleteInstallments: (planId: string) => request<void>(`/installments/${planId}`, { method: "DELETE" }),

  recurrences: () => request<Recurrence[]>("/recurrences"),
  createRecurrence: (d: RecurrenceInput) => request<Recurrence>("/recurrences", { method: "POST", body: json(d) }),
  updateRecurrence: (id: string, d: RecurrenceInput) => request<Recurrence>(`/recurrences/${id}`, { method: "PUT", body: json(d) }),
  endRecurrence: (id: string) => request<{ ok: true }>(`/recurrences/${id}/encerrar`, { method: "POST" }),

  cardInvoices: (cardId: string) => request<{ card: CreditCard; invoices: InvoiceSummary[] }>(`/invoices/card/${cardId}`),
  invoice: (id: string) => request<InvoiceDetail>(`/invoices/${id}`),
  payInvoice: (id: string, d: { accountId: string; amountCents: number; date: string }) =>
    request<{ paidOff: boolean }>(`/invoices/${id}/pagar`, { method: "POST", body: json(d) }),

  loans: () => request<Loan[]>("/loans"),
  loan: (id: string) => request<Loan>(`/loans/${id}`),
  createLoan: (d: LoanInput) => request<{ id: string }>("/loans", { method: "POST", body: json(d) }),
  updateLoan: (id: string, d: Pick<LoanInput, "name" | "lender" | "paymentAccountId" | "color" | "notes">) =>
    request<{ ok: true }>(`/loans/${id}`, { method: "PUT", body: json(d) }),
  deleteLoan: (id: string) => request<void>(`/loans/${id}`, { method: "DELETE" }),
  payLoan: (id: string, d: LoanPaymentInput) => request<Loan>(`/loans/${id}/pagamentos`, { method: "POST", body: json(d) }),
  confirmLoanPayment: (txId: string, d: LoanPaymentInput) =>
    request<Loan>(`/loans/pagamentos/${txId}/confirmar`, { method: "POST", body: json(d) }),
  undoLoanPayment: (txId: string) => request<Loan>(`/loans/pagamentos/${txId}`, { method: "DELETE" }),
  /** Baixa o PDF (precisa do token, por isso não é um link direto). */
  downloadLoansPdf: async () => {
    const res = await fetch("/api/loans/relatorio.pdf", { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
    if (!res.ok) throw new ApiError(res.status, "Não foi possível gerar o relatório");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "emprestimos.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },

  plan: (month: string, scope: Scope = "eu") => request<MonthPlan>(`/plan?month=${month}&escopo=${scope}`),
  setSavingsGoal: (month: string, savingsGoalCents: number, scope: Scope = "eu") =>
    request<{ ok: true }>(`/plan/${month}`, { method: "PUT", body: json({ savingsGoalCents, scope }) }),
  setBudgets: (month: string, items: { categoryId: string; limitCents: number | null }[], scope: Scope = "eu") =>
    request<{ ok: true }>(`/plan/${month}/orcamentos`, { method: "PUT", body: json({ items, scope }) }),
  copyPreviousPlan: (month: string, scope: Scope = "eu") =>
    request<{ copied: number }>(`/plan/${month}/copiar-anterior`, { method: "POST", body: json({ scope }) }),

  household: () => request<HouseholdInfo>("/household"),
  renameHousehold: (name: string) => request<{ ok: true }>("/household", { method: "PUT", body: json({ name }) }),
  createInvite: (email: string) => request<{ id: string; token: string; expiresAt: string }>("/household/convites", { method: "POST", body: json({ email }) }),
  cancelInvite: (id: string) => request<void>(`/household/convites/${id}`, { method: "DELETE" }),
  removeMember: (userId: string) => request<void>(`/household/membros/${userId}`, { method: "DELETE" }),
  leaveHousehold: () => request<void>("/household/sair", { method: "POST" }),
  inviteInfo: (token: string) => request<{ householdName: string; invitedBy: string; email: string; expiresAt: string }>(`/convites/${token}`),
  acceptInvite: (token: string) => request<{ householdId: string }>(`/convites/${token}/aceitar`, { method: "POST" }),

  alerts: () => request<AlertsInfo>("/avisos"),
  subscribePush: (d: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string }) =>
    request<{ ok: true }>("/avisos/inscricoes", { method: "POST", body: json(d) }),
  unsubscribePush: (endpoint: string) => request<void>("/avisos/inscricoes", { method: "DELETE", body: json({ endpoint }) }),
  removeDevice: (id: string) => request<void>(`/avisos/inscricoes/${id}`, { method: "DELETE" }),
  saveAlertSettings: (d: AlertSettings & { notifyThisHousehold: boolean }) =>
    request<{ ok: true }>("/avisos/preferencias", { method: "PUT", body: json(d) }),
  testAlert: () => request<{ reached: number }>("/avisos/teste", { method: "POST" }),

  summary: (month: string, scope: Scope = "eu") => request<Summary>(`/summary?month=${month}&escopo=${scope}`),
};
