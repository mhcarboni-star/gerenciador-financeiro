import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, type Category, type TxType } from "../api";
import { Modal } from "../components/Modal";
import { ColorPicker } from "../components/ColorPicker";
import { COLORS } from "../format";

export function CategoriesPage() {
  const [items, setItems] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | { type: TxType } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api.categories().then(setItems).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const groups: [TxType, string][] = [
    ["EXPENSE", "Despesas"],
    ["INCOME", "Receitas"],
  ];

  return (
    <>
      <header className="page-head">
        <h1>Categorias</h1>
      </header>
      {error && <p className="error">{error}</p>}
      <div className="grid-2">
        {groups.map(([type, label]) => (
          <section className="card" key={type}>
            <div className="section-head">
              <h2>{label}</h2>
              <button className="btn ghost" onClick={() => setEditing({ type })}>
                + Nova
              </button>
            </div>
            <ul className="tx-list">
              {items
                .filter((c) => c.type === type && !c.parentId)
                .flatMap((p) => [p, ...items.filter((c) => c.parentId === p.id)])
                .map((c) => (
                  <li key={c.id}>
                    <button className="tx" onClick={() => setEditing(c)}>
                      <span className="dot" style={{ background: c.color }} />
                      <span className="tx-main">
                        <span className={`tx-desc ${c.parentId ? "sub" : ""}`}>{c.name}</span>
                      </span>
                      <span className="muted small">Editar</span>
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
      {editing && (
        <CategoryModal
          initial={editing}
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

function CategoryModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Category | { type: TxType };
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = "id" in initial ? initial : null;
  const [name, setName] = useState(existing?.name ?? "");
  const [color, setColor] = useState(existing?.color ?? COLORS[2]);
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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(() =>
      existing
        ? api.updateCategory(existing.id, { name, color })
        : api.createCategory({ name, color, type: initial.type }),
    );
  };

  return (
    <Modal title={existing ? "Editar categoria" : "Nova categoria"} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Nome
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus maxLength={40} />
        </label>
        <ColorPicker value={color} onChange={setColor} />
        {error && <p className="error">{error}</p>}
        <div className="actions">
          {existing && (
            <button
              type="button"
              className="btn danger-ghost"
              disabled={busy}
              onClick={() =>
                confirm("Excluir a categoria? Os lançamentos dela ficarão sem categoria.") &&
                run(() => api.deleteCategory(existing.id))
              }
            >
              Excluir
            </button>
          )}
          <button className="btn primary" disabled={busy}>
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}
