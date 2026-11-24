import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, type Category, type TxType } from "../api";
import { Modal } from "../components/Modal";
import { ColorPicker } from "../components/ColorPicker";
import { COLORS } from "../format";

type Editing =
  | { kind: "new"; type: TxType }
  | { kind: "newSub"; parent: Category }
  | { kind: "edit"; item: Category }
  | null;

export function CategoriesPage() {
  const [all, setAll] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<{ id: string; label: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState("");
  const undoTimer = useRef<number>();

  const load = useCallback(() => {
    api.categoriesWithArchived().then(setAll).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const active = all.filter((c) => !c.archivedAt);
  const archived = all.filter((c) => c.archivedAt && (!c.parentId || !all.find((p) => p.id === c.parentId)?.archivedAt));
  const childrenOf = (id: string) => active.filter((c) => c.parentId === id);

  const toggle = (id: string) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  async function remove(c: Category) {
    const subs = childrenOf(c.id).length;
    const msg = subs
      ? `Excluir "${c.name}" e suas ${subs} subcategorias? Os lançamentos continuam com a categoria no histórico, e você pode restaurar depois.`
      : `Excluir "${c.name}"? Você pode restaurar depois.`;
    if (!confirm(msg)) return;
    setError("");
    try {
      await api.deleteCategory(c.id);
      setEditing(null);
      window.clearTimeout(undoTimer.current);
      setUndo({ id: c.id, label: subs ? `"${c.name}" e ${subs} subcategorias excluídas` : `"${c.name}" excluída` });
      undoTimer.current = window.setTimeout(() => setUndo(null), 10000);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function restore(id: string) {
    setError("");
    try {
      await api.restoreCategory(id);
      setUndo(null);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const groups: [TxType, string][] = [
    ["EXPENSE", "Despesas"],
    ["INCOME", "Receitas"],
  ];

  return (
    <>
      <header className="page-head">
        <div>
          <Link to="/lancamentos" className="small">‹ Lançamentos</Link>
          <h1>Categorias</h1>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <div className="grid-2">
        {groups.map(([type, label]) => (
          <section className="card" key={type}>
            <div className="section-head">
              <h2>{label}</h2>
              <button className="btn ghost" onClick={() => setEditing({ kind: "new", type })}>+ Nova categoria</button>
            </div>
            <ul className="cat-list">
              {active
                .filter((c) => c.type === type && !c.parentId)
                .map((p) => {
                  const subs = childrenOf(p.id);
                  const isOpen = open.has(p.id);
                  return (
                    <li key={p.id} className="cat-item">
                      <div className="cat-row">
                        <button className="cat-toggle" onClick={() => toggle(p.id)} aria-expanded={isOpen} aria-label={`${isOpen ? "Recolher" : "Mostrar"} subcategorias de ${p.name}`}>
                          <span className="chev">{isOpen ? "▾" : "▸"}</span>
                          <span className="dot" style={{ background: p.color }} />
                          <span className="cat-name">{p.name}</span>
                          <span className="muted small">{subs.length ? `${subs.length} sub` : ""}</span>
                        </button>
                        <button className="btn ghost add-sub-btn" onClick={() => setEditing({ kind: "newSub", parent: p })} aria-label={`Adicionar subcategoria em ${p.name}`} title="Adicionar subcategoria">
                          + Sub
                        </button>
                        <button className="link small" onClick={() => setEditing({ kind: "edit", item: p })}>Editar</button>
                      </div>
                      {isOpen && (
                        <ul className="sub-list">
                          {subs.map((s) => (
                            <li key={s.id}>
                              <button className="sub-row" onClick={() => setEditing({ kind: "edit", item: s })}>
                                <span>{s.name}</span>
                                <span className="muted small">Editar</span>
                              </button>
                            </li>
                          ))}
                          <li>
                            <button className="link small add-sub" onClick={() => setEditing({ kind: "newSub", parent: p })}>+ Adicionar subcategoria</button>
                          </li>
                        </ul>
                      )}
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>

      {archived.length > 0 && (
        <section className="card spaced">
          <div className="section-head">
            <h2>Excluídas</h2>
            <button className="link small" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Ocultar" : `Ver (${archived.length})`}</button>
          </div>
          {showArchived && (
            <ul className="tx-list">
              {archived.map((c) => {
                const parent = c.parentId ? all.find((p) => p.id === c.parentId) : null;
                const subs = all.filter((s) => s.parentId === c.id && s.archivedAt === c.archivedAt).length;
                return (
                  <li key={c.id} className="member-row">
                    <span className="dot" style={{ background: c.color }} />
                    <span className="tx-main">
                      <span className="tx-desc"><span className="tx-text">{parent ? `${parent.name} › ${c.name}` : c.name}</span></span>
                      <span className="muted small">
                        {c.type === "EXPENSE" ? "Despesa" : "Receita"}
                        {subs ? ` · com ${subs} subcategorias` : ""}
                      </span>
                    </span>
                    <button className="btn ghost" onClick={() => restore(c.id)}>Restaurar</button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {undo && (
        <div className="toast" role="status">
          <span>{undo.label}</span>
          <button className="link" onClick={() => restore(undo.id)}>Desfazer</button>
        </div>
      )}

      {editing && (
        <CategoryModal
          editing={editing}
          subs={editing.kind === "edit" ? childrenOf(editing.item.id) : []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
          onDelete={remove}
          onAddSub={(parent) => setEditing({ kind: "newSub", parent })}
        />
      )}
    </>
  );
}

function CategoryModal({ editing, subs, onClose, onSaved, onDelete, onAddSub }: {
  editing: NonNullable<Editing>;
  subs: Category[];
  onClose: () => void;
  onSaved: () => void;
  onDelete: (c: Category) => void;
  onAddSub: (parent: Category) => void;
}) {
  const existing = editing.kind === "edit" ? editing.item : null;
  const parent = editing.kind === "newSub" ? editing.parent : null;
  const isSub = !!parent || !!existing?.parentId;
  const [name, setName] = useState(existing?.name ?? "");
  const [color, setColor] = useState(existing?.color ?? parent?.color ?? COLORS[2]);
  const [children, setChildren] = useState<string[]>(editing.kind === "new" ? [""] : []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (existing) await api.updateCategory(existing.id, isSub ? { name } : { name, color });
      else if (parent) await api.createCategory({ name, type: parent.type, parentId: parent.id });
      else if (editing.kind === "new") {
        await api.createCategory({ name, type: editing.type, color, children: children.map((c) => c.trim()).filter(Boolean) });
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const title = existing ? (isSub ? "Editar subcategoria" : "Editar categoria") : parent ? `Nova subcategoria em ${parent.name}` : "Nova categoria";

  return (
    <Modal title={title} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Nome
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus maxLength={40} placeholder={isSub ? "Ex.: Condomínio" : "Ex.: Moradia"} />
        </label>
        {!isSub && <ColorPicker value={color} onChange={setColor} />}

        {editing.kind === "new" && (
          <fieldset className="group">
            <legend className="small muted">Subcategorias (opcional)</legend>
            {children.map((c, i) => (
              <div key={i} className="sub-input">
                <input
                  value={c}
                  placeholder={["Ex.: Aluguel", "Ex.: Condomínio", "Ex.: Energia"][i] ?? "Subcategoria"}
                  maxLength={40}
                  aria-label={`Subcategoria ${i + 1}`}
                  onChange={(e) => setChildren(children.map((x, j) => (j === i ? e.target.value : x)))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      setChildren([...children, ""]);
                    }
                  }}
                />
                <button type="button" className="icon-btn" aria-label="Remover subcategoria" onClick={() => setChildren(children.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <button type="button" className="link small" onClick={() => setChildren([...children, ""])}>+ Adicionar subcategoria</button>
          </fieldset>
        )}

        {existing && !isSub && (
          <div className="group">
            <span className="small muted">Subcategorias</span>
            {subs.length === 0 ? <span className="muted small">Nenhuma ainda.</span> : <span className="small">{subs.map((s) => s.name).join(", ")}</span>}
            <button type="button" className="btn ghost" onClick={() => onAddSub(existing)}>+ Adicionar subcategoria</button>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        <div className="actions">
          {existing && (
            <button type="button" className="btn danger-ghost" disabled={busy} onClick={() => onDelete(existing)}>Excluir</button>
          )}
          <button className="btn primary" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button>
        </div>
      </form>
    </Modal>
  );
}
