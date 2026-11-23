import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, householdStore, setUnauthorizedHandler, tokenStore, type User } from "./api";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Troca o grupo ativo e recarrega o app. */
  switchHousehold: (id: string) => void;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) return setLoading(false);
    api
      .me()
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, [logout]);

  const refreshUser = useCallback(async () => setUser(await api.me()), []);

  const login = async (email: string, password: string) => {
    const r = await api.login({ email, password });
    householdStore.clear();
    tokenStore.set(r.token);
    setUser(await api.me().catch(() => r.user));
  };

  const register = async (name: string, email: string, password: string) => {
    const r = await api.register({ name, email, password });
    householdStore.clear();
    tokenStore.set(r.token);
    setUser(await api.me().catch(() => r.user));
  };

  const switchHousehold = (id: string) => {
    householdStore.set(id);
    location.assign("/");
  };

  return <Ctx.Provider value={{ user, loading, login, register, logout, switchHousehold, refreshUser }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth fora do AuthProvider");
  return c;
}
