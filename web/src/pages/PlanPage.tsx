import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type Account, type CommitmentKind, type MonthPlan, type PlanItem } from "../api";
import { centsToInput, currentMonth, monthLabel, money, parseMoney, shiftMonth, shortDate } from "../format";
import { MonthPicker } from "../components/MonthPicker";
import { Modal } from "../components/Modal";
import { ResponsibleSelect, ScopeTabs } from "../components/ResponsibleSelect";
import { useHousehold } from "../household";

const KIND_LABEL: Record<CommitmentKind, string> = {
  FIXED: "Contas fixas",
  INSTALLMENT: "Parcelas",
  LOAN: "Empréstimos",
  PLANNED: "Previstas",
};

export function PlanPage() {
  const [params, setParams] = useSearchParams();
  const month = params.get("mes") ?? shiftMonth(currentMonth(), 1);
  const setMonth = (m: string) => setParams({ mes: m }, { replace: true });
  const [plan, setPlan] = useState<MonthPlan | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<"income" | "commitments" | null>(null);
  const [adding, setAdding] = useState<"INCOME" | "EXPENSE" | null>(null);
  const [editingBudgets, setEditingBudgets] = useState(false);
  const { scope, isFamily } = useHousehold();
  const family = scope === "familia";

  const load = useCallback(() => {
    setError("");
    api.plan(month, scope).then(setPlan).catch((e) => setError(e.message));
  }, [month, scope]);
  useEffect(load, [load]);

  const isCurrent = month === currentMonth();
  const isFuture = month > currentMonth();

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Planejamento</h1>
          <span className="muted small">{isFuture ? "Próximos meses" : isCurrent ? "Mês atual" : "Mês passado"}</span>
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </header>
      {isFamily && (
        <div className="scope-bar">
          <ScopeTabs />
          <span className="muted small">{family ? "Tudo do grupo, com o detalhe por pessoa" : "Só o que está no meu nome"}</span>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {plan && (
        <>
          <Hero plan={plan} isCurrent={isCurrent} isFuture={isFuture} family={family} />
          {family && plan.byMember.length > 0 && <MembersPlan plan={plan} />}

          <section className="card calc">
            <h2>Como chegamos nesse valor</h2>
            <CalcRow label="Receitas previstas" value={plan.incomeCents} sign="+" open={open === "income"} onToggle={() => setOpen(open === "income" ? null : "income")}>
              <ItemList items={plan.incomes} empty="Nenhuma receita prevista. Cadastre o salário como recorrente ou adicione uma receita prevista." />
            </CalcRow>
            <CalcRow label="Compromissos" value={plan.commitmentsCents} sign="−" open={open === "commitments"} onToggle={() => setOpen(open === "commitments" ? null : "commitments")}>
              <div className="kind-chips">
                {(Object.keys(KIND_LABEL) as CommitmentKind[])
                  .filter((k) => plan.commitmentsByKind[k] !== 0)
                  .map((k) => (
                    <span key={k} className="chip">{KIND_LABEL[k]} <strong>{money(plan.commitmentsByKind[k])}</strong></span>
                  ))}
              </div>
              <ItemList items={plan.commitments} empty="Nenhum compromisso no mês." />
            </CalcRow>
            <SavingsRow plan={plan} onSaved={load} />
            <div className="calc-row total">
              <span>Disponível para gastar</span>
              <strong className={plan.availableCents < 0 ? "neg" : ""}>{money(plan.availableCents)}</strong>
            </div>
            {plan.cardCarryCents > 0 && (
              <p className="info">
                {money(plan.cardCarryCents)} em compras avulsas no cartão feitas antes de {monthLabel(month).split(" ")[0].toLowerCase()} vencem neste mês e já contam como gasto.
              </p>
            )}
            <div className="calc-actions">
              <button className="btn ghost" onClick={() => setAdding("INCOME")}>+ Receita prevista</button>
              <button className="btn ghost" onClick={() => setAdding("EXPENSE")}>+ Despesa prevista</button>
            </div>
          </section>

          <section className="card spaced">
            <div className="section-head">
              <h2>Por categoria</h2>
              <button className="btn ghost" onClick={() => setEditingBudgets(true)}>
                {plan.budgetedCents > 0 ? "Editar limites" : "Definir limites"}
              </button>
            </div>
            <p className="muted small">Gastos do dia a dia (compras avulsas). Contas fixas, parcelas e empréstimos já estão nos compromissos.</p>
            <BudgetList plan={plan} />
            <div className="calc-row">
              <span className="muted">Não distribuído</span>
              <strong className={plan.unbudgetedCents < 0 ? "neg" : ""}>{money(plan.unbudgetedCents)}</strong>
            </div>
            {plan.unbudgetedCents < 0 && <p className="error small">Os limites somam mais do que o disponível.</p>}
          </section>
        </>
      )}

      {adding && plan && <PlannedItemModal type={adding} month={month} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); load(); }} />}
      {editingBudgets && plan && (
        <BudgetsModal plan={plan} onClose={() => setEditingBudgets(false)} onSaved={() => { setEditingBudgets(false); load(); }} />
      )}
    </>
  );
}

