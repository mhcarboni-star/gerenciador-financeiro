import { useEffect, useState, type FormEvent } from "react";
import { api, type Account } from "../api";
import { centsToInput, money, parseMoney, shortDate, today } from "../format";
import { Modal } from "./Modal";

/** Ajustar saldo: informa o saldo real numa data; o app lança a diferença como ajuste. */
export function AdjustBalanceModal({ account, onClose, onSaved }: { account: Account; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(today());
  const [appBalance, setAppBalance] = useState<number | null>(null);
  const [real, setReal] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const minDate = account.lastAdjustment?.date;

  useEffect(() => {
    setAppBalance(null);
    if (!date) return;
    api.accountBalanceOn(account.id, date).then((r) => setAppBalance(r.balanceCents)).catch((e) => setError(e.message));
  }, [account.id, date]);

  const cents = real.trim() ? parseMoney(real, true) : NaN;
  const delta = appBalance !== null && !Number.isNaN(cents) ? cents - appBalance : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (Number.isNaN(cents)) return setError("Informe o saldo real, ex.: 1.250,00 ou -300,00");
    setBusy(true);
    setError("");
    try {
      await api.adjustBalance(account.id, { balanceCents: cents, date });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={`Ajustar saldo · ${account.name}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="info">
          Informe o saldo que aparece no banco. O app lança a diferença como <strong>ajuste</strong>. Depois disso, lançamentos com data anterior ao ajuste ficam só registrados e não mudam o saldo.
        </p>
        <div className="row">
          <label>
            Data do saldo
            <input type="date" value={date} min={minDate} max={today()} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            Saldo real (R$)
            <input inputMode="decimal" value={real} onChange={(e) => setReal(e.target.value)} placeholder={appBalance !== null ? centsToInput(appBalance) : ""} autoFocus required />
          </label>
        </div>
        {minDate && <span className="hint">Último ajuste em {shortDate(minDate)}; o novo precisa ser nessa data ou depois.</span>}
        <div className="adjust-preview">
          <div>
            <span className="muted small">Saldo no app em {shortDate(date)}</span>
            <strong>{appBalance === null ? "…" : money(appBalance)}</strong>
          </div>
          <div>
            <span className="muted small">Ajuste a lançar</span>
            <strong className={delta === null ? "" : delta > 0 ? "pos" : delta < 0 ? "neg" : ""}>
              {delta === null ? "—" : delta === 0 ? "Nenhum (já bate)" : `${delta > 0 ? "Entrada" : "Saída"} de ${money(Math.abs(delta))}`}
            </strong>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy || appBalance === null}>{busy ? "Salvando…" : "Ajustar saldo"}</button>
        </div>
      </form>
    </Modal>
  );
}
