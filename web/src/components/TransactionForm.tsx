import { useState, type FormEvent } from "react";
import { api, type Account, type Category, type CreditCard, type Frequency, type Transaction, type TxType } from "../api";
import { centsToInput, money, parseMoney, today } from "../format";
import { useHousehold } from "../household";
import { ResponsibleSelect } from "./ResponsibleSelect";
import { ScopeChoice } from "./ScopeChoice";

interface Props {
  categories: Category[];
  accounts: Account[];
  cards: CreditCard[];
  initial?: Transaction;
  onSaved: () => void;
}

type Kind = TxType | "TRANSFER";
type Repeat = "ONCE" | "INSTALLMENTS" | "RECURRING";

/** Categorias do tipo, com as subcategorias logo abaixo da principal. */
function categoryOptions(categories: Category[], type: TxType) {
  const ofType = categories.filter((c) => c.type === type);
  return ofType
    .filter((c) => !c.parentId)
    .flatMap((p) => [
      { id: p.id, label: p.name },
      ...ofType.filter((c) => c.parentId === p.id).map((c) => ({ id: c.id, label: `   ${c.name}` })),
    ]);
}

const FREQUENCIES: [Frequency, string][] = [
  ["MONTHLY", "Todo mês"],
  ["WEEKLY", "Toda semana"],
  ["YEARLY", "Todo ano"],
];