function Hero({ plan, isCurrent, isFuture, family }: { plan: MonthPlan; isCurrent: boolean; isFuture: boolean; family: boolean }) {
  const spentPct = plan.availableCents > 0 ? Math.min(100, (plan.variableSpentCents / plan.availableCents) * 100) : 100;
  const over = plan.remainingCents < 0;
  return (
    <section className={`card plan-hero ${over ? "over" : ""}`}>
      <span className="muted small">
        {family
          ? isFuture ? `A família pode gastar em ${monthLabel(plan.month)}` : "A família tem disponível no mês"
          : isFuture ? `Você pode gastar em ${monthLabel(plan.month)}` : "Disponível para gastar no mês"}
      </span>
      <strong className="plan-amount">{money(plan.availableCents)}</strong>
      {plan.availableCents <= 0 ? (
        <span className="neg small">As receitas previstas não cobrem os compromissos e a meta de guardar.</span>
      ) : (
        <>
          <div className="bar-track big" aria-hidden="true">
            <div className="bar" style={{ width: `${spentPct}%`, background: over ? "var(--neg)" : spentPct > 85 ? "#ca8a04" : "var(--primary)" }} />
          </div>
          <div className="plan-meta">
            <span>
              Gasto <strong>{money(plan.variableSpentCents)}</strong>
            </span>
            <span className={over ? "neg" : ""}>
              {over ? "Passou " : "Resta "}
              <strong>{money(Math.abs(plan.remainingCents))}</strong>
            </span>
          </div>
          {plan.daysLeft > 0 && !over && (
            <span className="muted small">
              ≈ <strong>{money(plan.perDayCents)}</strong> por dia {isCurrent ? `nos ${plan.daysLeft} dias que faltam` : `(${plan.daysLeft} dias)`}
            </span>
          )}
        </>
      )}
    </section>
  );
}

