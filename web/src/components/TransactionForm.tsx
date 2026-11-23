import { useState, type FormEvent } from "react";
import type { Category, Transaction, TransactionInput, TxType } from "../api";
import { centsToInput, parseMoney, today } from "../format";

interface Props {
  categories: Category[];
  initial?: Transaction;
  onSubmit: (data: TransactionInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function TransactionForm({ categories, initial, onSubmit, onDelete }: Props) {
  const [type, setType] = useState<TxType>(initial?.type ?? "EXPENSE");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(initial ? centsToInput(initial.amountCents) : "");
  const [date, setDate] = useState(initial?.date.slice(0, 10) ?? today());
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const options = categories.filter((c) => c.type === type);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amountCents = parseMoney(amount);
    if (!amountCents || amountCents <= 0) return setError("Informe um valor válido, ex.: 45,90");
    setBusy(true);
    setError("");
    try {
      await onSubmit({
        type,
        description,
        amountCents,
        date,
        categoryId: categoryId || null,
        notes: notes.trim() || null,
      });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="form">
      <div className="segmented" role="radiogroup" aria-label="Tipo">
        {(["EXPENSE", "INCOME"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            className={type === t ? `active ${t === "INCOME" ? "income" : "expense"}` : ""}
            onClick={() => {
              setType(t);
              setCategoryId("");
            }}
          >
            {t === "INCOME" ? "Receita" : "Despesa"}
          </button>
        ))}
      </div>
      <label>
        Valor (R$)
        <input
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus={!initial}
          required
        />
      </label>
      <label>
        Descrição
        <input value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={120} />
      </label>
      <div className="row">
        <label>
          Data
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          Categoria
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Sem categoria</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Observações
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        {onDelete && (
          <button
            type="button"
            className="btn danger-ghost"
            disabled={busy}
            onClick={async () => {
              if (!confirm("Excluir este lançamento?")) return;
              setBusy(true);
              await onDelete().catch((err) => {
                setError((err as Error).message);
                setBusy(false);
              });
            }}
          >
            Excluir
          </button>
        )}
        <button className="btn primary" disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}
