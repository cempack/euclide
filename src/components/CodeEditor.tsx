import { useEffect, useMemo, useRef, useState } from "react";
import { api, type PythonCompletion } from "../lib/api";

// Tiny Python keyword + builtin set for autocomplete + coloring
const PYTHON_KEYWORDS = new Set([
  "def", "class", "if", "elif", "else", "for", "while", "in", "import", "from", "as",
  "return", "yield", "try", "except", "finally", "with", "pass", "break", "continue",
  "True", "False", "None", "and", "or", "not", "lambda", "global", "nonlocal", "assert",
  "del", "raise", "is", "async", "await",
]);
const PYTHON_BUILTINS = new Set([
  "print", "len", "range", "int", "str", "list", "dict", "set", "tuple", "bool", "float",
  "open", "input", "abs", "min", "max", "sum", "sorted", "enumerate", "zip", "map", "filter",
  "self", "super", "type", "isinstance", "hasattr", "getattr", "setattr", "dir", "help",
  "repr", "str", "chr", "ord", "hex", "bin", "oct",
]);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

type Token = { text: string; type: "keyword" | "builtin" | "string" | "comment" | "number" | "plain" };

function tokenizePython(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = src.length;

  while (i < len) {
    const ch = src[i];

    // line comment
    if (ch === "#") {
      let j = i;
      while (j < len && src[j] !== "\n") j++;
      tokens.push({ text: src.slice(i, j), type: "comment" });
      i = j;
      continue;
    }

    // strings (single / double / triple)
    if (ch === '"' || ch === "'") {
      const q = ch;
      let j = i + 1;
      let triple = false;
      if (src[j] === q && src[j + 1] === q) {
        triple = true;
        j += 2;
      }
      while (j < len) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (triple) {
          if (src[j] === q && src[j + 1] === q && src[j + 2] === q) {
            j += 3;
            break;
          }
        } else if (src[j] === q) {
          j++;
          break;
        }
        j++;
      }
      tokens.push({ text: src.slice(i, j), type: "string" });
      i = j;
      continue;
    }

    // number (very simple)
    if (/\d/.test(ch)) {
      let j = i;
      while (j < len && /[\d._]/.test(src[j])) j++;
      tokens.push({ text: src.slice(i, j), type: "number" });
      i = j;
      continue;
    }

    // identifier / word
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < len && /[\w_]/.test(src[j])) j++;
      const w = src.slice(i, j);
      const type: Token["type"] = PYTHON_KEYWORDS.has(w) ? "keyword" : PYTHON_BUILTINS.has(w) ? "builtin" : "plain";
      tokens.push({ text: w, type });
      i = j;
      continue;
    }

    // everything else (ws, ops, punct)
    tokens.push({ text: ch, type: "plain" });
    i++;
  }
  return tokens;
}

// Very small autocomplete list (keywords + builtins)
const AUTOCOMPLETE_LIST = [
  ...Array.from(PYTHON_KEYWORDS),
  ...Array.from(PYTHON_BUILTINS),
].sort();

