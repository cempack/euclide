import type { ReactNode } from "react";

const START = "\u0002";
const END = "\u0003";

/**
 * A search snippet with its matched words marked: the backend wraps them in
 * \u0002 … \u0003 (src-tauri/src/commands/search.rs), never in markup.
 */
export function Highlight({ text, className = "" }: { text: string; className?: string }) {
  const parts: ReactNode[] = [];
  let rest = text;
  while (rest) {
    const s = rest.indexOf(START);
    const e = s < 0 ? -1 : rest.indexOf(END, s);
    if (e < 0) {
      parts.push(rest.replaceAll(START, "").replaceAll(END, ""));
      break;
    }
    parts.push(rest.slice(0, s));
    parts.push(
      <mark key={parts.length} className="eu-mark">
        {rest.slice(s + 1, e)}
      </mark>,
    );
    rest = rest.slice(e + 1);
  }
  return <span className={className}>{parts}</span>;
}
