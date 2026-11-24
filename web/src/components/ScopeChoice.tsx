import { useEffect, useRef } from "react";

/** Pergunta "só este / este e os próximos" para lançamentos recorrentes. */
export function ScopeChoice({ action, busy, onChoose, onCancel }: {
  action: "save" | "delete";
  busy: boolean;
  onChoose: (scope: "this" | "future") => void;
  onCancel: () => void;
}) {
  const del = action === "delete";
  const ref = useRef<HTMLDivElement>(null);
  // no celular a escolha aparece no fim do formulário: rola até ela
  useEffect(() => ref.current?.scrollIntoView({ block: "end", behavior: "smooth" }), []);
  return (
    <div ref={ref} className="scope-choice" role="dialog" aria-label="Lançamento recorrente">
      <strong>Este lançamento é recorrente.</strong>
      <span className="muted small">{del ? "O que você quer excluir?" : "Aplicar a alteração a:"}</span>
      <div className="scope-options">
        <button type="button" className="btn ghost" disabled={busy} onClick={() => onChoose("this")}>
          {del ? "Só este" : "Só este"}
          <span className="hint block">{del ? "As próximas continuam" : "Os outros meses não mudam"}</span>
        </button>
        <button type="button" className={`btn ${del ? "danger-ghost" : "ghost"}`} disabled={busy} onClick={() => onChoose("future")}>
          Este e os próximos
          <span className="hint block">{del ? "Encerra a recorrência a partir daqui" : "Daqui em diante; os anteriores ficam como estão"}</span>
        </button>
      </div>
      <button type="button" className="link small" onClick={onCancel}>Cancelar</button>
    </div>
  );
}