export default function CodeEditor({
  value,
  onChange,
  placeholder,
  className,
  filename,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  filename?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [suggestions, setSuggestions] = useState<PythonCompletion[]>([]);
  const [selSug, setSelSug] = useState(0);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const completeTimer = useRef<number | null>(null);

  const lines = Math.max(value.split("\n").length, 1);

  const tokens = useMemo(() => tokenizePython(value), [value]);

  // Sync gutter + highlight pre scroll with textarea
  const syncScroll = () => {
    const ta = taRef.current;
    const g = gutterRef.current;
    const p = preRef.current;
    if (ta && g) g.scrollTop = ta.scrollTop;
    if (ta && p) p.scrollTop = ta.scrollTop;
    if (ta && p) p.scrollLeft = ta.scrollLeft;
  };

  // Basic indent helpers
  const applyTextChange = (next: string, newCursor: number) => {
    onChange(next);
    // restore caret after React updates the value
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) {
        ta.selectionStart = ta.selectionEnd = newCursor;
        ta.focus();
      }
    });
  };

  const getLineIndent = (line: string): string => {
    const m = line.match(/^(\s*)/);
    return m ? m[1] : "";
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    // --- Autocomplete navigation when popup open ---
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelSug((s) => Math.min(suggestions.length - 1, s + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelSug((s) => Math.max(0, s - 1));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        acceptSuggestion(suggestions[selSug]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSuggestions([]);
        return;
      }
    }

    // --- Tab / Shift+Tab indent ---
    if (e.key === "Tab") {
      e.preventDefault();
      const shift = e.shiftKey;
      const before = value.slice(0, start);
      const after = value.slice(end);

      if (start !== end) {
        // block indent/dedent on selected lines
        const selText = value.slice(start, end);
        const linesArr = selText.split("\n");
        const newLines = linesArr.map((ln) => {
          if (shift) {
            return ln.startsWith("    ") ? ln.slice(4) : ln.replace(/^\s{0,4}/, "");
          }
          return "    " + ln;
        });
        const replacement = newLines.join("\n");
        const next = before + replacement + after;
        const delta = replacement.length - selText.length;
        applyTextChange(next, end + delta);
      } else {
        if (shift) {
          // dedent at caret if possible
          const lineStart = before.lastIndexOf("\n") + 1;
          const line = before.slice(lineStart) + after.split("\n")[0];
          if (line.startsWith("    ")) {
            const next = value.slice(0, lineStart) + line.slice(4) + value.slice(lineStart + line.length);
            applyTextChange(next, Math.max(lineStart, start - 4));
          }
        } else {
          const next = before + "    " + after;
          applyTextChange(next, start + 4);
        }
      }
      return;
    }

    // --- Enter: auto-indent ---
    if (e.key === "Enter") {
      e.preventDefault();
      const before = value.slice(0, start);
      const after = value.slice(end);
      const curLine = before.slice(before.lastIndexOf("\n") + 1);
      let indent = getLineIndent(curLine);

      // increase indent after colon (pythonic)
      const trimmed = curLine.trimEnd();
      if (trimmed.endsWith(":")) {
        indent += "    ";
      }

      const insertion = "\n" + indent;
      const next = before + insertion + after;
      applyTextChange(next, start + insertion.length);
      // close suggestions
      setSuggestions([]);
      return;
    }

    // --- Backspace smart dedent (at indent boundary) ---
    if (e.key === "Backspace" && start === end) {
      const before = value.slice(0, start);
      const lineStart = before.lastIndexOf("\n") + 1;
      const col = start - lineStart;
      if (col > 0 && col % 4 === 0) {
        const prefix = before.slice(lineStart, start);
        if (/^\s+$/.test(prefix) && prefix.length >= 4) {
          e.preventDefault();
          const next = before.slice(0, start - 4) + value.slice(end);
          applyTextChange(next, start - 4);
          return;
        }
      }
    }

    // --- Ctrl/Cmd + Space : force autocomplete ---
    if ((e.ctrlKey || e.metaKey) && e.key === " ") {
      e.preventDefault();
      triggerAutocomplete(true);
      return;
    }
  };

  const onInput = () => {
    // live update suggestions while typing — fast local path immediately, intelligent backend debounced
    requestAnimationFrame(() => triggerAutocomplete(false));
    syncScroll();
  };

  // Compute 1-based line/col for Jedi (and position the popup)
  function computeLineCol(pos: number) {
    const textUpTo = value.slice(0, pos);
    const lines = textUpTo.split("\n");
    const line = lines.length; // 1-based
    const col = (lines[lines.length - 1] || "").length + 1; // 1-based
    return { line, col };
  }

  // Position the popup under the caret (approx, using mono metrics)
  function positionPopup(pos: number) {
    const ta = taRef.current;
    if (!ta) return;
    const rect = ta.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect() ?? rect;

    const textUpToCaret = value.slice(0, pos);
    const row = textUpToCaret.split("\n").length - 1;
    const lastLine = textUpToCaret.split("\n").pop() || "";
    const col = lastLine.length;

    const lh = 19.4;
    const cw = 7.1;
    const padTop = 12;
    const padLeft = 12;

    let top = padTop + row * lh - ta.scrollTop + 18;
    let left = padLeft + col * cw - ta.scrollLeft + 2;

    top = Math.max(4, Math.min(top, rect.height - 80));
    left = Math.max(4, Math.min(left, rect.width - 160));

    setPopupPos({ top: top - (containerRect.top - rect.top), left });
  }

  // Fast synchronous local filter (keywords + builtins) — feels instant while typing letters
  function localFilter(word: string): PythonCompletion[] {
    if (!word || word.length < 2) return [];
    const lower = word.toLowerCase();
    return AUTOCOMPLETE_LIST
      .filter((w) => w.toLowerCase().startsWith(lower) && w !== word)
      .slice(0, 8)
      .map((name) => ({ name }));
  }

  // Main trigger — always runs fast local, then (debounced) asks Jedi via sidecar for rich results
  const triggerAutocomplete = (force: boolean) => {
    const ta = taRef.current;
    if (!ta) return;

    const pos = ta.selectionStart;

    // current leaf identifier for local filter / length (Jedi gets full source + pos so it sees "math." context)
    let wstart = pos;
    while (wstart > 0 && /[\w_]/.test(value[wstart - 1])) wstart--;
    const word = value.slice(wstart, pos);

    // local fast path (only for bare identifiers; dots/attrs go to Jedi)
    const local = localFilter(word);
    if (local.length > 0) {
      setSuggestions(local);
      setSelSug(0);
      positionPopup(pos);
    } else if (!force) {
      // if no local match and not forced, clear (backend may still bring attrs etc)
      // but don't clear yet if we might get backend hits
    }

    // decide whether to ask the intelligent backend
    const prefix = value.slice(0, pos);
    const shouldAskBackend =
      force ||
      word.length >= 2 ||
      prefix.endsWith(".") ||
      /\b(import|from)\s+\w*$/.test(prefix) ||
      /\b\w+\.$/.test(prefix);

    if (!shouldAskBackend) {
      if (local.length === 0) setSuggestions([]);
      return;
    }

    // debounce the (slower) sidecar call
    if (completeTimer.current) window.clearTimeout(completeTimer.current);
    completeTimer.current = window.setTimeout(async () => {
      try {
        const { line, col } = computeLineCol(pos);
        const items = await api.pythonComplete(value, line, col, filename);
        if (items && items.length > 0) {
          // Prefer backend rich results (they include locals, stdlib, attrs, methods, etc.)
          setSuggestions(items);
          setSelSug(0);
          positionPopup(pos);
        } else if (local.length === 0) {
          setSuggestions([]);
        }
      } catch {
        // backend unavailable or jedi missing — keep whatever local we had (or clear)
        if (local.length === 0) setSuggestions([]);
      }
    }, 140); // ~140ms debounce is responsive but not too noisy
  };

  const acceptSuggestion = (s: PythonCompletion | undefined) => {
    if (!s) return;
    const ta = taRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;

    // Only walk back over the *leaf identifier* (letters/digits/_). Stop at '.' so
    // that for "math.sq|"  wstart lands on 's', "before" keeps the "math.", and we
    // insert just "sqrt" → "math.sqrt". For "math.|" wstart == pos and we append after dot.
    let wstart = pos;
    while (wstart > 0 && /[\w_]/.test(value[wstart - 1])) wstart--;

    const before = value.slice(0, wstart);
    const after = value.slice(pos);

    // Jedi .name is the correct leaf name to insert (handles "print", "range", "sqrt", user funcs, etc.)
    const toInsert = s.name;

    const next = before + toInsert + after;
    const newPos = wstart + toInsert.length;

    onChange(next);
    setSuggestions([]);
    requestAnimationFrame(() => {
      if (taRef.current) {
        taRef.current.selectionStart = taRef.current.selectionEnd = newPos;
        taRef.current.focus();
      }
    });
  };

  // Close popup on outside click / blur
  useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        setSuggestions([]);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      if (completeTimer.current) window.clearTimeout(completeTimer.current);
    };
  }, []);

  const onTaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  // keep gutter/pre in sync when value or scroll changes
  useEffect(() => {
    syncScroll();
  }, [value]);

  return (
    <div className={`code-editor flex h-full rounded-lg border border-hairline bg-surface overflow-hidden eu-no-drag ${className || ''}`}>
      {/* gutter */}
      <div
        ref={gutterRef}
        className="select-none overflow-hidden py-3 pl-3 pr-2 text-right text-body-mute/70 opacity-50 bg-surface text-[12.5px] leading-[1.55]"
        style={{ minWidth: 42 }}
      >
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="gutter-line">{i + 1}</div>
        ))}
      </div>

      {/* editor surface: highlight pre + transparent textarea + autocomplete popup */}
      <div ref={containerRef} className="relative flex-1 h-full min-h-[260px]">
        <pre
          ref={preRef}
          className="absolute inset-0 m-0 py-3 px-3 overflow-auto pointer-events-none whitespace-pre text-on-surface select-none"
          aria-hidden
        >
          {tokens.map((tok, idx) => (
            <span key={idx} className={`tok-${tok.type}`}>
              {escapeHtml(tok.text)}
            </span>
          ))}
        </pre>

        <textarea
          ref={taRef}
          value={value}
          onChange={onTaChange}
          onInput={onInput}
          onScroll={syncScroll}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // small delay so click on suggestion can win
            setTimeout(() => setSuggestions([]), 120);
          }}
          placeholder={placeholder}
          spellCheck={false}
          wrap="off"
          className="absolute inset-0 py-3 px-3 resize-none bg-transparent outline-none text-transparent caret-[rgb(var(--eu-text))] placeholder:text-body-mute placeholder:opacity-50 selectable eu-no-drag"
        />

        {/* intelligent autocomplete popup (Jedi-powered when available) */}
        {suggestions.length > 0 && (
          <div
            className="absolute z-30 min-w-[160px] max-w-[320px] rounded-md border border-hairline bg-surface shadow text-xs py-0.5"
            style={{ top: popupPos.top, left: popupPos.left }}
          >
            {suggestions.map((s, i) => {
              const isSel = i === selSug;
              const label = s.name;
              const extra = s.signature || (s.type ? `(${s.type})` : "");
              return (
                <div
                  key={`${s.name}-${i}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    acceptSuggestion(s);
                  }}
                  className={`px-2.5 py-1 cursor-pointer flex flex-col gap-0.5 ${isSel ? "bg-surface-container text-tui-accent" : "hover:bg-surface-container/60"}`}
                >
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-medium tabular-nums">{label}</span>
                    {extra && <span className={`text-[10px] ${isSel ? "text-tui-accent/80" : "text-mute"} truncate`}>{extra}</span>}
                  </div>
                  {isSel && s.doc && (
                    <div className="text-[9px] text-mute/80 pl-0.5 pr-2 line-clamp-2 border-l border-hairline/60 ml-0.5">
                      {s.doc.split("\n")[0]}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="px-2 pt-0.5 pb-1 text-[9px] text-mute border-t border-hairline mt-0.5">
              Tab / ⏎ accepte • Esc ferme • Ctrl+Space force
              {suggestions[0]?.type ? "" : " • (local keywords)"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