function CalcRow({ label, value, sign, open, onToggle, children }: {
  label: string; value: number; sign: "+" | "−"; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  return (
    <div className="calc-block">
      <button className="calc-row clickable" onClick={onToggle} aria-expanded={open}>
        <span>
          <span className="chev">{open ? "▾" : "▸"}</span> {label}
        </span>
        <strong>
          {sign} {money(value)}
        </strong>
      </button>
      {open && <div className="calc-detail">{children}</div>}
    </div>
  );
}

function ItemList({ items, empty }: { items: PlanItem[]; empty: string }) {
  if (items.length === 0) return <p className="muted small">{empty}</p>;
  return (
    <ul className="plan-items">
      {items.map((i) => (
        <li key={i.id}>
          <span className="tx-main">
            <span className="tx-desc">
              {i.description}
              {i.status === "PENDING" && <span className="badge">previsto</span>}
            </span>
            <span className="muted small">
              {i.viaCard ? `fatura ${i.sourceName} · vence ${shortDate(i.cashDate)}` : `${shortDate(i.date)} · ${i.sourceName}`}
            </span>
          </span>
          <span className="tx-amount">{money(i.type === "INCOME" && i.viaCard ? -i.amountCents : i.amountCents)}</span>
        </li>
      ))}
    </ul>
  );
}

function SavingsRow({ plan, onSaved }: { plan: MonthPlan; onSaved: () => void }) {
  const family = plan.scope === "familia";
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(centsToInput(plan.editableSavingsCents));
  const [error, setError] = useState("");
  useEffect(() => setValue(centsToInput(plan.editableSavingsCents)), [plan.editableSavingsCents]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const cents = parseMoney(value || "0");
    if (Number.isNaN(cents) || cents < 0) return setError("Valor inválido");
    await api.setSavingsGoal(plan.month, cents, plan.scope);
    setEditing(false);
    setError("");
    onSaved();
  }

  const parts = family ? plan.byMember.filter((m) => m.savingsGoalCents > 0) : [];
  return (
    <>
      {editing ? (
        <form className="calc-row savings-edit" onSubmit={save}>
          <span>{family ? "Meta da família (conjunto)" : "Quero guardar"}</span>
          <span className="inline-edit">
            <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus aria-label="Quero guardar (R$)" />
            <button className="btn primary">OK</button>
          </span>
          {error && <span className="error small">{error}</span>}
        </form>
      ) : (
        <button className="calc-row clickable" onClick={() => setEditing(true)}>
          <span>
            <span className="chev">✎</span> {family ? "A família quer guardar" : "Quero guardar"}
          </span>
          <strong>− {money(plan.savingsGoalCents)}</strong>
        </button>
      )}
      {family && parts.length > 0 && (
        <div className="kind-chips savings-parts">
          {parts.map((m) => (
            <span key={m.userId ?? "familia"} className="chip">
              {m.userId ? m.name.split(" ")[0] : "Conjunto"} <strong>{money(m.savingsGoalCents)}</strong>
            </span>
          ))}
          <span className="muted small">Cada pessoa define a própria meta na aba “Eu”; aqui você edita a parte conjunta.</span>
        </div>
      )}
    </>
  );
}

/** Família: a conta de cada pessoa lado a lado. */
function MembersPlan({ plan }: { plan: MonthPlan }) {
  return (
    <section className="card members-plan">
      <h2>Por pessoa</h2>
      <div className="mp-table" role="table">
        <div className="mp-row head" role="row">
          <span role="columnheader">Quem</span>
          <span role="columnheader">Receitas</span>
          <span role="columnheader">Compromissos</span>
          <span role="columnheader">Guardar</span>
          <span role="columnheader">Disponível</span>
          <span role="columnheader">Resta</span>
        </div>
        {plan.byMember.map((m) => (
          <div key={m.userId ?? "familia"} className={`mp-row ${m.userId ? "" : "joint"}`} role="row">
            <span role="cell" className="mp-name">{m.userId ? m.name.split(" ")[0] : "Família (conjunto)"}</span>
            <span role="cell" data-label="Receitas">{money(m.incomeCents)}</span>
            <span role="cell" data-label="Compromissos">{money(m.commitmentsCents)}</span>
            <span role="cell" data-label="Guardar">{money(m.savingsGoalCents)}</span>
            <span role="cell" data-label="Disponível" className={m.availableCents < 0 && m.userId ? "neg" : ""}>{m.userId ? money(m.availableCents) : "—"}</span>
            <span role="cell" data-label="Resta" className={m.remainingCents < 0 && m.userId ? "neg" : ""}>{m.userId ? money(m.remainingCents) : `gasto ${money(m.variableSpentCents)}`}</span>
          </div>
        ))}
      </div>
      <p className="muted small">A parte conjunta (aluguel, contas da casa) não tem receita própria: ela é paga com o que sobra de cada pessoa.</p>
    </section>
  );
}

function BudgetList({ plan }: { plan: MonthPlan }) {
  const rows = plan.budgets.filter((b) => b.limitCents || b.spentCents);
  if (rows.length === 0 && plan.uncategorizedSpentCents === 0) {
    return <p className="muted empty">Defina limites para acompanhar quanto resta em cada categoria.</p>;
  }
  return (
    <ul className="bars budget-bars">
      {rows.map((b) => {
        const over = b.limitCents !== null && b.spentCents > b.limitCents;
        const pct = b.limitCents ? Math.min(100, (b.spentCents / b.limitCents) * 100) : 100;
        return (
          <li key={b.categoryId}>
            <div className="bar-label">
              <span>{b.name}</span>
              <span className={over ? "neg" : ""}>
                {money(b.spentCents)}
                {b.limitCents !== null ? ` de ${money(b.limitCents)}` : " · sem limite"}
              </span>
            </div>
            <div className="bar-track">
              <div className="bar" style={{ width: `${pct}%`, background: over ? "var(--neg)" : b.limitCents ? b.color : "#cbd5e1" }} />
            </div>
            {b.limitCents !== null && (
              <span className={`small ${over ? "neg" : "muted"}`}>
                {over ? `Passou ${money(b.spentCents - b.limitCents)}` : `Resta ${money(b.limitCents - b.spentCents)}`}
              </span>
            )}
          </li>
        );
      })}
      {plan.uncategorizedSpentCents > 0 && (
        <li>
          <div className="bar-label">
            <span className="muted">Sem categoria</span>
            <span>{money(plan.uncategorizedSpentCents)}</span>
          </div>
        </li>
      )}
    </ul>
  );
}

function BudgetsModal({ plan, onClose, onSaved }: { plan: MonthPlan; onClose: () => void; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(plan.budgets.map((b) => [b.categoryId, b.ownLimitCents ? centsToInput(b.ownLimitCents) : ""])),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const total = Object.values(values).reduce((s, v) => s + (parseMoney(v) || 0), 0);

  async function save(e: FormEvent) {
    e.preventDefault();
    const items = plan.budgets.map((b) => ({ categoryId: b.categoryId, limitCents: values[b.categoryId] ? parseMoney(values[b.categoryId]) : null }));
    if (items.some((i) => i.limitCents !== null && Number.isNaN(i.limitCents))) return setError("Algum valor está inválido");
    setBusy(true);
    try {
      await api.setBudgets(plan.month, items, plan.scope);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function copyPrev() {
    setBusy(true);
    try {
      await api.copyPreviousPlan(plan.month, plan.scope);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={`${plan.scope === "familia" ? "Limites da família (conjunto)" : "Meus limites"} · ${monthLabel(plan.month)}`} onClose={onClose}>
      <form className="form" onSubmit={save}>
        {plan.scope === "familia" && (
          <p className="info">Estes são os limites da parte conjunta. Os de cada pessoa são definidos na aba “Eu” e já entram somados nas barras da família.</p>
        )}
        <p className="info">
          Disponível para gastar: <strong>{money(plan.availableCents)}</strong> · distribuído: <strong className={total > plan.availableCents ? "neg" : ""}>{money(total)}</strong>
        </p>
        <div className="budget-inputs">
          {plan.budgets.map((b) => (
            <label key={b.categoryId} className="budget-input">
              <span>
                <span className="dot" style={{ background: b.color }} /> {b.name}
              </span>
              <input
                inputMode="decimal"
                placeholder="—"
                value={values[b.categoryId]}
                onChange={(e) => setValues({ ...values, [b.categoryId]: e.target.value })}
                aria-label={`Limite ${b.name}`}
              />
            </label>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          {plan.canCopyBudgets && (
            <button type="button" className="btn ghost" disabled={busy} onClick={copyPrev}>Copiar do mês anterior</button>
          )}
          <button className="btn primary" disabled={busy}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

function PlannedItemModal({ type, month, onClose, onSaved }: { type: "INCOME" | "EXPENSE"; month: string; onClose: () => void; onSaved: () => void }) {
  const { myId, scope } = useHousehold();
  const [responsibleId, setResponsibleId] = useState<string | null>(scope === "familia" && type === "EXPENSE" ? null : myId);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(`${month}-10`);
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.accounts().then((a) => {
      setAccounts(a);
      setAccountId((cur) => cur || a.find((x) => x.type === "CHECKING")?.id || a[0]?.id || "");
    });
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    const cents = parseMoney(amount);
    if (!cents || cents <= 0) return setError("Informe um valor válido");
    setBusy(true);
    try {
      await api.createTransaction({ type, description, amountCents: cents, date, accountId, creditCardId: null, categoryId: null, notes: null, status: "PENDING", responsibleId });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={type === "INCOME" ? "Receita prevista" : "Despesa prevista"} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <p className="info">
          {type === "INCOME"
            ? "Uma entrada que você espera receber (ex.: 13º, freela). No dia, ela aparece em “Para confirmar”."
            : "Um gasto que você já sabe que vai ter (ex.: IPVA, viagem, presente). Entra nos compromissos do mês."}
        </p>
        <label>
          Descrição
          <input value={description} onChange={(e) => setDescription(e.target.value)} required maxLength={100} autoFocus />
        </label>
        <div className="row">
          <label>
            Valor (R$)
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0,00" />
          </label>
          <label>
            Data prevista
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
        </div>
        <ResponsibleSelect value={responsibleId} onChange={setResponsibleId} />
        <label>
          {type === "INCOME" ? "Entra em" : "Sai de"}
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy}>Adicionar</button>
        </div>
      </form>
    </Modal>
  );
}
