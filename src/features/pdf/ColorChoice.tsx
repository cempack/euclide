import { tr, type StringKey } from "../../lib/i18n";

/** A row of colour swatches; the chosen one is ringed. */
export function ColorChoice({
  colors,
  value,
  onChange,
}: {
  colors: { value: string; label: StringKey }[];
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={tr("pdf.colorsFor")}>
      {colors.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={value === c.value}
          aria-label={tr(c.label)}
          data-tip={tr(c.label)}
          onClick={() => onChange(c.value)}
          className="eu-swatch"
          style={{ "--swatch": c.value } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
