import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Account, type Loan, type LoanInterestType } from "../api";
import { addMonthsIso, dayMonth, money, parseMoney, shortDate, today } from "../format";
import { Modal } from "../components/Modal";
import { ColorPicker } from "../components/ColorPicker";
import { INTEREST_LABEL, parseRate, previewInstallment } from "../loanMath";

export function LoansPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.loans().then(setLoans).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
    api.accounts().then(setAccounts);
  }, [load]);

  const active = loans.filter((l) => l.status === "ACTIVE");
  const paidOff = loans.filter((l) => l.status !== "ACTIVE");
  const sum = (f: (l: Loan) => number, ls = active) => ls.reduce((s, l) => s + f(l), 0);

  async function exportPdf() {
    setExporting(true);
    setError("");
    try {
      await api.downloadLoansPdf();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const tile = (l: Loan) => {
    const pct = l.installmentCount
      ? (l.paidInstallments / l.installmentCount) * 100
      : Math.min(100, ((l.principalCents - l.principalOutstandingCents) / l.principalCents) * 100);
    return (
      <button key={l.id} className={`card tile ${l.status !== "ACTIVE" ? "archived" : ""}`} onClick={() => navigate(`/emprestimos/${l.id}`)}>
        <span className="tile-bar" style={{ background: l.color }} />
        <span className="tile-title">{l.name}</span>
        <span className="muted small">
          {l.lender ? `${l.lender} · ` : ""}
          {INTEREST_LABEL[l.interestType]}
        </span>
        {l.status === "ACTIVE" ? (
          <>
            <span className="muted small tile-label">Saldo devedor</span>
            <strong className="tile-value">{money(l.balanceTodayCents)}</strong>
          </>
        ) : (
          <strong className="tile-value pos">Quitado{l.paidOffAt ? ` em ${shortDate(l.paidOffAt)}` : ""}</strong>
        )}
        <span className="bar-track" aria-hidden="true">
          <span className="bar" style={{ width: `${pct}%`, background: l.color }} />
        </span>
        <span className="muted small">
          {l.installmentCount ? `${l.paidInstallments} de ${l.installmentCount} parcelas` : `${money(l.totalPaidCents)} pagos`}
          {l.status === "ACTIVE" && l.nextDueDate ? ` · próxima ${dayMonth(l.nextDueDate)}` : ""}
        </span>
      </button>
    );
  };

  return (
    <>
      <header className="page-head">
        <h1>Empréstimos</h1>
        <div className="head-actions">
          {loans.length > 0 && (
            <button className="btn ghost" onClick={exportPdf} disabled={exporting}>
              {exporting ? "Gerando…" : "Exportar PDF"}
            </button>
          )}
          <button className="btn primary" onClick={() => setCreating(true)}>+ Novo</button>
        </div>
      </header>
      {error && <p className="error">{error}</p>}

      <section className="stats stats-3">
        <div className="card stat">
          <span className="muted small">Saldo devedor total</span>
          <strong className="neg">{money(sum((l) => l.balanceTodayCents))}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Parcelas a pagar</span>
          <strong>{money(sum((l) => l.pendingAmountCents))}</strong>
        </div>
        <div className="card stat">
          <span className="muted small">Juros já pagos</span>
          <strong>{money(sum((l) => l.interestPaidCents, loans))}</strong>
        </div>
      </section>

      <div className="tiles">
        {active.map(tile)}
        {active.length === 0 && <p className="muted empty">Nenhum empréstimo em aberto.</p>}
      </div>
      {paidOff.length > 0 && (
        <>
          <h2 className="spaced">Quitados</h2>
          <div className="tiles">{paidOff.map(tile)}</div>
        </>
      )}

      {creating && (
        <NewLoanModal
          accounts={accounts}
          onClose={() => setCreating(false)}
          onSaved={(id) => {
            setCreating(false);
            navigate(`/emprestimos/${id}`);
          }}
        />
      )}
    </>
  );
}

function NewLoanModal({ accounts, onClose, onSaved }: { accounts: Account[]; onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState("");
  const [lender, setLender] = useState("");
  const [amount, setAmount] = useState("");
  const [interestType, setInterestType] = useState<LoanInterestType>("PRICE");
  const [rate, setRate] = useState("");
  const [count, setCount] = useState("12");
  const [hasPlan, setHasPlan] = useState(true);
  const [startDate, setStartDate] = useState(today());
  const [firstDue, setFirstDue] = useState(addMonthsIso(today(), 1));
  const [received, setReceived] = useState(accounts[0]?.id ?? "");
  const [paymentAccountId, setPaymentAccountId] = useState(accounts[0]?.id ?? "");
  const [color, setColor] = useState("#ca8a04");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const cents = parseMoney(amount);
  const r = interestType === "NONE" ? 0 : parseRate(rate || "0");
  const n = Number(count);
  const withPlan = interestType === "PRICE" || hasPlan;
  const installment = withPlan && cents > 0 && n > 0 && !Number.isNaN(r) ? previewInstallment(cents, r, n) : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!cents || cents <= 0) return setError("Informe o valor emprestado");
    if (interestType !== "NONE" && (Number.isNaN(r) || r <= 0) && interestType === "MONTHLY_ON_BALANCE") return setError("Informe a taxa mensal, ex.: 2,5");
    if (interestType === "PRICE" && Number.isNaN(r)) return setError("Taxa inválida, ex.: 1,99");
    if (withPlan && (!Number.isInteger(n) || n < 1)) return setError("Informe o número de parcelas");
    setBusy(true);
    setError("");
    try {
      const res = await api.createLoan({
        name, lender: lender.trim() || null, principalCents: cents, interestType,
        monthlyRate: interestType === "NONE" ? null : r,
        installmentCount: withPlan ? n : null, startDate, firstDueDate: withPlan ? firstDue : null,
        receivedAccountId: received || null, paymentAccountId, color, notes: null,
      });
      onSaved(res.id);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Novo empréstimo" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="row">
          <label>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} autoFocus placeholder="Ex.: Consignado" />
          </label>
          <label>
            Credor
            <input value={lender} onChange={(e) => setLender(e.target.value)} maxLength={80} placeholder="Banco, pessoa…" />
          </label>
        </div>
        <label>
          Valor emprestado (R$)
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0,00" />
          <span className="hint">Empréstimo já em andamento? Informe o saldo devedor atual e só as parcelas que faltam.</span>
        </label>
        <label>
          Tipo de juros
          <select value={interestType} onChange={(e) => setInterestType(e.target.value as LoanInterestType)}>
            <option value="PRICE">Parcelas fixas com juros (banco, consignado, financiamento)</option>
            <option value="NONE">Sem juros (parente, amigo)</option>
            <option value="MONTHLY_ON_BALANCE">Juros mensais sobre o saldo (pagamentos livres)</option>
          </select>
        </label>
        {interestType !== "NONE" && (
          <label>
            Taxa de juros (% ao mês)
            <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="Ex.: 1,99" required={interestType === "MONTHLY_ON_BALANCE"} />
          </label>
        )}
        {interestType !== "PRICE" && (
          <label className="check">
            <input type="checkbox" checked={hasPlan} onChange={(e) => setHasPlan(e.target.checked)} />
            Tem parcelas combinadas
          </label>
        )}
        {withPlan && (
          <div className="row">
            <label className="narrow">
              Parcelas
              <input type="number" inputMode="numeric" min={1} max={600} value={count} onChange={(e) => setCount(e.target.value)} required />
            </label>
            <label>
              1º vencimento
              <input type="date" value={firstDue} min={startDate} onChange={(e) => setFirstDue(e.target.value)} required />
            </label>
          </div>
        )}
        {installment > 0 && (
          <p className="info">
            {n}x de <strong>{money(installment)}</strong>
            {r > 0 && ` · total ≈ ${money(installment * n)} (juros ≈ ${money(installment * n - cents)})`}
          </p>
        )}
        <div className="row">
          <label>
            Data do empréstimo
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </label>
          <label>
            Dinheiro entrou em
            <select value={received} onChange={(e) => setReceived(e.target.value)}>
              <option value="">Não registrar entrada</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Pagar as parcelas com
          <select value={paymentAccountId} onChange={(e) => setPaymentAccountId(e.target.value)} required>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        <ColorPicker value={color} onChange={setColor} />
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy}>{busy ? "Salvando…" : "Cadastrar"}</button>
        </div>
      </form>
    </Modal>
  );
}
