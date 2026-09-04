import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api, type SearchResult } from "../lib/api";
import { useTabs } from "../lib/tabs";
import { get } from "../lib/i18n";

import {
  BellIcon,
  BookIcon,
  DocIcon,
  GearIcon,
  HomeIcon,

  NoteIcon,
  PenIcon,
  SearchIcon,
  ToolIcon,
  CodeIcon,
  HelpIcon,
  SparkleIcon,
} from "./icons";

interface Action {
  id: string;
  label: string;
  hint?: string;
  /** Search-result excerpt (PDF content matches). */
  snippet?: string;
  group: string;
  icon: React.ReactNode;
  run: () => void;
}

/**
 * Prefixes narrow the search, as in an editor palette:
 *   `>` commands · `@` courses · `#` documents · `!` reminders
 * Typing nothing shows the commands, which is the old behaviour.
 */
const PREFIXES = [
  { key: ">", label: get("palette.prefixCommands", "commandes") },
  { key: "@", label: get("palette.prefixCourses", "cours") },
  { key: "#", label: get("palette.prefixDocs", "documents") },
  { key: "!", label: get("palette.prefixReminders", "rappels") },
] as const;

type Scope = "all" | "commands" | "courses" | "documents" | "reminders";

function scopeOf(query: string): { scope: Scope; term: string } {
  const c = query.charAt(0);
  if (c === ">") return { scope: "commands", term: query.slice(1).trimStart() };
  if (c === "@") return { scope: "courses", term: query.slice(1).trimStart() };
  if (c === "#") return { scope: "documents", term: query.slice(1).trimStart() };
  if (c === "!") return { scope: "reminders", term: query.slice(1).trimStart() };
  return { scope: "all", term: query };
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function scoreMatch(text: string, q: string): number {
  const t = norm(text);
  const qq = norm(q);
  if (!qq) return 0;
  if (t === qq) return 100;
  if (t.startsWith(qq)) return 90;
  if (t.includes(qq)) return 75;
  // subsequence match (handles partial typing + some typos/gaps)
  let ti = 0;
  let qi = 0;
  while (ti < t.length && qi < qq.length) {
    if (t[ti] === qq[qi]) {
      qi++;
    }
    ti++;
  }
  if (qi === qq.length) return 65;
  // very loose partial
  if (qi >= Math.max(2, Math.floor(qq.length * 0.6))) return 40;
  return 0;
}

export default function CommandPalette({
  open,
  onClose,
  onHelp,
}: {
  open: boolean;
  onClose: () => void;
  onHelp: () => void;
}) {
  const tabs = useTabs();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSel(0);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  // global search across courses, files (name + content) and notes
  useEffect(() => {
    const { term: searchTerm, scope: searchScope } = scopeOf(query);
    if (searchScope === "commands") {
      setResults([]);
      return;
    }
    const h = setTimeout(() => {
      if (searchTerm.trim().length < 2) return setResults([]);
      api
        .globalSearch(searchTerm.trim())
        .then((r) => setResults(Array.isArray(r) ? r : []))
        .catch(() => {});
    }, 130);
    return () => clearTimeout(h);
  }, [query]);

  const { scope, term } = scopeOf(query);

  const baseActions = useMemo<Action[]>(() => {
    const go = (kind: any, title?: string, params?: any) => () => {
      tabs.open({ kind, title, params });
      onClose();
    };
    const G = get("palette.groupCommands", "Commandes");
    return [
      { id: "dash", group: G, label: get("nav.dashboard", "Tableau de bord"), icon: <HomeIcon className="w-4 h-4" />, run: go("dashboard") },
      { id: "courses", group: G, label: get("nav.courses", "Cours"), icon: <BookIcon className="w-4 h-4" />, run: go("courses") },
      { id: "docs", group: G, label: get("nav.documents", "Documents"), icon: <DocIcon className="w-4 h-4" />, run: go("documents") },
      { id: "tools", group: G, label: get("nav.tools", "Outils"), icon: <ToolIcon className="w-4 h-4" />, run: go("tools") },
      { id: "python", group: G, label: get("nav.python", "Python"), icon: <CodeIcon className="w-4 h-4" />, run: go("python") },
      { id: "reminders", group: G, label: get("nav.reminders", "Rappels"), icon: <BellIcon className="w-4 h-4" />, run: go("reminders") },
      {
        id: "board",
        group: G,
        label: get("nav.whiteboard", "Tableau blanc"),
        hint: get("palette.new", "nouveau"),
        icon: <PenIcon className="w-4 h-4" />,
        run: go("whiteboard", get("app.tabWhiteboard", "Tableau"), { isNew: true }),
      },
      {
        id: "note",
        group: G,
        label: get("common.newNote", "Nouvelle note"),
        hint: get("palette.new", "nouveau"),
        icon: <NoteIcon className="w-4 h-4" />,
        run: go("note", get("common.newNote", "Nouvelle note"), { isNew: true }),
      },
      { id: "recap", group: G, label: get("nav.recap", "Bilan"), icon: <SparkleIcon className="w-4 h-4" />, run: go("recap", get("nav.recap", "Bilan")) },
      { id: "settings", group: G, label: get("nav.settings", "Réglages"), icon: <GearIcon className="w-4 h-4" />, run: go("settings") },
      {
        id: "help",
        group: G,
        label: get("app.shortcutsTitle", "Raccourcis"),
        icon: <HelpIcon className="w-4 h-4" />,
        run: () => {
          onHelp();
          onClose();
        },
      },

    ];
  }, [tabs, onClose, onHelp]);

  const resultActions = useMemo<Action[]>(() => {
    return results.map((r) => {
      if (r.kind === "course")
        return {
          id: `c${r.id}`,
          group: get("palette.groupCourses", "Cours"),
          label: r.title,
          hint: r.subtitle,
          icon: <BookIcon className="w-4 h-4" />,
          run: () => {
            tabs.open({ kind: "course", title: r.title, params: { courseId: r.id } });
            onClose();
          },
        };
      if (r.kind === "note")
        return {
          id: `n${r.id}`,
          group: get("palette.groupDocs", "Documents et notes"),
          label: r.title || get("notes.newTitle", "Note"),
          hint: get("documents.noteKind", "note"),
          icon: <NoteIcon className="w-4 h-4" />,
          run: () => {
            tabs.open({ kind: "note", title: r.title || get("notes.newTitle", "Note"), params: { noteId: r.id } });
            onClose();
          },
        };
      return {
        id: `f${r.id}`,
        group: get("palette.groupDocs", "Documents et notes"),
        label: r.title,
        hint: r.subtitle,
        snippet: r.snippet || undefined,
        icon: <DocIcon className="w-4 h-4" />,
        run: () => {
          if (r.file_kind === "board") tabs.open({ kind: "whiteboard", title: r.title, params: { fileId: r.id } });
          else if (r.file_kind === "pdf" || r.file_kind === "image")
            tabs.open({ kind: "pdf", title: r.title, params: { fileId: r.id, fileName: r.title } });
          else api.openFile(r.id);
          onClose();
        },
      };
    });
  }, [results, tabs, onClose]);

  const filtered = useMemo(() => {
    const wantCommands = scope === "all" || scope === "commands";
    const wantResults = scope !== "commands";

    if (!term.trim()) {
      return wantCommands ? baseActions.slice(0, 9) : [];
    }

    const scored: { a: Action; s: number }[] = [];
    if (wantCommands) {
      for (const a of baseActions) {
        const s = Math.max(
          scoreMatch(a.label, term),
          a.hint && norm(a.hint).includes(norm(term)) ? scoreMatch(a.hint, term) : 0
        );
        if (s > 0) scored.push({ a, s });
      }
    }
    if (wantResults) {
      for (const r of resultActions) {
        if (scope === "courses" && r.group !== get("palette.groupCourses", "Cours")) continue;
        if (scope === "documents" && r.group !== get("palette.groupDocs", "Documents et notes")) continue;
        if (scope === "reminders") continue; // reminders are not in the backend index yet
        const s = Math.max(scoreMatch(r.label, term), r.hint ? scoreMatch(r.hint, term) : 0) || 55;
        scored.push({ a: r, s });
      }
    }
    scored.sort((x, y) => y.s - x.s);
    return scored.slice(0, 18).map((x) => x.a);
  }, [baseActions, resultActions, term, scope]);

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSel(0), [query, results]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-sel="${sel}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[sel]?.run();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-palette flex items-start justify-center pt-[14vh] px-6">
          <motion.div
            className="eu-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-xl eu-panel shadow-pop overflow-hidden"
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          >
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line">
              {scope === "all" ? (
                <SearchIcon className="w-4 h-4 text-ink-faint shrink-0" />
              ) : (
                <span className="font-mono text-[14px] font-semibold text-accent shrink-0 w-4 text-center">
                  {query.charAt(0)}
                </span>
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder={get("palette.placeholder", "Rechercher un cours, un document, une note…")}
                className="eu-cmdk-input flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-faint"
              />
            </div>
            <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-1.5">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center eu-t-body text-ink-muted">
                  {get("documents.nothingHere", "Aucun résultat")}
                </p>
              ) : (
                filtered.map((a, i) => {
                  const prev = filtered[i - 1];
                  const showGroup = !prev || prev.group !== a.group;
                  return (
                    <div key={a.id}>
                      {showGroup && <p className="eu-t-label px-2.5 pt-2.5 pb-1.5">{a.group}</p>}
                      <button
                        data-sel={i}
                        onClick={a.run}
                        onMouseEnter={() => setSel(i)}
                        className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded text-left transition-colors duration-fast ${
                          i === sel ? "bg-ink text-panel" : "text-ink hover:bg-panel-alt"
                        }`}
                      >
                        <span className={`mt-px shrink-0 ${i === sel ? "opacity-90" : "text-ink-faint"}`}>
                          {a.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="eu-t-body block truncate">{a.label}</span>
                          {a.snippet && (
                            <span
                              className={`block eu-t-meta truncate ${i === sel ? "text-panel/70" : ""}`}
                            >
                              {a.snippet}
                            </span>
                          )}
                        </span>
                        {a.hint && (
                          <span
                            className={`eu-t-label normal-case tracking-normal shrink-0 mt-0.5 ${
                              i === sel ? "text-panel/70" : ""
                            }`}
                          >
                            {a.hint}
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center gap-3 px-3 py-1.5 border-t border-line bg-panel-alt">
              {PREFIXES.map((p) => (
                <span key={p.key} className="eu-t-label normal-case tracking-normal flex items-center gap-1">
                  <span className="eu-kbd">{p.key}</span>
                  {p.label}
                </span>
              ))}
              <span className="flex-1" />
              <span className="eu-t-label normal-case tracking-normal flex items-center gap-1">
                <span className="eu-kbd">↵</span>
                {get("palette.open", "ouvrir")}
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
