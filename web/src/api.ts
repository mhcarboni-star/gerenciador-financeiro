export type TxType = "INCOME" | "EXPENSE";
export type AnyTxType = TxType | "TRANSFER" | "INVOICE_PAYMENT" | "LOAN_RECEIPT" | "LOAN_PAYMENT";
export type Frequency = "WEEKLY" | "MONTHLY" | "YEARLY";

export interface User {
  id: string;
  name: string;
  email: string;
}

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
  destinationAccountId: string | null;
  destinationAccount: SourceRef;
  invoiceId: string | null;
  recurrenceId: string | null;
  installmentPlanId: string | null;
  installmentNumber: number | null;
  expectedAmountCents: number | null;
  loan: { id: string; name: string } | null;
  recurrence?: { id: string; amountIsEstimate: boolean; amountCents: number } | null;
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
}

export interface Summary {
  month: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  accumulatedCents: number;
  byCategory: { categoryId: string | null; name: string; color: string; type: TxType; totalCents: number }[];
}

const TOKEN_KEY = "gf_token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
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
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
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

  summary: (month: string) => request<Summary>(`/summary?month=${month}`),
};
