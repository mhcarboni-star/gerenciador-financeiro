import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Account, type MonthPlan, type Pending, type Summary, type Transaction } from "../api";
import { currentMonth, monthLabel, money, shiftMonth } from "../format";
import { MonthPicker } from "../components/MonthPicker";
import { TransactionList } from "../components/TransactionList";
import { PendingPanel } from "../components/PendingPanel";
import { ScopeTabs } from "../components/ResponsibleSelect";
import { useTransactionEditor } from "../useTransactionEditor";
import { useAuth } from "../auth";
import { useHousehold } from "../household";

export function DashboardPage() {
  const { user } = useAuth();
  const { scope, isFamily, myId, info } = useHousehold();
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [plan, setPlan] = useState<MonthPlan | null>(null);
  const [nextPlan, setNextPlan] = useState<MonthPlan | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState("");
  const family = scope === "familia";

  const load = useCallback(() => {
    setError("");
    const cur = currentMonth();
    Promise.all([
      api.summary(month, scope),
      api.transactions(month),
      api.pending(),
      api.plan(cur, scope),
      api.plan(shiftMonth(cur, 1), scope),
      api.accounts(),
    ])
      .then(([s, t, p, pl, np, acc]) => {
        setSummary(s);
        setRecent((family ? t : t.filter((x) => x.responsibleId === myId || !isFamily)).slice(0, 6));
        // Na visão "Eu", só o que está no meu nome; na Família, tudo
        const mine = (x: Transaction) => family || !isFamily || x.responsibleId === myId;
        setPending({ ...p, overdue: p.overdue.filter(mine), dueToday: p.dueToday.filter(mine), upcoming: p.upcoming.filter(mine) });
        setPlan(pl);
        setNextPlan(np);
        setAccounts(acc);
      })
      .catch((e) => setError(e.message));
  }, [month, scope, family, isFamily, myId]);
  useEffect(load, [load]);
  const editor = useTransactionEditor(load);

  const expenses = summary?.byCategory.filter((c) => c.type === "EXPENSE") ?? [];
  const maxExpense = Math.max(1, ...expenses.map((c) => c.totalCents));
  const totalBalance = accounts.filter((a) => a.includeInTotals).reduce((s, a) => s + a.balanceCents, 0);
  const curName = (m: string) => monthLabel(m).split(" ")[0].toLowerCase();

  return (
    <>
      <header className="page-head">
        <div>
          <p className="muted small">{family ? info?.name : `Olá, ${user?.name.split(" ")[0]}`}</p>
          <h1>{family ? "Família" : "Resumo"}</h1>
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </header>
      {isFamily && (
        <div className="scope-bar">
          <ScopeTabs />
          {family && <Link to="/familia" className="small">Membros e convites ›</Link>}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <PendingPanel data={pending} onConfirm={editor.openConfirm} />

      {plan && nextPlan && (
        <section className="plan-cards">
          <Link to={`/planejamento?mes=${plan.month}`} className={`card plan-mini ${plan.remainingCents < 0 ? "over" : ""}`}>
            <span className="muted small">{family ? "A família ainda pode gastar" : "Ainda posso gastar"} em {curName(plan.month)}</span>
            <strong className={plan.remainingCents < 0 ? "neg" : ""}>{money(plan.remainingCents)}</strong>
            <span className="muted small">
              {plan.incomeCents === 0
                ? "Cadastre as receitas previstas ›"
                : `${plan.remainingCents >= 0 && plan.daysLeft > 0 ? `≈ ${money(plan.perDayCents)}/dia · ` : ""}de ${money(plan.availableCents)}`}
            </span>
          </Link>
          <Link to={`/planejamento?mes=${nextPlan.month}`} className="card plan-mini">
            <span className="muted small">{family ? "A família pode gastar" : "Posso gastar"} em {curName(nextPlan.month)}</span>
            <strong className={nextPlan.availableCents < 0 ? "neg" : ""}>{money(nextPlan.availableCents)}</strong>
            <span className="muted small">Planejar próximo mês ›</span>
          </Link>
        </section>
      )}

      <section className="stats">
        <div className="card stat">
          <span className="muted small">{family ? "Entradas de todos" : "Minhas receitas"}</span>
          <strong className="pos">{money(summary?.incomeCents ?? 0)}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">{family ? "Saídas de todos" : "Minhas despesas"}</span>
          <strong className="neg">{money(summary?.expenseCents ?? 0)}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Resultado do mês</span>
          <strong className={(summary?.balanceCents ?? 0) < 0 ? "neg" : ""}>{money(summary?.balanceCents ?? 0)}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">{isFamily ? "Saldo das contas (grupo)" : "Saldo acumulado"}</span>
          <strong className={totalBalance < 0 ? "neg" : ""}>{money(isFamily ? totalBalance : (summary?.accumulatedCents ?? 0))}</strong>
        </div>
      </section>

      {family && summary?.byPerson && plan && <FamilyBreakdown summary={summary} plan={plan} month={month} />}

      <div className="grid-2">
        <section className="card">
          <h2>{family ? "Saídas da família por categoria" : "Minhas despesas por categoria"}</h2>
          {expenses.length === 0 ? (
            <p className="muted empty">Sem despesas neste mês.</p>
          ) : (
            <ul className="bars">
              {expenses.map((c) => (
                <li key={c.categoryId ?? "none"}>
                  <div className="bar-label">
                    <span>{c.name}</span>
                    <span>{money(c.totalCents)}</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar" style={{ width: `${(c.totalCents / maxExpense) * 100}%`, background: c.color }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="section-head">
            <h2>{family ? "Últimos lançamentos" : "Meus últimos lançamentos"}</h2>
            <Link to="/lancamentos" className="small">Ver todos</Link>
          </div>
          <TransactionList items={recent} onSelect={editor.openEdit} />
        </section>
      </div>

      <button className="fab" aria-label="Novo lançamento" onClick={editor.openNew}>+</button>
      {editor.modal}
    </>
  );
}

/** Quanto cada pessoa (e a parte conjunta) entrou, saiu e ainda pode gastar. */
function FamilyBreakdown({ summary, plan, month }: { summary: Summary; plan: MonthPlan; month: string }) {
  const { myId } = useHousehold();
  const people = summary.byPerson ?? [];
  const totalIn = Math.max(1, people.reduce((s, p) => s + p.incomeCents, 0));
  const isCurrent = month === currentMonth();
  const label = (id: string | null, name: string) => (id === myId ? `${name.split(" ")[0]} (eu)` : id ? name.split(" ")[0] : "Família (conjunto)");
  return (
    <section className="card family-card">
      <h2>Por pessoa · {monthLabel(month)}</h2>
      <div className="people">
        {people.map((p) => {
          const pl = plan.byMember.find((m) => m.userId === p.userId);
          return (
            <div key={p.userId ?? "familia"} className={`person ${p.userId ? "" : "joint"}`}>
              <div className="person-head">
                <span className={`avatar ${p.userId ? "" : "joint"}`}>{p.userId ? p.name.charAt(0).toUpperCase() : "⌂"}</span>
                <strong>{label(p.userId, p.name)}</strong>
              </div>
              <dl>
                <div><dt>Entradas</dt><dd className="pos">{money(p.incomeCents)}</dd></div>
                <div><dt>Saídas</dt><dd className="neg">{money(p.expenseCents)}</dd></div>
                <div><dt>Resultado</dt><dd className={p.balanceCents < 0 ? "neg" : ""}>{money(p.balanceCents)}</dd></div>
                {p.userId && pl && isCurrent && (
                  <div><dt>Ainda pode gastar</dt><dd className={pl.remainingCents < 0 ? "neg" : ""}>{money(pl.remainingCents)}</dd></div>
                )}
              </dl>
              {p.userId && p.incomeCents > 0 && (
                <span className="muted small">{Math.round((p.incomeCents / totalIn) * 100)}% das entradas da família</span>
              )}
              {!p.userId && <span className="muted small">Contas da casa (aluguel, condomínio…), sem dono individual</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