export function TransactionForm({ categories, accounts, cards, initial, onSaved }: Props) {
  const editing = !!initial;
  const { myId } = useHousehold();
  const [responsibleId, setResponsibleId] = useState<string | null>(initial ? initial.responsibleId : myId);
  const [kind, setKind] = useState<Kind>((initial?.type as Kind) ?? "EXPENSE");
  const [repeat, setRepeat] = useState<Repeat>("ONCE");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState(initial ? centsToInput(initial.amountCents) : "");
  const [date, setDate] = useState(initial?.date.slice(0, 10) ?? today());
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  // "a:<id>" = conta, "c:<id>" = cartão
  const [source, setSource] = useState(
    initial?.creditCardId ? `c:${initial.creditCardId}` : initial?.accountId ? `a:${initial.accountId}` : accounts[0] ? `a:${accounts[0].id}` : "",
  );
  const [toAccount, setToAccount] = useState(initial?.destinationAccountId ?? accounts[1]?.id ?? "");
  const [count, setCount] = useState("2");
  const [frequency, setFrequency] = useState<Frequency>("MONTHLY");
  const [endDate, setEndDate] = useState("");
  const [estimate, setEstimate] = useState(false);
  const [auto, setAuto] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // lançamento recorrente: pergunta "só este / este e os próximos" antes de salvar ou excluir
  const [asking, setAsking] = useState<"save" | "delete" | null>(null);
  const recurring = !!initial?.recurrenceId;

  const type: TxType = kind === "INCOME" ? "INCOME" : "EXPENSE";
  const accountId = source.startsWith("a:") ? source.slice(2) : null;
  const creditCardId = source.startsWith("c:") ? source.slice(2) : null;
  const cents = parseMoney(amount);
  const n = Number(count);
  const adjusted = [accounts.find((a) => a.id === accountId), kind === "TRANSFER" ? accounts.find((a) => a.id === toAccount) : undefined]
    .filter((a) => a?.lastAdjustment && date < a.lastAdjustment.date)
    .map((a) => a!);

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

  function submit(e: FormEvent, scope?: "this" | "future") {
    e.preventDefault();
    if (!cents || cents <= 0) return setError("Informe um valor válido, ex.: 45,90");
    if (recurring && kind !== "TRANSFER" && !scope) return setAsking("save");
    const base = { description, categoryId: categoryId || null, notes: notes.trim() || null, responsibleId };

    if (kind === "TRANSFER") {
      if (!accountId) return setError("Escolha a conta de origem");
      const data = { description: description.trim() || undefined, amountCents: cents, date, accountId, destinationAccountId: toAccount, notes: notes.trim() || null };
      return run(() => (editing ? api.updateTransfer(initial!.id, data) : api.createTransfer(data)));
    }
    if (!editing && repeat === "INSTALLMENTS") {
      if (!Number.isInteger(n) || n < 2) return setError("Informe 2 ou mais parcelas");
      return run(() => api.createInstallments({ ...base, totalAmountCents: cents, installmentCount: n, firstDate: date, accountId, creditCardId }));
    }
    if (!editing && repeat === "RECURRING") {
      return run(() =>
        api.createRecurrence({
          type, description, categoryId: base.categoryId, responsibleId, amountCents: cents, frequency, interval: 1,
          startDate: date, endDate: endDate || null, accountId, creditCardId, amountIsEstimate: estimate, autoMarkPaid: auto,
        }),
      );
    }
    const data = { ...base, type, amountCents: cents, date, accountId, creditCardId, ...(scope ? { scope } : {}) };
    return run(() => (editing ? api.updateTransaction(initial!.id, data) : api.createTransaction(data)));
  }


  return (
    <form onSubmit={submit} className="form">
      <div className="segmented" role="radiogroup" aria-label="Tipo">
        {(
          [
            ["EXPENSE", "Despesa", "expense"],
            ["INCOME", "Receita", "income"],
            ["TRANSFER", "Transferência", ""],
          ] as const
        )
          .filter(([k]) => !editing || (kind === "TRANSFER" ? k === "TRANSFER" : k !== "TRANSFER"))
          .map(([k, label, cls]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              className={kind === k ? `active ${cls}` : ""}
              onClick={() => {
                setKind(k);
                setCategoryId("");
                if (k === "INCOME" && repeat === "INSTALLMENTS") setRepeat("ONCE");
                if (k === "TRANSFER" && source.startsWith("c:")) setSource(accounts[0] ? `a:${accounts[0].id}` : "");
              }}
            >
              {label}
            </button>
          ))}
      </div>

      {initial?.installmentPlanId && (
        <p className="info">Parcela {initial.installmentNumber} de um parcelamento. As outras parcelas não mudam.</p>
      )}
      {initial?.recurrenceId && (
        <p className="info">Lançamento recorrente. Ao salvar ou excluir, você escolhe se vale só para este ou também para os próximos.</p>
      )}

      {kind !== "TRANSFER" && !editing && (
        <label>
          Repetição
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
            <option value="ONCE">Não se repete</option>
            {kind === "EXPENSE" && <option value="INSTALLMENTS">Parcelado</option>}
            <option value="RECURRING">Recorrente (todo mês, semana…)</option>
          </select>
        </label>
      )}

      <div className="row">
        <label>
          {repeat === "INSTALLMENTS" && !editing ? "Valor total (R$)" : repeat === "RECURRING" && estimate ? "Valor previsto (R$)" : "Valor (R$)"}
          <input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus={!editing} required />
        </label>
        {repeat === "INSTALLMENTS" && !editing && (
          <label className="narrow">
            Parcelas
            <input type="number" inputMode="numeric" min={2} max={420} value={count} onChange={(e) => setCount(e.target.value)} required />
          </label>
        )}
      </div>
      {repeat === "INSTALLMENTS" && !editing && cents > 0 && n >= 2 && (
        <span className="hint">
          {n}x de {money(Math.floor(cents / n))}
          {creditCardId ? " · uma parcela em cada fatura" : " · parcelas futuras ficam como previstas"}
        </span>
      )}

      <label>
        Descrição{kind === "TRANSFER" ? " (opcional)" : ""}
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required={kind !== "TRANSFER"}
          maxLength={100}
          placeholder={kind === "TRANSFER" ? "Transferência" : ""}
        />
      </label>

      {kind === "TRANSFER" ? (
        <div className="row">
          <label>
            De
            <select value={accountId ?? ""} onChange={(e) => setSource(`a:${e.target.value}`)} required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
          <label>
            Para
            <select value={toAccount} onChange={(e) => setToAccount(e.target.value)} required>
              <option value="" disabled>Escolha</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <label>
          {kind === "EXPENSE" ? "Pago com" : "Recebido em"}
          <select value={source} onChange={(e) => setSource(e.target.value)} required>
            {accounts.length > 0 && (
              <optgroup label="Contas">
                {accounts.map((a) => (
                  <option key={a.id} value={`a:${a.id}`}>{a.name}</option>
                ))}
              </optgroup>
            )}
            {cards.length > 0 && (
              <optgroup label={kind === "EXPENSE" ? "Cartões de crédito" : "Estorno no cartão"}>
                {cards.map((c) => (
                  <option key={c.id} value={`c:${c.id}`}>{c.name}</option>
                ))}
              </optgroup>
            )}
          </select>
          {creditCardId && repeat === "ONCE" && <span className="hint">Entra na fatura correspondente à data da compra.</span>}
        </label>
      )}

      <div className="row">
        <label>
          {repeat === "RECURRING" && !editing ? "Primeira data" : repeat === "INSTALLMENTS" && !editing ? "Data da 1ª parcela" : "Data"}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        {kind !== "TRANSFER" && (
          <label>
            Categoria
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sem categoria</option>
              {categoryOptions(categories, type).map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
              {initial?.category && initial.category.id === categoryId && !categories.some((c) => c.id === categoryId) && (
                <option value={initial.category.id}>{initial.category.name} (excluída)</option>
              )}
            </select>
          </label>
        )}
      </div>

      {adjusted.length > 0 && repeat === "ONCE" && (
        <p className="info warn">
          Data anterior ao ajuste de saldo de {adjusted.map((a) => `${a.name} (${a.lastAdjustment!.date.split("-").reverse().slice(0, 2).join("/")})`).join(", ")}: o lançamento fica só registrado e não muda o saldo.
        </p>
      )}

      {kind !== "TRANSFER" && <ResponsibleSelect value={responsibleId} onChange={setResponsibleId} />}

      {repeat === "RECURRING" && !editing && (
        <fieldset className="group">
          <div className="row">
            <label>
              Frequência
              <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
                {FREQUENCIES.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
            <label>
              Termina em (opcional)
              <input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={estimate} onChange={(e) => { setEstimate(e.target.checked); if (e.target.checked) setAuto(false); }} />
            <span>
              Valor estimado
              <span className="hint block">O valor muda todo mês (ex.: energia). No dia, o app pede o valor real.</span>
            </span>
          </label>
          <label className="check">
            <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); if (e.target.checked) setEstimate(false); }} />
            <span>
              Confirmar automaticamente
              <span className="hint block">Valor fixo cobrado sozinho (ex.: assinatura no cartão, débito automático).</span>
            </span>
          </label>
        </fieldset>
      )}

      <label>
        Observações
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
      </label>
      {error && <p className="error">{error}</p>}
      {asking ? (
        <ScopeChoice
          action={asking}
          busy={busy}
          onCancel={() => setAsking(null)}
          onChoose={(scope) => {
            if (asking === "delete") {
              void run(() => api.deleteTransaction(initial!.id, scope));
            } else {
              submit({ preventDefault() {} } as FormEvent, scope);
            }
          }}
        />
      ) : (
      <div className="actions">
        {initial?.installmentPlanId && (
          <button
            type="button"
            className="btn danger-ghost"
            disabled={busy}
            onClick={() => confirm("Excluir TODAS as parcelas deste parcelamento?") && run(() => api.deleteInstallments(initial.installmentPlanId!))}
          >
            Excluir parcelamento
          </button>
        )}
        {initial && (
          <button
            type="button"
            className="btn danger-ghost"
            disabled={busy}
            onClick={() => (recurring ? setAsking("delete") : confirm("Excluir este lançamento?") && run(() => api.deleteTransaction(initial.id)))}
          >
            Excluir
          </button>
        )}
        <button className="btn primary" disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </div>
      )}
    </form>
  );
}
