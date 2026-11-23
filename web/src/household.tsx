import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type HouseholdInfo, type Scope } from "./api";
import { useAuth } from "./auth";

interface HouseholdCtx {
  info: HouseholdInfo | null;
  myId: string;
  /** grupo com mais de uma pessoa: mostra Responsável, abas Eu/Família etc. */
  isFamily: boolean;
  memberName: (id: string | null | undefined) => string;
  reload: () => void;
  scope: Scope;
  setScope: (s: Scope) => void;
}

const Ctx = createContext<HouseholdCtx | null>(null);
const SCOPE_KEY = "gf_scope";

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [info, setInfo] = useState<HouseholdInfo | null>(null);
  const [scope, setScopeState] = useState<Scope>(() => {
    try {
      return (localStorage.getItem(SCOPE_KEY) as Scope) || "eu";
    } catch {
      return "eu";
    }
  });
  const reload = useCallback(() => {
    api.household().then(setInfo).catch(() => {});
  }, []);
  useEffect(reload, [reload]);

  const setScope = (s: Scope) => {
    setScopeState(s);
    try {
      localStorage.setItem(SCOPE_KEY, s);
    } catch {
      /* preferência só local */
    }
  };
  const isFamily = (info?.members.length ?? 0) > 1;
  const myId = user?.id ?? "";
  const memberName = (id: string | null | undefined) =>
    id ? (id === myId ? "Eu" : (info?.members.find((m) => m.userId === id)?.name.split(" ")[0] ?? "Ex-membro")) : "Família";

  return (
    <Ctx.Provider value={{ info, myId, isFamily, memberName, reload, scope: isFamily ? scope : "eu", setScope }}>
      {children}
    </Ctx.Provider>
  );
}

export function useHousehold() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useHousehold fora do HouseholdProvider");
  return c;
}
