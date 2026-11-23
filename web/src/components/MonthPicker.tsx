import { monthLabel, shiftMonth } from "../format";

export function MonthPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  return (
    <div className="month-picker">
      <button className="icon-btn" aria-label="Mês anterior" onClick={() => onChange(shiftMonth(value, -1))}>
        ‹
      </button>
      <span>{monthLabel(value)}</span>
      <button className="icon-btn" aria-label="Próximo mês" onClick={() => onChange(shiftMonth(value, 1))}>
        ›
      </button>
    </div>
  );
}
