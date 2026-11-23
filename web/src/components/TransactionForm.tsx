import { useState, type FormEvent } from "react";
import type { Account, Category, CreditCard, Transaction, TransactionInput, TxType } from "../api";
import { centsToInput, parseMoney, today } from "../format";

interface Props {
  categories: Category[];
  accounts: Account[];
  cards: CreditCard[];
  initial?: Transaction;
  onSubmit: (data: TransactionInput) => Promise<void>;
  onDelete?: () => Promise<void>;
}

/** Categorias do tipo, com as subcategorias logo abaixo da principal. */
function categoryOptions(categories: Category[], type: TxType) {
  const ofType = categories.filter((c) => c.type === type);
  const parents = ofType.filter((c) => !c.parentId);
  return parents.flatMap((p) => [
    { id: p.id, label: p.name },
    ...ofType.filter((c) => c.parentId === p.id).map((c) => ({ id: c.id, label: `\u00a0\u00a0\u00a0${c.name}` })),
  ]);
}

export function TransactionForm({ categories, accounts, cards, initial, onSubmit, onDelete }: Props) {
  const [type, setType] = useState<TxType>(initial?.type ?? "EXPENSE");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(initial ? centsToInput(initial.amountCents) : "");
  const [date, setDate] = useState(initial?.date.slice(0, 10) ?? today());
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  // "a:<id>" = conta, "c:<id>" = cartão
  const [source, setSource] = useState(
    initial?.creditCardId ? `c:${initial.creditCardId}` : initial?.accountId ? `a:${initial.accountId}` : accounts[0] ? `a:${accounts[0].id}` : "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const options = categoryOptions(categories, type);

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
        accountId: source.startsWith("a:") ? source.slice(2) : null,
        creditCardId: source.startsWith("c:") ? source.slice(2) : null,
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
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        {type === "EXPENSE" ? "Pago com" : "Recebido em"}
        <select value={source} onChange={(e) => setSource(e.target.value)} required>
          {accounts.length > 0 && (
            <optgroup label="Contas">
              {accounts.map((a) => (
                <option key={a.id} value={`a:${a.id}`}>{a.name}</option>
              ))}
            </optgroup>
          )}
          {cards.length > 0 && (
            <optgroup label={type === "EXPENSE" ? "Cartões de crédito" : "Estorno no cartão"}>
              {cards.map((c) => (
                <option key={c.id} value={`c:${c.id}`}>{c.name}</option>
              ))}
            </optgroup>
          )}
        </select>
        {source.startsWith("c:") && <span className="hint">Entra na fatura correspondente à data da compra.</span>}
      </label>
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
