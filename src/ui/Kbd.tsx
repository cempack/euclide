import { shortcutKeys } from "../lib/shortcuts";

/** Keys drawn as keycaps: <Kbd keys="mod+K" /> → [Ctrl] [K]. */
export function Kbd({ keys, className = "" }: { keys: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {shortcutKeys(keys).map((key) => (
        <kbd key={key} className="eu-kbd">
          {key}
        </kbd>
      ))}
    </span>
  );
}
