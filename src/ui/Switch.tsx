/** An on/off setting: a button with role="switch", labelled by `label`. */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="eu-switch"
    >
      <span aria-hidden className="eu-switch-thumb" />
    </button>
  );
}
