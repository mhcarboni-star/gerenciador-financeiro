import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type MonthPlan, type Pending, type Summary, type Transaction } from "../api";
import { PendingPanel } from "../components/PendingPanel";
import { currentMonth, monthLabel, money, shiftMonth } from "../format";
import { MonthPicker } from "../components/MonthPicker";
import { TransactionList } from "../components/TransactionList";
import { useTransactionEditor } from "../useTransactionEditor";
import { useAuth } from "../auth";

export function DashboardPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [plan, setPlan] = useState<MonthPlan | null>(null);
  const [nextPlan, setNextPlan] = useState<MonthPlan | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    Promise.all([api.summary(month), api.transactions(month), api.pending()])
      .then(([s, t, p]) => {
        setSummary(s);
        setRecent(t.slice(0, 6));
        setPending(p);
      })
      .catch((e) => setError(e.message));
  }, [month]);

  useEffect(load, [load]);
  useEffect(() => {
    api.plan(currentMonth()).then(setPlan).catch(() => {});
    api.plan(shiftMonth(currentMonth(), 1)).then(setNextPlan).catch(() => {});
  }, [recent]);
  const editor = useTransactionEditor(load);

  const expenses = summary?.byCategory.filter((c) => c.type === "EXPENSE") ?? [];
  const maxExpense = Math.max(1, ...expenses.map((c) => c.totalCents));

  return (
    <>
      <header className="page-head">
        <div>
          <p className="muted small">Olá, {user?.name.split(" ")[0]}</p>
          <h1>Resumo</h1>
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </header>

      {error && <p className="error">{error}</p>}

      <PendingPanel data={pending} onConfirm={editor.openConfirm} />

      {plan && nextPlan && (
        <section className="plan-cards">
          <Link to={`/planejamento?mes=${plan.month}`} className={`card plan-mini ${plan.remainingCents < 0 ? "over" : ""}`}>
            <span className="muted small">Ainda posso gastar em {monthLabel(plan.month).split(" ")[0].toLowerCase()}</span>
            <strong className={plan.remainingCents < 0 ? "neg" : ""}>{money(plan.remainingCents)}</strong>
            <span className="muted small">
              {plan.incomeCents === 0
                ? "Cadastre suas receitas previstas ›"
                : `${plan.remainingCents >= 0 && plan.daysLeft > 0 ? `≈ ${money(plan.perDayCents)}/dia · ` : ""}de ${money(plan.availableCents)}`}
            </span>
          </Link>
          <Link to={`/planejamento?mes=${nextPlan.month}`} className="card plan-mini">
            <span className="muted small">Posso gastar em {monthLabel(nextPlan.month).split(" ")[0].toLowerCase()}</span>
            <strong className={nextPlan.availableCents < 0 ? "neg" : ""}>{money(nextPlan.availableCents)}</strong>
            <span className="muted small">Planejar próximo mês ›</span>
          </Link>
        </section>
      )}

      <section className="stats">
        <div className="card stat">
          <span className="muted small">Receitas</span>
          <strong className="pos">{money(summary?.incomeCents ?? 0)}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Despesas</span>
          <strong className="neg">{money(summary?.expenseCents ?? 0)}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Saldo do mês</span>
          <strong className={(summary?.balanceCents ?? 0) < 0 ? "neg" : ""}>{money(summary?.balanceCents ?? 0)}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Saldo acumulado</span>
          <strong className={(summary?.accumulatedCents ?? 0) < 0 ? "neg" : ""}>
            {money(summary?.accumulatedCents ?? 0)}
          </strong>
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>Despesas por categoria</h2>
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
            <h2>Últimos lançamentos</h2>
            <Link to="/lancamentos" className="small">
              Ver todos
            </Link>
          </div>
          <TransactionList items={recent} onSelect={editor.openEdit} />
        </section>
      </div>

      <button className="fab" aria-label="Novo lançamento" onClick={editor.openNew}>
        +
      </button>
      {editor.modal}
    </>
  );
}
