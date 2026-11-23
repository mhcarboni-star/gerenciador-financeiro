import { COLORS } from "../format";

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <fieldset className="colors">
      <legend>Cor</legend>
      {COLORS.map((c) => (
        <button
          type="button"
          key={c}
          className={`swatch ${c === value ? "selected" : ""}`}
          style={{ background: c }}
          aria-label={`Cor ${c}`}
          aria-pressed={c === value}
          onClick={() => onChange(c)}
        />
      ))}
    </fieldset>
  );
}
