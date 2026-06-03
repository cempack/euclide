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
} from "./icons";

interface Action {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
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
    const h = setTimeout(() => {
      if (query.trim().length < 2) return setResults([]);
      api.globalSearch(query.trim()).then(setResults).catch(() => {});
    }, 130);
    return () => clearTimeout(h);
  }, [query]);

  const baseActions = useMemo<Action[]>(() => {
    const go = (kind: any, title?: string, params?: any) => () => {
      tabs.open({ kind, title, params });
      onClose();
    };
    return [
      { id: "dash", label: get("nav.dashboard", "Tableau de bord"), icon: <HomeIcon className="w-4 h-4" />, run: go("dashboard") },
      { id: "courses", label: get("nav.courses", "Cours"), icon: <BookIcon className="w-4 h-4" />, run: go("courses") },
      { id: "docs", label: get("nav.documents", "Documents"), icon: <DocIcon className="w-4 h-4" />, run: go("documents") },
      { id: "tools", label: get("nav.tools", "Outils"), icon: <ToolIcon className="w-4 h-4" />, run: go("tools") },
      { id: "python", label: get("nav.python", "Python"), icon: <CodeIcon className="w-4 h-4" />, run: go("python") },
      { id: "reminders", label: get("nav.reminders", "Rappels"), icon: <BellIcon className="w-4 h-4" />, run: go("reminders") },
      {
        id: "board",
        label: get("nav.whiteboard", "Tableau blanc"),
        hint: "nouveau",
        icon: <PenIcon className="w-4 h-4" />,
        run: go("whiteboard", get("app.tabWhiteboard", "Tableau"), { isNew: true }),
      },
      {
        id: "note",
        label: get("common.newNote", "Nouvelle note"),
        hint: "nouveau",
        icon: <NoteIcon className="w-4 h-4" />,
        run: go("note", get("common.newNote", "Nouvelle note"), { isNew: true }),
      },
      { id: "settings", label: get("nav.settings", "Réglages"), icon: <GearIcon className="w-4 h-4" />, run: go("settings") },
      {
        id: "help",
        label: get("app.shortcutsTitle", "Raccourcis"),
        icon: <SearchIcon className="w-4 h-4" />,
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
          label: r.title,
          hint: "cours",
          icon: <span className="text-base leading-none">{r.subtitle}</span>,
          run: () => {
            tabs.open({ kind: "course", title: r.title, params: { courseId: r.id } });
            onClose();
          },
        };
      if (r.kind === "note")
        return {
          id: `n${r.id}`,
          label: r.title || get("notes.newTitle", "Note"),
          hint: "note",
          icon: <NoteIcon className="w-4 h-4" />,
          run: () => {
            if (r.course_id) tabs.open({ kind: "course", params: { courseId: r.course_id } });
            else tabs.open({ kind: "courses" });
            onClose();
          },
        };
      return {
        id: `f${r.id}`,
        label: r.title,
        hint: r.subtitle,
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
    if (!query.trim()) return baseActions.slice(0, 8);
    // score + rank base actions + backend results for better precision + typo tolerance
    const scored: { a: Action; s: number }[] = [];
    for (const a of baseActions) {
      const s = Math.max(scoreMatch(a.label, query), a.hint ? scoreMatch(a.hint, query) : 0);
      if (s > 0) scored.push({ a, s });
    }
    for (const r of resultActions) {
      // backend results (now fuzzy on names) get a base score so they rank well
      const s = Math.max(scoreMatch(r.label, query), r.hint ? scoreMatch(r.hint, query) : 0) || 55;
      scored.push({ a: r, s });
    }
    scored.sort((x, y) => y.s - x.s);
    return scored.slice(0, 16).map((x) => x.a);
  }, [baseActions, resultActions, query]);

  useEffect(() => setSel(0), [query, results]);

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
        <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[14vh] px-6">
          <motion.div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            onClick={onClose}
          />
          <motion.div
            className="relative w-full max-w-xl new-card overflow-hidden border-hairline"
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          >
            <div className="flex items-center gap-3 px-4 border-b border-hairline">
              <SearchIcon className="w-5 h-5 text-body-mute shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder={get("documents.searchPlaceholder", "Rechercher...") + " (cours, docs, notes)"}
                className="flex-1 bg-transparent py-3.5 text-[15px] outline-none placeholder:text-body-mute"
              />
            </div>
            <div className="max-h-[46vh] overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-body-mute">{get("documents.nothingHere", "Aucun résultat")}</p>
              ) : (
                filtered.map((a, i) => (
                  <button
                    key={a.id}
                    onClick={a.run}
                    onMouseEnter={() => setSel(i)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-100 active:bg-surface-container ${
                      i === sel ? "bg-surface-container text-tui-accent" : "text-on-surface hover:bg-surface-container/60"
                    }`}
                  >
                    <span className={i === sel ? "text-tui-accent" : "text-body-mute"}>{a.icon}</span>
                    <span className="flex-1 truncate text-sm font-medium">{a.label}</span>
                    {a.hint && <span className="text-[11px] text-body-mute shrink-0">{a.hint}</span>}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
