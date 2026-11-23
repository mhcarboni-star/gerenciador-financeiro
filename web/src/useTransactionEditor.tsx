import { useEffect, useState } from "react";
import { api, type Account, type Category, type CreditCard, type Transaction } from "./api";
import { Modal } from "./components/Modal";
import { TransactionForm } from "./components/TransactionForm";

/** Estado + modal compartilhados para criar/editar lançamentos. */
export function useTransactionEditor(onChange: () => void) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [editing, setEditing] = useState<Transaction | "new" | null>(null);

  useEffect(() => {
    api.categories().then(setCategories).catch(() => {});
    api.accounts().then(setAccounts).catch(() => {});
    api.cards().then(setCards).catch(() => {});
  }, []);

  const close = () => setEditing(null);
  const done = () => {
    close();
    onChange();
  };

  const modal = editing && (
    <Modal title={editing === "new" ? "Novo lançamento" : "Editar lançamento"} onClose={close}>
      <TransactionForm
        categories={categories}
        accounts={accounts}
        cards={cards}
        initial={editing === "new" ? undefined : editing}
        onSubmit={async (data) => {
          if (editing === "new") await api.createTransaction(data);
          else await api.updateTransaction(editing.id, data);
          done();
        }}
        onDelete={
          editing === "new"
            ? undefined
            : async () => {
                await api.deleteTransaction(editing.id);
                done();
              }
        }
      />
    </Modal>
  );

  return { openNew: () => setEditing("new"), openEdit: setEditing, modal };
}
