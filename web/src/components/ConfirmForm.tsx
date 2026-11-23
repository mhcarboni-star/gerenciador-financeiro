import { useState, type FormEvent } from "react";
import { api, type Account, type CreditCard, type Transaction } from "../api";
import { centsToInput, money, parseMoney, shortDate, today } from "../format";

/**
 * Confirmar um lançamento previsto: corrige valor, data e conta/cartão.
 * "Usar como nova previsão" vem desmarcado (só vale para recorrências).
 */
export function ConfirmForm({ tx, accounts, cards, onSaved }: {
  tx: Transaction; accounts: Account[]; cards: CreditCard[]; onSaved: () => void;
}) {
  const expected = tx.expectedAmountCents ?? tx.amountCents;
  const estimate = !!tx.recurrence?.amountIsEstimate;
  const [amount, setAmount] = useState(estimate ? "" : centsToInput(tx.amountCents));
  const [date, setDate] = useState(today());
  const [source, setSource] = useState(tx.creditCardId ? `c:${tx.creditCardId}` : `a:${tx.accountId}`);
  const [updateForecast, setUpdateForecast] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cents = parseMoney(amount);
  const isIncome = tx.type === "INCOME";

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!cents || cents <= 0) return setError("Informe o valor " + (isIncome ? "recebido" : "pago"));
    run(() =>
      api.confirm(tx.id, {
        amountCents: cents,
        date,
        accountId: source.startsWith("a:") ? source.slice(2) : null,
        creditCardId: source.startsWith("c:") ? source.slice(2) : null,
        updateForecast,
      }),
    );
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="confirm-head">
        <strong>{tx.description}</strong>
        <span className="muted small">
          Previsto: {money(expected)} em {shortDate(tx.date)}
          {tx.category ? ` · ${tx.category.name}` : ""}
        </span>
      </div>
      <div className="row">
        <label>
          Valor {isIncome ? "recebido" : "pago"} (R$)
          <input inputMode="decimal" value={amount} placeholder={centsToInput(expected)} onChange={(e) => setAmount(e.target.value)} autoFocus required />
        </label>
        <label>
          Data do {isIncome ? "recebimento" : "pagamento"}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
      </div>
      {cents > 0 && cents !== expected && (
        <span className={`hint ${cents > expected ? "neg" : "pos"}`}>
          {cents > expected ? "+" : "−"} {money(Math.abs(cents - expected))} em relação ao previsto
        </span>
      )}
      <label>
        {isIncome ? "Recebido em" : "Pago com"}
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <optgroup label="Contas">
            {accounts.map((a) => (
              <option key={a.id} value={`a:${a.id}`}>{a.name}</option>
            ))}
          </optgroup>
          {cards.length > 0 && (
            <optgroup label="Cartões de crédito">
              {cards.map((c) => (
                <option key={c.id} value={`c:${c.id}`}>{c.name}</option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {tx.recurrenceId && (
        <label className="check">
          <input type="checkbox" checked={updateForecast} onChange={(e) => setUpdateForecast(e.target.checked)} />
          <span>
            Usar este valor como nova previsão
            <span className="hint block">Atualiza o valor previsto das próximas ocorrências.</span>
          </span>
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        {tx.recurrenceId && (
          <button
            type="button"
            className="btn danger-ghost"
            disabled={busy}
            onClick={() => confirm("Pular esta ocorrência? As próximas continuam.") && run(() => api.deleteTransaction(tx.id))}
          >
            Pular
          </button>
        )}
        <button className="btn primary" disabled={busy}>
          {busy ? "Salvando…" : "Confirmar"}
        </button>
      </div>
    </form>
  );
}
