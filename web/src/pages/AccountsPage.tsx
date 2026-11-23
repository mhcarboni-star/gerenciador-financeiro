import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Account, type AccountType, type CreditCard } from "../api";
import { centsToInput, dayMonth, money, parseMoney, shortDate } from "../format";
import { Modal } from "../components/Modal";
import { ColorPicker } from "../components/ColorPicker";
import { AdjustBalanceModal } from "../components/AdjustBalanceModal";

const ACCOUNT_TYPES: [AccountType, string][] = [
  ["CHECKING", "Conta corrente"],
  ["SAVINGS", "Poupança"],
  ["CASH", "Carteira / dinheiro"],
  ["INVESTMENT", "Investimento"],
  ["OTHER", "Outra"],
];
const typeLabel = (t: AccountType) => ACCOUNT_TYPES.find(([v]) => v === t)?.[1] ?? t;

type Editing = { kind: "account"; item?: Account } | { kind: "card"; item?: CreditCard } | { kind: "adjust"; item: Account } | null;

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const load = useCallback(() => {
    setError("");
    Promise.all([api.accounts(showArchived), api.cards(showArchived)])
      .then(([a, c]) => {
        setAccounts(a);
        setCards(c);
      })
      .catch((e) => setError(e.message));
  }, [showArchived]);
  useEffect(load, [load]);

  const activeAccounts = accounts.filter((a) => !a.archivedAt);
  const total = activeAccounts.filter((a) => a.includeInTotals).reduce((s, a) => s + a.balanceCents, 0);
  const projected = activeAccounts.filter((a) => a.includeInTotals).reduce((s, a) => s + a.projectedBalanceCents, 0);
  const invoices = cards.filter((c) => !c.archivedAt).reduce((s, c) => s + c.currentInvoice.projectedTotalCents, 0);

  const saved = () => {
    setEditing(null);
    load();
  };

  return (
    <>
      <header className="page-head">
        <h1>Contas e cartões</h1>
      </header>
      {error && <p className="error">{error}</p>}

      <section className="stats stats-3">
        <div className="card stat">
          <span className="muted small">Saldo em contas hoje</span>
          <strong className={total < 0 ? "neg" : ""}>{money(total)}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Previsto em 31/12</span>
          <strong className={projected < 0 ? "neg" : ""}>{money(projected)}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Faturas atuais</span>
          <strong className="neg">{money(invoices)}</strong>
        </div>
      </section>

      <div className="section-head">
        <h2>Contas</h2>
        <button className="btn ghost" onClick={() => setEditing({ kind: "account" })}>
          + Nova conta
        </button>
      </div>
      <div className="tiles">
        {accounts.map((a) => (
          <button key={a.id} className={`card tile ${a.archivedAt ? "archived" : ""}`} onClick={() => setEditing({ kind: "account", item: a })}>
            <span className="tile-bar" style={{ background: a.color }} />
            <span className="tile-title">{a.name}</span>
            <span className="muted small">
              {typeLabel(a.type)}
              {a.institution ? ` · ${a.institution}` : ""}
              {a.archivedAt ? " · arquivada" : ""}
              {!a.includeInTotals ? " · fora do total" : ""}
            </span>
            <strong className={`tile-value ${a.balanceCents < 0 ? "neg" : ""}`}>{money(a.balanceCents)}</strong>
            {a.projectedBalanceCents !== a.balanceCents && (
              <span className="muted small">Previsto em 31/12: {money(a.projectedBalanceCents)}</span>
            )}
            {a.lastAdjustment && <span className="muted small">Saldo ajustado em {shortDate(a.lastAdjustment.date)}</span>}
          </button>
        ))}
        {accounts.length === 0 && <p className="muted empty">Nenhuma conta cadastrada.</p>}
      </div>

      <div className="section-head spaced">
        <h2>Cartões de crédito</h2>
        <button className="btn ghost" onClick={() => setEditing({ kind: "card" })}>
          + Novo cartão
        </button>
      </div>
      <div className="tiles">
        {cards.map((c) => {
          const pct = c.limitCents > 0 ? Math.min(100, (c.usedCents / c.limitCents) * 100) : 0;
          return (
            <button key={c.id} className={`card tile ${c.archivedAt ? "archived" : ""}`} onClick={() => navigate(`/cartoes/${c.id}`)}>
              <span className="tile-bar" style={{ background: c.color }} />
              <span className="tile-title">{c.name}</span>
              <span className="muted small">
                Fecha dia {c.closingDay} · vence dia {c.dueDay}
                {c.archivedAt ? " · arquivado" : ""}
              </span>
              <span className="muted small tile-label">Fatura atual · vence {dayMonth(c.currentInvoice.dueDate)}</span>
              <strong className="tile-value">{money(c.currentInvoice.projectedTotalCents)}</strong>
              {c.limitCents > 0 && (
                <>
                  <span className="bar-track" aria-hidden="true">
                    <span className="bar" style={{ width: `${pct}%`, background: pct > 90 ? "var(--neg)" : c.color }} />
                  </span>
                  <span className="muted small">
                    Disponível {money(c.availableCents)} de {money(c.limitCents)}
                  </span>
                </>
              )}
            </button>
          );
        })}
        {cards.length === 0 && <p className="muted empty">Nenhum cartão cadastrado.</p>}
      </div>

      <p className="center-text">
        <button className="link small" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? "Ocultar arquivados" : "Mostrar arquivados"}
        </button>
      </p>

      {editing?.kind === "account" && (
        <AccountModal
          item={editing.item}
          onClose={() => setEditing(null)}
          onSaved={saved}
          onAdjust={editing.item && !editing.item.archivedAt ? () => setEditing({ kind: "adjust", item: editing.item! }) : undefined}
        />
      )}
      {editing?.kind === "adjust" && <AdjustBalanceModal account={editing.item} onClose={() => setEditing(null)} onSaved={saved} />}
      {editing?.kind === "card" && (
        <CardModal item={editing.item} accounts={activeAccounts} onClose={() => setEditing(null)} onSaved={saved} />
      )}
    </>
  );
}

