import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, type Account, type Category, type CreditCard, type Frequency, type Recurrence } from "../api";
import { centsToInput, money, parseMoney, shortDate } from "../format";
import { Modal } from "../components/Modal";

const FREQ_LABEL: Record<Frequency, string> = { MONTHLY: "Todo mês", WEEKLY: "Toda semana", YEARLY: "Todo ano" };

export function RecurrencesPage() {
  const [items, setItems] = useState<Recurrence[]>([]);
  const [editing, setEditing] = useState<Recurrence | null>(null);
  const [refs, setRefs] = useState<{ accounts: Account[]; cards: CreditCard[]; categories: Category[] }>({ accounts: [], cards: [], categories: [] });
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.recurrences().then(setItems).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
    Promise.all([api.accounts(), api.cards(), api.categories()]).then(([accounts, cards, categories]) => setRefs({ accounts, cards, categories }));
  }, [load]);

  const active = items.filter((r) => r.active);
  const ended = items.filter((r) => !r.active);
  const monthly = active
    .filter((r) => r.type === "EXPENSE")
    .reduce((s, r) => s + (r.frequency === "MONTHLY" ? r.amountCents / r.interval : r.frequency === "WEEKLY" ? (r.amountCents * 52) / 12 : r.amountCents / 12), 0);

  const card = (r: Recurrence) => (
    <li key={r.id}>
      <button className="tx" onClick={() => setEditing(r)}>
        <span className="dot" style={{ background: r.category?.color ?? "#94a3b8" }} />
        <span className="tx-main">
          <span className="tx-desc">
            {r.description}
            {r.amountIsEstimate && <span className="badge">estimado</span>}
            {r.autoMarkPaid && <span className="badge">automático</span>}
          </span>
          <span className="muted small">
            {FREQ_LABEL[r.frequency]} · {(r.creditCard ?? r.account)?.name}
            {r.active && r.nextPending ? ` · próximo ${shortDate(r.nextPending.date)}` : ""}
            {!r.active && r.endDate ? ` · encerrado em ${shortDate(r.endDate)}` : ""}
          </span>
        </span>
        <span className={`tx-amount ${r.type === "INCOME" ? "pos" : "neg"}`}>{money(r.amountCents)}</span>
      </button>
    </li>
  );

  return (
    <>
      <header className="page-head">
        <div>
          <Link to="/lancamentos" className="small">‹ Lançamentos</Link>
          <h1>Recorrentes</h1>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <section className="card">
        <div className="section-head">
          <h2>Ativos</h2>
          <span className="muted small">≈ {money(Math.round(monthly))}/mês em despesas</span>
        </div>
        {active.length === 0 ? (
          <p className="muted empty">Nenhum lançamento recorrente. Crie pelo botão “+” escolhendo “Recorrente”.</p>
        ) : (
          <ul className="tx-list">{active.map(card)}</ul>
        )}
      </section>
      {ended.length > 0 && (
        <section className="card spaced">
          <h2>Encerrados</h2>
          <ul className="tx-list">{ended.map(card)}</ul>
        </section>
      )}
      {editing && (
        <RecurrenceModal
          item={editing}
          {...refs}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

function RecurrenceModal({ item, accounts, cards, categories, onClose, onSaved }: {
  item: Recurrence; accounts: Account[]; cards: CreditCard[]; categories: Category[]; onClose: () => void; onSaved: () => void;
}) {
  const [description, setDescription] = useState(item.description);
  const [amount, setAmount] = useState(centsToInput(item.amountCents));
  const [frequency, setFrequency] = useState<Frequency>(item.frequency);
  const [startDate, setStartDate] = useState(item.startDate.slice(0, 10));
  const [endDate, setEndDate] = useState(item.endDate?.slice(0, 10) ?? "");
  const [source, setSource] = useState(item.creditCardId ? `c:${item.creditCardId}` : `a:${item.accountId}`);
  const [categoryId, setCategoryId] = useState(item.categoryId ?? "");
  const [estimate, setEstimate] = useState(item.amountIsEstimate);
  const [auto, setAuto] = useState(item.autoMarkPaid);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
    const cents = parseMoney(amount);
    if (!cents || cents <= 0) return setError("Informe um valor válido");
    run(() =>
      api.updateRecurrence(item.id, {
        type: item.type, description, amountCents: cents, frequency, interval: item.interval, startDate, endDate: endDate || null,
        accountId: source.startsWith("a:") ? source.slice(2) : null, creditCardId: source.startsWith("c:") ? source.slice(2) : null,
        categoryId: categoryId || null, amountIsEstimate: estimate, autoMarkPaid: auto,
      }),
    );
  }

  const cats = categories.filter((c) => c.type === item.type);
  return (
    <Modal title="Editar recorrente" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="info">Salvar atualiza as próximas ocorrências ainda não confirmadas. As já confirmadas e as atrasadas não mudam.</p>
        <label>
          Descrição
          <input value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={100} />
        </label>
        <div className="row">
          <label>
            {estimate ? "Valor previsto (R$)" : "Valor (R$)"}
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label>
            Frequência
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              {Object.entries(FREQ_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          <label>
            Início
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </label>
          <label>
            Termina em
            <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
        </div>
        <div className="row">
          <label>
            {item.type === "INCOME" ? "Recebido em" : "Pago com"}
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <optgroup label="Contas">
                {accounts.map((a) => (
                  <option key={a.id} value={`a:${a.id}`}>{a.name}</option>
                ))}
              </optgroup>
              {cards.length > 0 && (
                <optgroup label="Cartões">
                  {cards.map((c) => (
                    <option key={c.id} value={`c:${c.id}`}>{c.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <label>
            Categoria
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sem categoria</option>
              {cats.filter((c) => !c.parentId).flatMap((p) => [p, ...cats.filter((c) => c.parentId === p.id)]).map((c) => (
                <option key={c.id} value={c.id}>{c.parentId ? `   ${c.name}` : c.name}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={estimate} onChange={(e) => { setEstimate(e.target.checked); if (e.target.checked) setAuto(false); }} />
          Valor estimado (pedir o valor real ao confirmar)
        </label>
        <label className="check">
          <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); if (e.target.checked) setEstimate(false); }} />
          Confirmar automaticamente
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          {item.active && (
            <button
              type="button"
              className="btn danger-ghost"
              disabled={busy}
              onClick={() => confirm("Encerrar? As próximas ocorrências não confirmadas serão removidas.") && run(() => api.endRecurrence(item.id))}
            >
              Encerrar
            </button>
          )}
          <button className="btn primary" disabled={busy}>{item.active ? "Salvar" : "Reativar e salvar"}</button>
        </div>
      </form>
    </Modal>
  );
}
