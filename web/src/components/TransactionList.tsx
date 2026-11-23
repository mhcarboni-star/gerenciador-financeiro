import type { Transaction } from "../api";
import { money, shortDate } from "../format";
import { useHousehold } from "../household";

function subtitle(t: Transaction) {
  const parts = [shortDate(t.date)];
  if (t.type === "TRANSFER") parts.push(`${t.account?.name} → ${t.destinationAccount?.name}`);
  else if (t.type === "INVOICE_PAYMENT") parts.push(`Pagamento de fatura · ${t.account?.name}`);
  else if (t.type === "LOAN_PAYMENT") parts.push(`Empréstimo · ${t.account?.name}`);
  else if (t.type === "ADJUSTMENT_IN" || t.type === "ADJUSTMENT_OUT") parts.push(`Correção de saldo · ${t.account?.name}`);
  else {
    parts.push(t.category?.name ?? "Sem categoria");
    const src = t.creditCard ?? t.account;
    if (src) parts.push(src.name);
  }
  return parts.join(" · ");
}

function amountView(t: Transaction) {
  switch (t.type) {
    case "INCOME":
      return { cls: "pos", text: `+ ${money(t.amountCents)}` };
    case "TRANSFER":
    case "INVOICE_PAYMENT":
      return { cls: "neutral", text: money(t.amountCents) };
    case "ADJUSTMENT_IN":
      return { cls: "neutral", text: `+ ${money(t.amountCents)}` };
    case "ADJUSTMENT_OUT":
      return { cls: "neutral", text: `− ${money(t.amountCents)}` };
    default:
      return { cls: "neg", text: `− ${money(t.amountCents)}` };
  }
}

const dotColor = (t: Transaction) =>
  t.type === "TRANSFER" || t.type === "INVOICE_PAYMENT" || t.type === "ADJUSTMENT_IN" || t.type === "ADJUSTMENT_OUT" ? "#94a3b8" : t.type === "LOAN_PAYMENT" ? "#b45309" : (t.category?.color ?? "#94a3b8");

export function TransactionList({ items, onSelect }: { items: Transaction[]; onSelect: (t: Transaction) => void }) {
  const { isFamily, memberName } = useHousehold();
  if (items.length === 0) return <p className="muted empty">Nenhum lançamento neste mês.</p>;
  return (
    <ul className="tx-list">
      {items.map((t) => {
        const a = amountView(t);
        return (
          <li key={t.id}>
            <button className={`tx ${t.status === "PENDING" ? "pending" : ""}`} onClick={() => onSelect(t)}>
              <span className="dot" style={{ background: dotColor(t) }} />
              <span className="tx-main">
                <span className="tx-desc">
                  <span className="tx-text">{t.description}</span>
                  {t.status === "PENDING" && <span className="badge">previsto</span>}
                  {t.beforeAdjustment && <span className="badge" title="Data anterior ao ajuste de saldo: não muda o saldo">só registro</span>}
                </span>
                <span className="muted small">
                  {isFamily && !["TRANSFER", "INVOICE_PAYMENT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"].includes(t.type) && (
                    <span className={`who ${t.responsibleId ? "" : "family"}`}>{memberName(t.responsibleId)}</span>
                  )}
                  {subtitle(t)}
                </span>
              </span>
              <span className={`tx-amount ${a.cls}`}>{a.text}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
