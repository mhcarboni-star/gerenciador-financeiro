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
}

export interface Transaction {
  id: string;
  description: string;
  amountCents: number;
  type: TxType;
  date: string;
  notes: string | null;
  categoryId: string | null;
  category: Category | null;
}

export interface TransactionInput {
  description: string;
  amountCents: number;
  type: TxType;
  date: string;
  categoryId: string | null;
  notes: string | null;
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
  createCategory: (d: Omit<Category, "id">) =>
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

  summary: (month: string) => request<Summary>(`/summary?month=${month}`),
};
