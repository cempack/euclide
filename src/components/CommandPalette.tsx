import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api, type SearchResult } from "../lib/api";
import { useTabs } from "../lib/tabs";

import {
  BookIcon,
  DocIcon,
  GearIcon,
  HomeIcon,

  NoteIcon,
  PenIcon,
  SearchIcon,
  SparkleIcon,
  ToolIcon,
} from "./icons";

interface Action {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

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
      { id: "dash", label: "Tableau de bord", icon: <HomeIcon className="w-4 h-4" />, run: go("dashboard") },
      { id: "courses", label: "Cours", icon: <BookIcon className="w-4 h-4" />, run: go("courses") },
      { id: "docs", label: "Documents", icon: <DocIcon className="w-4 h-4" />, run: go("documents") },
      { id: "tools", label: "Outils & scripts", icon: <ToolIcon className="w-4 h-4" />, run: go("tools") },
      { id: "recap", label: "Recap", icon: <SparkleIcon className="w-4 h-4" />, run: go("recap") },
      {
        id: "board",
        label: "Nouveau tableau blanc",
        hint: "creer",
        icon: <PenIcon className="w-4 h-4" />,
        run: go("whiteboard", "Nouveau tableau", { isNew: true }),
      },
      { id: "settings", label: "Reglages", icon: <GearIcon className="w-4 h-4" />, run: go("settings") },
      {
        id: "help",
        label: "Raccourcis clavier",
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
          label: r.title || "Note",
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
    const q = norm(query);
    const acts = baseActions.filter((a) => norm(a.label).includes(q) || (a.hint && norm(a.hint).includes(q)));
    return [...acts, ...resultActions].slice(0, 16);
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
        <motion.div
          className="fixed inset-0 z-[70] flex items-start justify-center pt-[14vh] px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="relative w-full max-w-xl eu-card overflow-hidden"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
          >
            <div className="flex items-center gap-3 px-4 border-b border-eu-border">
              <SearchIcon className="w-5 h-5 text-eu-muted shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder="Rechercher partout : cours, documents, notes, actions..."
                className="flex-1 bg-transparent py-3.5 text-[15px] outline-none placeholder:text-[#a8a8a8]"
              />
            </div>
            <div className="max-h-[46vh] overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center eu-sub">Aucun resultat</p>
              ) : (
                filtered.map((a, i) => (
                  <button
                    key={a.id}
                    onClick={a.run}
                    onMouseEnter={() => setSel(i)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                      i === sel ? "bg-[#fff8e0] text-[#fa520f]" : "text-eu-text hover:bg-[#fffaeb]"
                    }`}
                  >
                    <span className={i === sel ? "text-eu-accent" : "text-eu-muted"}>{a.icon}</span>
                    <span className="flex-1 truncate text-sm font-medium">{a.label}</span>
                    {a.hint && <span className="text-[11px] text-[#6a6a6a] shrink-0">{a.hint}</span>}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
