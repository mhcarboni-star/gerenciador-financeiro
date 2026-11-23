export type TxType = "INCOME" | "EXPENSE";

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
  type: TxType;
  date: string;
  notes: string | null;
  categoryId: string | null;
  category: Category | null;
  status: "PAID" | "PENDING";
  accountId: string | null;
  creditCardId: string | null;
  account: SourceRef;
  creditCard: SourceRef;
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

  summary: (month: string) => request<Summary>(`/summary?month=${month}`),
};