function useSubmit(onSaved: () => void) {
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
  return { error, setError, busy, run };
}

function ArchiveActions({ archived, busy, onArchive, onRestore, what }: {
  archived: boolean; busy: boolean; onArchive: () => void; onRestore: () => void; what: string;
}) {
  return archived ? (
    <button type="button" className="btn ghost" disabled={busy} onClick={onRestore}>
      Reativar
    </button>
  ) : (
    <button
      type="button"
      className="btn danger-ghost"
      disabled={busy}
      onClick={() => confirm(`Excluir ${what}? Se houver lançamentos, ele(a) será arquivado(a) e o histórico mantido.`) && onArchive()}
    >
      Excluir
    </button>
  );
}

function AccountModal({ item, onClose, onSaved, onAdjust }: { item?: Account; onClose: () => void; onSaved: () => void; onAdjust?: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [type, setType] = useState<AccountType>(item?.type ?? "CHECKING");
  const [institution, setInstitution] = useState(item?.institution ?? "");
  const [initial, setInitial] = useState(item ? centsToInput(item.initialBalanceCents) : "0,00");
  const [color, setColor] = useState(item?.color ?? "#2563eb");
  const [includeInTotals, setInclude] = useState(item?.includeInTotals ?? true);
  const { error, setError, busy, run } = useSubmit(onSaved);

  function submit(e: FormEvent) {
    e.preventDefault();
    const initialBalanceCents = parseMoney(initial || "0", true);
    if (Number.isNaN(initialBalanceCents)) return setError("Saldo inicial inválido, ex.: 1.250,00 ou -300,00");
    const data = { name, type, institution: institution.trim() || null, initialBalanceCents, color, includeInTotals };
    run(() => (item ? api.updateAccount(item.id, data) : api.createAccount(data)));
  }

  return (
    <Modal title={item ? "Editar conta" : "Nova conta"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Nome
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoFocus={!item} placeholder="Ex.: Conta Itaú" />
        </label>
        <div className="row">
          <label>
            Tipo
            <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {ACCOUNT_TYPES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label>
            Banco / instituição
            <input value={institution} onChange={(e) => setInstitution(e.target.value)} maxLength={60} />
          </label>
        </div>
        {item && onAdjust && (
          <div className="adjust-cta">
            <div>
              <span className="muted small">Saldo atual no app</span>
              <strong>{money(item.balanceCents)}</strong>
            </div>
            <button type="button" className="btn ghost" onClick={onAdjust}>Ajustar saldo</button>
          </div>
        )}
        <label>
          Saldo inicial (R$)
          <input inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} />
          <span className="hint">
            {item?.lastAdjustment
              ? `Desde o ajuste de ${shortDate(item.lastAdjustment.date)}, o saldo parte do valor ajustado; o saldo inicial não afeta mais o saldo atual.`
              : "Saldo da conta antes do primeiro lançamento no app. Use \"-\" se estiver negativo. Para corrigir o saldo depois, use “Ajustar saldo”."}
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={includeInTotals} onChange={(e) => setInclude(e.target.checked)} />
          Somar no saldo total
        </label>
        <ColorPicker value={color} onChange={setColor} />
        {error && <p className="error">{error}</p>}
        <div className="actions">
          {item && (
            <ArchiveActions
              what="esta conta"
              archived={!!item.archivedAt}
              busy={busy}
              onArchive={() => run(() => api.deleteAccount(item.id))}
              onRestore={() => run(() => api.restoreAccount(item.id))}
            />
          )}
          <button className="btn primary" disabled={busy}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

export function CardModal({ item, accounts, onClose, onSaved }: {
  item?: CreditCard; accounts: Account[]; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [brand, setBrand] = useState(item?.brand ?? "");
  const [limit, setLimit] = useState(item ? centsToInput(item.limitCents) : "");
  const [closingDay, setClosingDay] = useState(String(item?.closingDay ?? ""));
  const [dueDay, setDueDay] = useState(String(item?.dueDay ?? ""));
  const [paymentAccountId, setPaymentAccountId] = useState(item?.paymentAccountId ?? accounts[0]?.id ?? "");
  const [color, setColor] = useState(item?.color ?? "#7c3aed");
  const { error, setError, busy, run } = useSubmit(onSaved);

  function submit(e: FormEvent) {
    e.preventDefault();
    const limitCents = parseMoney(limit || "0");
    if (Number.isNaN(limitCents)) return setError("Limite inválido, ex.: 5.000,00");
    const data = {
      name,
      brand: brand.trim() || null,
      limitCents,
      closingDay: Number(closingDay),
      dueDay: Number(dueDay),
      paymentAccountId: paymentAccountId || null,
      color,
    };
    run(() => (item ? api.updateCard(item.id, data) : api.createCard(data)));
  }

  return (
    <Modal title={item ? "Editar cartão" : "Novo cartão"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="row">
          <label>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoFocus={!item} placeholder="Ex.: Nubank" />
          </label>
          <label>
            Bandeira
            <input value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={30} placeholder="Visa, Master…" />
          </label>
        </div>
        <label>
          Limite (R$)
          <input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="0,00" />
        </label>
        <div className="row">
          <label>
            Dia do fechamento
            <input type="number" inputMode="numeric" min={1} max={31} value={closingDay} onChange={(e) => setClosingDay(e.target.value)} required />
          </label>
          <label>
            Dia do vencimento
            <input type="number" inputMode="numeric" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)} required />
          </label>
        </div>
        <span className="hint">Compras feitas a partir do dia do fechamento vão para a fatura seguinte.</span>
        <label>
          Pagar a fatura com
          <select value={paymentAccountId} onChange={(e) => setPaymentAccountId(e.target.value)}>
            <option value="">—</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        <ColorPicker value={color} onChange={setColor} />
        {error && <p className="error">{error}</p>}
        <div className="actions">
          {item && (
            <ArchiveActions
              what="este cartão"
              archived={!!item.archivedAt}
              busy={busy}
              onArchive={() => run(() => api.deleteCard(item.id))}
              onRestore={() => run(() => api.restoreCard(item.id))}
            />
          )}
          <button className="btn primary" disabled={busy}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
