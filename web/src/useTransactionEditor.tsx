import { useCallback, useEffect, useState } from "react";
import { api, type Account, type Category, type CreditCard, type Transaction } from "./api";
import { Modal } from "./components/Modal";
import { TransactionForm } from "./components/TransactionForm";
import { ConfirmForm } from "./components/ConfirmForm";
import { LoanPayForm } from "./components/LoanPayForm";
import { money, shortDate } from "./format";

type State = { mode: "new" } | { mode: "edit"; tx: Transaction } | { mode: "confirm"; tx: Transaction } | null;

/** Estado + janelas compartilhadas para criar, editar e confirmar lançamentos. */
export function useTransactionEditor(onChange: () => void) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [state, setState] = useState<State>(null);

  const loadRefs = useCallback(() => {
    api.categories().then(setCategories).catch(() => {});
    api.accounts().then(setAccounts).catch(() => {});
    api.cards().then(setCards).catch(() => {});
  }, []);
  useEffect(loadRefs, [loadRefs]);

  const close = () => setState(null);
  const done = () => {
    close();
    onChange();
  };

  let modal = null;
  if (state?.mode === "confirm" && state.tx.type === "LOAN_PAYMENT") {
    const tx = state.tx;
    modal = (
      <Modal title="Confirmar pagamento" onClose={close}>
        <LoanPayForm
          title={tx.description}
          expectedCents={tx.amountCents}
          dueDate={tx.date.slice(0, 10)}
          defaultAccountId={tx.accountId ?? ""}
          accounts={accounts}
          submitLabel="Confirmar"
          onSubmit={(d) => api.confirmLoanPayment(tx.id, d)}
          onSaved={done}
        />
      </Modal>
    );
  } else if (state?.mode === "confirm") {
    modal = (
      <Modal title={state.tx.type === "INCOME" ? "Confirmar recebimento" : "Confirmar pagamento"} onClose={close}>
        <ConfirmForm tx={state.tx} accounts={accounts} cards={cards} onSaved={done} />
      </Modal>
    );
  } else if (state?.mode === "edit" && !["INCOME", "EXPENSE", "TRANSFER"].includes(state.tx.type)) {
    modal = (
      <Modal title="Lançamento" onClose={close}>
        <ReadOnly tx={state.tx} onDeleted={done} />
      </Modal>
    );
  } else if (state) {
    const tx = state.mode === "edit" ? state.tx : undefined;
    modal = (
      <Modal title={tx ? "Editar lançamento" : "Novo lançamento"} onClose={close}>
        <TransactionForm categories={categories} accounts={accounts} cards={cards} initial={tx} onSaved={done} />
      </Modal>
    );
  }

  return {
    openNew: () => setState({ mode: "new" }),
    // Lançamento previsto abre direto a confirmação.
    openEdit: (tx: Transaction) =>
      setState(
        tx.status === "PENDING" && (tx.type === "INCOME" || tx.type === "EXPENSE" || tx.type === "LOAN_PAYMENT")
          ? { mode: "confirm", tx }
          : { mode: "edit", tx },
      ),
    openForm: (tx: Transaction) => setState({ mode: "edit", tx }),
    openConfirm: (tx: Transaction) => setState({ mode: "confirm", tx }),
    modal,
    accounts,
    cards,
    reloadRefs: loadRefs,
  };
}

/** Pagamento de fatura e de empréstimo: só consulta (e excluir o pagamento de fatura). */
function ReadOnly({ tx, onDeleted }: { tx: Transaction; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isInvoice = tx.type === "INVOICE_PAYMENT";
  return (
    <div className="form">
      <div className="confirm-head">
        <strong>{tx.description}</strong>
        <span className="muted small">
          {money(tx.amountCents)} em {shortDate(tx.date)} · {tx.account?.name}
        </span>
      </div>
      <p className="info">
        {isInvoice
          ? "Pagamento de fatura do cartão. Não entra nas despesas do mês, porque as compras já entraram."
          : "Pagamento de empréstimo. Edite na aba Empréstimos."}
      </p>
      {error && <p className="error">{error}</p>}
      {isInvoice && (
        <div className="actions">
          <button
            className="btn danger-ghost"
            disabled={busy}
            onClick={async () => {
              if (!confirm("Excluir este pagamento? A fatura volta a ficar em aberto.")) return;
              setBusy(true);
              try {
                await api.deleteTransaction(tx.id);
                onDeleted();
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            Excluir pagamento
          </button>
        </div>
      )}
    </div>
  );
}
