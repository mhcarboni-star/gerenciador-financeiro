import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Summary, type Transaction } from "../api";
import { currentMonth, money } from "../format";
import { MonthPicker } from "../components/MonthPicker";
import { TransactionList } from "../components/TransactionList";
import { useTransactionEditor } from "../useTransactionEditor";
import { useAuth } from "../auth";

export function DashboardPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    Promise.all([api.summary(month), api.transactions(month)])
      .then(([s, t]) => {
        setSummary(s);
        setRecent(t.slice(0, 6));
      })
      .catch((e) => setError(e.message));
  }, [month]);

  useEffect(load, [load]);
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
