import { useState, type FormEvent } from "react";
import type { Account, LoanPaymentInput } from "../api";
import { centsToInput, money, parseMoney, shortDate, today } from "../format";

/** Confirmar parcela prevista ou registrar pagamento avulso de empréstimo. */
export function LoanPayForm({ title, subtitle, expectedCents, dueDate, defaultAccountId, accounts, submitLabel, hint, onSubmit, onSaved }: {
  title: string;
  subtitle?: string;
  expectedCents?: number;
  dueDate?: string;
  defaultAccountId: string;
  accounts: Account[];
  submitLabel: string;
  hint?: string;
  onSubmit: (d: LoanPaymentInput) => Promise<unknown>;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(expectedCents ? centsToInput(expectedCents) : "");
  const [date, setDate] = useState(today());
  const [accountId, setAccountId] = useState(defaultAccountId || accounts[0]?.id || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cents = parseMoney(amount);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!cents || cents <= 0) return setError("Informe o valor pago");
    setBusy(true);
    setError("");
    try {
      await onSubmit({ amountCents: cents, date, accountId });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="confirm-head">
        <strong>{title}</strong>
        {subtitle && <span className="muted small">{subtitle}</span>}
        {expectedCents !== undefined && dueDate && (
          <span className="muted small">Previsto: {money(expectedCents)} em {shortDate(dueDate)}</span>
        )}
      </div>
      <div className="row">
        <label>
          Valor pago (R$)
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus required placeholder="0,00" />
        </label>
        <label>
          Data do pagamento
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
      </div>
      {expectedCents !== undefined && cents > 0 && cents !== expectedCents && (
        <span className={`hint ${cents > expectedCents ? "pos" : "neg"}`}>
          {cents > expectedCents
            ? `${money(cents - expectedCents)} a mais abate da dívida; as próximas parcelas diminuem.`
            : `${money(expectedCents - cents)} a menos; as próximas parcelas aumentam.`}
        </span>
      )}
      <label>
        Pago com
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </label>
      {hint && <span className="hint">{hint}</span>}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="btn primary" disabled={busy}>{busy ? "Salvando…" : submitLabel}</button>
      </div>
    </form>
  );
}
