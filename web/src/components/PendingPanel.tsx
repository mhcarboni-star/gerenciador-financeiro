import { useState } from "react";
import type { Pending, Transaction } from "../api";
import { money, shortDate } from "../format";

/** Lista "Para confirmar": atrasados e de hoje em destaque; próximos 7 dias recolhidos. */
export function PendingPanel({ data, onConfirm }: { data: Pending | null; onConfirm: (t: Transaction) => void }) {
  const [showUpcoming, setShowUpcoming] = useState(false);
  if (!data) return null;
  const urgent = [...data.overdue, ...data.dueToday];
  if (urgent.length === 0 && data.upcoming.length === 0) return null;

  const row = (t: Transaction, tag?: { label: string; cls: string }) => (
    <li key={t.id}>
      <button className="due" onClick={() => onConfirm(t)}>
        <span className="tx-main">
          <span className="tx-desc">{t.description}</span>
          <span className="muted small">
            {tag && <span className={`tag ${tag.cls}`}>{tag.label}</span>}
            {shortDate(t.date)} · {(t.creditCard ?? t.account)?.name}
            {t.recurrence?.amountIsEstimate ? " · valor estimado" : ""}
          </span>
        </span>
        <span className={`tx-amount ${t.type === "INCOME" ? "pos" : "neg"}`}>{money(t.amountCents)}</span>
        <span className="btn small-btn">Confirmar</span>
      </button>
    </li>
  );

  return (
    <section className="card pending-panel">
      <div className="section-head">
        <h2>Para confirmar</h2>
        {urgent.length > 0 && <span className="count">{urgent.length}</span>}
      </div>
      {urgent.length > 0 ? (
        <ul className="tx-list">
          {data.overdue.map((t) => row(t, { label: "atrasado", cls: "late" }))}
          {data.dueToday.map((t) => row(t, { label: "hoje", cls: "today" }))}
        </ul>
      ) : (
        <p className="muted small">Nada para hoje.</p>
      )}
      {data.upcoming.length > 0 && (
        <>
          <button className="link small" onClick={() => setShowUpcoming((v) => !v)}>
            {showUpcoming ? "Ocultar" : "Ver"} próximos 7 dias ({data.upcoming.length})
          </button>
          {showUpcoming && <ul className="tx-list">{data.upcoming.map((t) => row(t))}</ul>}
        </>
      )}
    </section>
  );
}
