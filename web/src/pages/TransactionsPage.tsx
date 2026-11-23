import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Transaction, type TxType } from "../api";
import { currentMonth, money } from "../format";
import { MonthPicker } from "../components/MonthPicker";
import { TransactionList } from "../components/TransactionList";
import { useTransactionEditor } from "../useTransactionEditor";

export function TransactionsPage() {
  const [month, setMonth] = useState(currentMonth());
  const [items, setItems] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<TxType | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    api.transactions(month).then(setItems).catch((e) => setError(e.message));
  }, [month]);
  useEffect(load, [load]);
  const editor = useTransactionEditor(load);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(
      (t) =>
        (filter === "ALL" || t.type === filter) &&
        (!q || t.description.toLowerCase().includes(q) || t.category?.name.toLowerCase().includes(q)),
    );
  }, [items, filter, search]);

  const total = visible.reduce((s, t) => s + (t.type === "INCOME" ? t.amountCents : -t.amountCents), 0);

  return (
    <>
      <header className="page-head">
        <h1>Lançamentos</h1>
        <MonthPicker value={month} onChange={setMonth} />
      </header>

      <div className="toolbar">
        <div className="segmented small-seg">
          {(
            [
              ["ALL", "Todos"],
              ["INCOME", "Receitas"],
              ["EXPENSE", "Despesas"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} className={filter === v ? "active" : ""} onClick={() => setFilter(v)}>
              {l}
            </button>
          ))}
        </div>
        <input
          className="search"
          type="search"
          placeholder="Buscar…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn primary desktop-only" onClick={editor.openNew}>
          Novo lançamento
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <section className="card">
        <TransactionList items={visible} onSelect={editor.openEdit} />
        {visible.length > 0 && (
          <div className="list-total">
            <span className="muted">Total ({visible.length})</span>
            <strong className={total < 0 ? "neg" : "pos"}>{money(total)}</strong>
          </div>
        )}
      </section>

      <button className="fab mobile-only" aria-label="Novo lançamento" onClick={editor.openNew}>
        +
      </button>
      {editor.modal}
    </>
  );
}
