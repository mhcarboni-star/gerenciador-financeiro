import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Account, type Loan, type LoanStatementLine } from "../api";
import { money, shortDate } from "../format";
import { Modal } from "../components/Modal";
import { ColorPicker } from "../components/ColorPicker";
import { LoanPayForm } from "../components/LoanPayForm";
import { INTEREST_LABEL, rateLabel } from "../loanMath";

type Dialog = { kind: "confirm"; line: LoanStatementLine } | { kind: "paid"; line: LoanStatementLine } | { kind: "extra" } | { kind: "edit" } | null;

export function LoanPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [loan, setLoan] = useState<Loan | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.loan(id).then(setLoan).catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    load();
    api.accounts().then(setAccounts);
  }, [load]);

  const done = () => {
    setDialog(null);
    load();
  };

  if (!loan) return <p className="muted">{error || "Carregando…"}</p>;
  const active = loan.status === "ACTIVE";
  const paid = loan.statement.filter((s) => s.status === "PAID");
  const pending = loan.statement.filter((s) => s.status === "PENDING");

  const row = (s: LoanStatementLine) => (
    <li key={s.id}>
      <button className={`tx ${s.status === "PENDING" ? "pending" : ""}`} onClick={() => setDialog({ kind: s.status === "PENDING" ? "confirm" : "paid", line: s })}>
        <span className="inst-num">{s.number ?? "Avulso"}</span>
        <span className="tx-main">
          <span className="tx-desc">
            {shortDate(s.date)}
            {s.status === "PENDING" ? <span className="badge">previsto</span> : <span className="tag paid inline">pago</span>}
          </span>
          <span className="muted small wrap">
            {s.interestCents ? `Juros ${money(s.interestCents)} · ` : ""}
            Amortiza {money(s.principalCents ?? s.amountCents)} · saldo {money(s.balanceAfterCents)}
          </span>
        </span>
        <span className="tx-amount">{money(s.amountCents)}</span>
      </button>
    </li>
  );

  return (
    <>
      <header className="page-head">
        <div>
          <Link to="/emprestimos" className="small">‹ Empréstimos</Link>
          <h1>{loan.name}</h1>
          <span className="muted small">
            {loan.lender ? `${loan.lender} · ` : ""}
            {INTEREST_LABEL[loan.interestType]}
            {loan.interestType !== "NONE" ? ` · ${rateLabel(loan.monthlyRate)}` : ""}
          </span>
        </div>
        <button className="btn ghost" onClick={() => setDialog({ kind: "edit" })}>Editar</button>
      </header>
      {error && <p className="error">{error}</p>}

      <section className={`card loan-balance ${active ? "" : "done"}`}>
        {active ? (
          <>
            <span className="muted small">Saldo devedor hoje</span>
            <strong className="invoice-total">{money(loan.balanceTodayCents)}</strong>
            {loan.accruedInterestCents > 0 && (
              <span className="muted small">
                Principal {money(loan.principalOutstandingCents)} + juros acumulados {money(loan.accruedInterestCents)}
              </span>
            )}
            <button className="btn primary" onClick={() => setDialog({ kind: "extra" })}>Pagamento avulso / antecipação</button>
          </>
        ) : (
          <>
            <span className="tag paid">Quitado</span>
            <strong className="invoice-total">{loan.paidOffAt ? `em ${shortDate(loan.paidOffAt)}` : ""}</strong>
          </>
        )}
      </section>

      <section className="stats">
        <div className="card stat"><span className="muted small">Valor emprestado</span><strong>{money(loan.principalCents)}</strong></div>
        <div className="card stat"><span className="muted small">Total pago</span><strong>{money(loan.totalPaidCents)}</strong></div>
        <div className="card stat"><span className="muted small">Juros pagos</span><strong>{money(loan.interestPaidCents)}</strong></div>
        <div className="card stat">
          <span className="muted small">Parcelas</span>
          <strong>{loan.installmentCount ? `${loan.paidInstallments} de ${loan.installmentCount}` : `${paid.length} pagamentos`}</strong>
        </div>
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Extrato</h2>
          {pending.length > 0 && <span className="muted small">Falta {money(loan.pendingAmountCents)} pelo plano</span>}
        </div>
        {loan.statement.length === 0 ? (
          <p className="muted empty">Nenhum pagamento ainda. Use “Pagamento avulso” para registrar.</p>
        ) : (
          <ul className="tx-list">{[...paid, ...pending].map(row)}</ul>
        )}
      </section>

      <p className="center-text">
        <button
          className="link small danger-link"
          onClick={async () => {
            if (!confirm("Excluir este empréstimo e TODOS os lançamentos dele (entrada do dinheiro e pagamentos)? Os saldos das contas serão recalculados.")) return;
            await api.deleteLoan(loan.id);
            navigate("/emprestimos");
          }}
        >
          Excluir empréstimo
        </button>
      </p>

      {dialog?.kind === "confirm" && (
        <Modal title="Confirmar pagamento" onClose={() => setDialog(null)}>
          <LoanPayForm
            title={`${loan.name} · parcela ${dialog.line.number}${loan.installmentCount ? `/${loan.installmentCount}` : ""}`}
            expectedCents={dialog.line.amountCents}
            dueDate={dialog.line.date}
            defaultAccountId={dialog.line.accountId ?? loan.paymentAccountId ?? ""}
            accounts={accounts}
            submitLabel="Confirmar"
            onSubmit={(d) => api.confirmLoanPayment(dialog.line.id, d)}
            onSaved={done}
          />
        </Modal>
      )}
      {dialog?.kind === "extra" && (
        <Modal title="Pagamento avulso" onClose={() => setDialog(null)}>
          <LoanPayForm
            title={loan.name}
            subtitle={`Saldo devedor hoje: ${money(loan.balanceTodayCents)}`}
            defaultAccountId={loan.paymentAccountId ?? ""}
            accounts={accounts}
            submitLabel="Registrar"
            hint={
              loan.interestType === "PRICE"
                ? "Na antecipação, o valor todo abate a dívida e as parcelas restantes são recalculadas (ficam menores)."
                : loan.interestType === "MONTHLY_ON_BALANCE"
                  ? "Primeiro são descontados os juros acumulados desde o último pagamento; o resto abate a dívida."
                  : "O valor todo abate a dívida."
            }
            onSubmit={(d) => api.payLoan(loan.id, d)}
            onSaved={done}
          />
        </Modal>
      )}
      {dialog?.kind === "paid" && (
        <Modal title="Pagamento" onClose={() => setDialog(null)}>
          <div className="form">
            <div className="confirm-head">
              <strong>{dialog.line.number ? `Parcela ${dialog.line.number}` : "Pagamento avulso"} · {money(dialog.line.amountCents)}</strong>
              <span className="muted small">
                Pago em {shortDate(dialog.line.date)} · juros {money(dialog.line.interestCents ?? 0)} · amortização {money(dialog.line.principalCents ?? dialog.line.amountCents)}
              </span>
            </div>
            <p className="info">
              Desfazer {dialog.line.number ? "volta a parcela para prevista" : "exclui este pagamento"} e recalcula as parcelas restantes.
            </p>
            <div className="actions">
              <button
                className="btn danger-ghost"
                onClick={async () => {
                  try {
                    await api.undoLoanPayment(dialog.line.id);
                    done();
                  } catch (e) {
                    setError((e as Error).message);
                    setDialog(null);
                  }
                }}
              >
                Desfazer pagamento
              </button>
            </div>
          </div>
        </Modal>
      )}
      {dialog?.kind === "edit" && <EditLoanModal loan={loan} accounts={accounts} onClose={() => setDialog(null)} onSaved={done} />}
    </>
  );
}

function EditLoanModal({ loan, accounts, onClose, onSaved }: { loan: Loan; accounts: Account[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(loan.name);
  const [lender, setLender] = useState(loan.lender ?? "");
  const [paymentAccountId, setPaymentAccountId] = useState(loan.paymentAccountId ?? accounts[0]?.id ?? "");
  const [notes, setNotes] = useState(loan.notes ?? "");
  const [color, setColor] = useState(loan.color);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.updateLoan(loan.id, { name, lender: lender.trim() || null, paymentAccountId, notes: notes.trim() || null, color });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Editar empréstimo" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="row">
          <label>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          </label>
          <label>
            Credor
            <input value={lender} onChange={(e) => setLender(e.target.value)} maxLength={80} />
          </label>
        </div>
        <label>
          Pagar as parcelas com
          <select value={paymentAccountId} onChange={(e) => setPaymentAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        <label>
          Observações
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </label>
        <ColorPicker value={color} onChange={setColor} />
        <span className="hint">Valor, juros e parcelas não mudam depois do cadastro. Para corrigir, exclua e cadastre de novo.</span>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
