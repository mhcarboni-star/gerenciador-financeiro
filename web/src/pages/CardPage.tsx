import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Account, type CreditCard, type InvoiceDetail, type InvoiceStatus, type InvoiceSummary } from "../api";
import { centsToInput, dayMonth, monthLabel, money, parseMoney, today } from "../format";
import { TransactionList } from "../components/TransactionList";
import { Modal } from "../components/Modal";
import { CardModal } from "./AccountsPage";
import { useTransactionEditor } from "../useTransactionEditor";

const STATUS: Record<InvoiceStatus, { label: string; cls: string }> = {
  OPEN: { label: "Aberta", cls: "today" },
  CLOSED: { label: "Fechada", cls: "late" },
  PAID: { label: "Paga", cls: "paid" },
};

/** Fatura atual = a que recebe compras de hoje (primeira não fechada), ou a mais recente. */
function pickCurrent(invoices: InvoiceSummary[]) {
  const t = today();
  const open = [...invoices].reverse().find((i) => i.closingDate > t);
  return open?.id ?? invoices[0]?.id ?? null;
}

export function CardPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [card, setCard] = useState<CreditCard | null>(null);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [paying, setPaying] = useState(false);
  const [editingCard, setEditingCard] = useState(false);
  const [error, setError] = useState("");

  const loadList = useCallback(
    (keep?: string | null) =>
      api
        .cardInvoices(id)
        .then((r) => {
          setCard(r.card);
          setInvoices(r.invoices);
          setSelected((cur) => keep ?? cur ?? pickCurrent(r.invoices));
        })
        .catch((e) => setError(e.message)),
    [id],
  );
  const loadDetail = useCallback(() => {
    if (selected) api.invoice(selected).then(setDetail).catch((e) => setError(e.message));
  }, [selected]);

  useEffect(() => {
    loadList();
    api.accounts().then(setAccounts);
  }, [loadList]);
  useEffect(loadDetail, [loadDetail]);

  const refresh = () => {
    loadList(selected);
    loadDetail();
  };
  const editor = useTransactionEditor(refresh);

  const idx = invoices.findIndex((i) => i.id === selected);
  const remaining = detail ? Math.max(detail.projectedTotalCents - detail.paidCents, 0) : 0;
  const purchases = detail?.transactions.filter((t) => t.type !== "INVOICE_PAYMENT") ?? [];
  const payments = detail?.transactions.filter((t) => t.type === "INVOICE_PAYMENT") ?? [];

  return (
    <>
      <header className="page-head">
        <div>
          <Link to="/contas" className="small">‹ Contas e cartões</Link>
          <h1>{card?.name ?? "Cartão"}</h1>
        </div>
        <button className="btn ghost" onClick={() => setEditingCard(true)}>Editar cartão</button>
      </header>
      {error && <p className="error">{error}</p>}

      {invoices.length === 0 ? (
        <section className="card">
          <p className="muted empty">Nenhuma compra neste cartão ainda.</p>
        </section>
      ) : (
        <>
          <div className="month-picker invoice-picker">
            <button className="icon-btn" aria-label="Fatura anterior" disabled={idx >= invoices.length - 1} onClick={() => setSelected(invoices[idx + 1].id)}>‹</button>
            <span>{detail ? `Fatura de ${monthLabel(detail.referenceMonth.slice(0, 7))}` : "…"}</span>
            <button className="icon-btn" aria-label="Próxima fatura" disabled={idx <= 0} onClick={() => setSelected(invoices[idx - 1].id)}>›</button>
          </div>

          {detail && (
            <section className="card invoice-head">
              <div>
                <span className={`tag ${STATUS[detail.status].cls}`}>{STATUS[detail.status].label}</span>
                <strong className="invoice-total">{money(detail.projectedTotalCents)}</strong>
                <span className="muted small">
                  Fecha {dayMonth(detail.closingDate)} · vence {dayMonth(detail.dueDate)}
                  {detail.projectedTotalCents !== detail.totalCents && ` · inclui ${money(detail.projectedTotalCents - detail.totalCents)} previstos`}
                </span>
                {detail.paidCents > 0 && <span className="muted small">Pago: {money(detail.paidCents)}{remaining > 0 ? ` · falta ${money(remaining)}` : ""}</span>}
              </div>
              {detail.status !== "PAID" && remaining > 0 && (
                <button className="btn primary" onClick={() => setPaying(true)}>Pagar fatura</button>
              )}
            </section>
          )}

          <section className="card spaced">
            <h2>Compras</h2>
            <TransactionList items={purchases} onSelect={editor.openEdit} />
          </section>
          {payments.length > 0 && (
            <section className="card spaced">
              <h2>Pagamentos</h2>
              <TransactionList items={payments} onSelect={editor.openEdit} />
            </section>
          )}
        </>
      )}

      <button className="fab" aria-label="Novo lançamento" onClick={editor.openNew}>+</button>
      {editor.modal}
      {paying && detail && (
        <PayModal
          invoice={detail}
          remaining={remaining}
          accounts={accounts}
          defaultAccountId={card?.paymentAccountId ?? accounts[0]?.id ?? ""}
          onClose={() => setPaying(false)}
          onSaved={() => {
            setPaying(false);
            refresh();
          }}
        />
      )}
      {editingCard && card && (
        <CardModal
          item={card}
          accounts={accounts}
          onClose={() => setEditingCard(false)}
          onSaved={() => {
            setEditingCard(false);
            api.cards(true).then((all) => (all.find((c) => c.id === id && !c.archivedAt) ? refresh() : navigate("/contas")));
          }}
        />
      )}
    </>
  );
}

function PayModal({ invoice, remaining, accounts, defaultAccountId, onClose, onSaved }: {
  invoice: InvoiceDetail; remaining: number; accounts: Account[]; defaultAccountId: string; onClose: () => void; onSaved: () => void;
}) {
  const [amount, setAmount] = useState(centsToInput(remaining));
  const [accountId, setAccountId] = useState(defaultAccountId);
  const [date, setDate] = useState(today() < invoice.dueDate ? today() : invoice.dueDate);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const cents = parseMoney(amount);
    if (!cents || cents <= 0) return setError("Informe um valor válido");
    setBusy(true);
    try {
      await api.payInvoice(invoice.id, { accountId, amountCents: cents, date });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Pagar fatura" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="confirm-head">
          <strong>{invoice.creditCard.name} · vence {dayMonth(invoice.dueDate)}</strong>
          <span className="muted small">Falta pagar {money(remaining)}</span>
        </div>
        <div className="row">
          <label>
            Valor (R$)
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label>
            Data
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
        </div>
        <label>
          Pagar com
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        <span className="hint">Pagamento parcial também é aceito; a fatura só fica “Paga” quando o total for coberto.</span>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy}>{busy ? "Salvando…" : "Pagar"}</button>
        </div>
      </form>
    </Modal>
  );
}
