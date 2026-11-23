import type { Transaction } from "../api";
import { money, shortDate } from "../format";

export function TransactionList({ items, onSelect }: { items: Transaction[]; onSelect: (t: Transaction) => void }) {
  if (items.length === 0) return <p className="muted empty">Nenhum lançamento neste mês.</p>;
  return (
    <ul className="tx-list">
      {items.map((t) => (
        <li key={t.id}>
          <button className="tx" onClick={() => onSelect(t)}>
            <span className="dot" style={{ background: t.category?.color ?? "#94a3b8" }} />
            <span className="tx-main">
              <span className="tx-desc">{t.description}</span>
              <span className="muted small">
                {shortDate(t.date)} · {t.category?.name ?? "Sem categoria"}
                {(t.creditCard ?? t.account) && ` · ${(t.creditCard ?? t.account)!.name}`}
                {t.status === "PENDING" && " · previsto"}
              </span>
            </span>
            <span className={`tx-amount ${t.type === "INCOME" ? "pos" : "neg"}`}>
              {t.type === "INCOME" ? "+" : "−"} {money(t.amountCents)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
