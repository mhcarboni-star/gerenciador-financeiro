import { useHousehold } from "../household";

/**
 * "De quem é" o lançamento. Só aparece em grupos com mais de uma pessoa.
 * value: id do membro, ou null = Família (conjunto).
 */
export function ResponsibleSelect({ value, onChange, label = "Responsável" }: {
  value: string | null; onChange: (v: string | null) => void; label?: string;
}) {
  const { info, isFamily, myId } = useHousehold();
  if (!isFamily || !info) return null;
  const others = info.members.filter((m) => m.userId !== myId);
  return (
    <label>
      {label}
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value={myId}>Eu</option>
        {others.map((m) => (
          <option key={m.userId} value={m.userId}>{m.name}</option>
        ))}
        <option value="">Família (conjunto)</option>
      </select>
      {value === null && <span className="hint">Gasto/receita da casa: entra só na visão da família.</span>}
    </label>
  );
}

/** Abas Eu / Família (só em grupos com mais de uma pessoa). */
export function ScopeTabs() {
  const { isFamily, scope, setScope } = useHousehold();
  if (!isFamily) return null;
  return (
    <div className="segmented scope-tabs" role="tablist" aria-label="Visão">
      <button role="tab" aria-selected={scope === "eu"} className={scope === "eu" ? "active" : ""} onClick={() => setScope("eu")}>
        Eu
      </button>
      <button role="tab" aria-selected={scope === "familia"} className={scope === "familia" ? "active" : ""} onClick={() => setScope("familia")}>
        Família
      </button>
    </div>
  );
}
