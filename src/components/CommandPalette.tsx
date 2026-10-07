import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "../ui/Dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { q } from "../api/queries";
import { api, type QuickLink, type SearchResult } from "../lib/api";
import { tabs } from "../stores/tabs";
import { openFile } from "../lib/files";
import { timer } from "../stores/timer";
import { get, tr } from "../lib/i18n";
import { aliasesOf, rankPaletteItems } from "../lib/palette-search";
import { useAppearance } from "../lib/theme";
import { useToast } from "./ui";
import { errorMessage } from "../lib/errors";
import { logged, reportError } from "../lib/report";

import {
  BellIcon,
  BookIcon,
  ClockIcon,
  CoffeeIcon,
  CodeIcon,
  DocIcon,
  GearIcon,
  HelpIcon,
  HomeIcon,
  LinkIcon,
  NoteIcon,
  PenIcon,
  PlusIcon,
  ProjectorIcon,
  SearchIcon,
  SparkleIcon,
  ToolIcon,
} from "./icons";

const NO_LINKS: QuickLink[] = [];

interface Action {
  id: string;
  label: string;
  hint?: string;
  aliases?: string[];
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
  { key: ">", label: tr("palette.prefixCommands") },
  { key: "@", label: tr("palette.prefixCourses") },
  { key: "#", label: tr("palette.prefixDocs") },
  { key: "!", label: tr("palette.prefixReminders") },
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

function cmdAliases(key: string): string[] {
  return aliasesOf(get(`palette.aliases.${key}`, ""));
}

function CommandPalette({
  open,
  onClose,
  onHelp,
}: {
  open: boolean;
  onClose: () => void;
  onHelp: () => void;
}) {
  const toast = useToast();
  const { projection, toggleProjection } = useAppearance();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const queryClient = useQueryClient();
  const links = useQuery({ ...q.links(), enabled: open }).data ?? NO_LINKS;
  const keepAwake = useQuery({ ...q.keepAwake(), enabled: open }).data ?? null;
  const setKeepAwake = (on: boolean) => queryClient.setQueryData(q.keepAwake().queryKey, on);
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
        .catch(logged("palette.search"));
    }, 130);
    return () => clearTimeout(h);
  }, [query]);

  const { scope, term } = scopeOf(query);

  const baseActions = useMemo<Action[]>(() => {
    const go = (kind: any, title?: string, params?: any) => () => {
      tabs.open({ kind, title, params });
      onClose();
    };
    const G = tr("palette.groupCommands");
    const timerTitle = tr("tools.timerTitle");
    const startTimer = (minutes: number) => () => {
      timer.start(minutes);
      onClose();
    };

    const actions: Action[] = [
      {
        id: "dash",
        group: G,
        label: tr("nav.dashboard"),
        aliases: cmdAliases("dashboard"),
        icon: <HomeIcon className="w-4 h-4" />,
        run: go("dashboard"),
      },
      {
        id: "courses",
        group: G,
        label: tr("nav.courses"),
        aliases: cmdAliases("courses"),
        icon: <BookIcon className="w-4 h-4" />,
        run: go("courses"),
      },
      {
        id: "docs",
        group: G,
        label: tr("nav.documents"),
        aliases: cmdAliases("documents"),
        icon: <DocIcon className="w-4 h-4" />,
        run: go("documents"),
      },
      {
        id: "tools",
        group: G,
        label: tr("nav.tools"),
        aliases: cmdAliases("tools"),
        icon: <ToolIcon className="w-4 h-4" />,
        run: go("tools"),
      },
      {
        id: "python",
        group: G,
        label: tr("nav.python"),
        aliases: cmdAliases("python"),
        icon: <CodeIcon className="w-4 h-4" />,
        run: go("python"),
      },
      {
        id: "reminders",
        group: G,
        label: tr("nav.reminders"),
        aliases: cmdAliases("reminders"),
        icon: <BellIcon className="w-4 h-4" />,
        run: go("reminders"),
      },
      {
        id: "board",
        group: G,
        label: tr("nav.whiteboard"),
        hint: tr("palette.new"),
        aliases: cmdAliases("whiteboard"),
        icon: <PenIcon className="w-4 h-4" />,
        run: go("whiteboard", tr("app.tabWhiteboard"), { isNew: true }),
      },
      {
        id: "note",
        group: G,
        label: tr("common.newNote"),
        hint: tr("palette.new"),
        aliases: cmdAliases("note"),
        icon: <NoteIcon className="w-4 h-4" />,
        run: go("note", tr("common.newNote"), { isNew: true }),
      },
      {
        id: "recap",
        group: G,
        label: tr("nav.recap"),
        aliases: cmdAliases("recap"),
        icon: <SparkleIcon className="w-4 h-4" />,
        run: go("recap", tr("nav.recap")),
      },
      {
        id: "settings",
        group: G,
        label: tr("nav.settings"),
        aliases: cmdAliases("settings"),
        icon: <GearIcon className="w-4 h-4" />,
        run: go("settings"),
      },
      {
        id: "help",
        group: G,
        label: tr("app.shortcutsTitle"),
        aliases: cmdAliases("help"),
        icon: <HelpIcon className="w-4 h-4" />,
        run: () => {
          onHelp();
          onClose();
        },
      },
      {
        id: "keepawake",
        group: G,
        label: tr("tools.keepAwake"),
        hint: keepAwake == null ? undefined : keepAwake ? tr("tools.keepAwakeOn") : tr("tools.keepAwakeOff"),
        aliases: cmdAliases("keepAwake"),
        icon: <CoffeeIcon className="w-4 h-4" />,
        run: () => {
          void (async () => {
            try {
              const current = keepAwake ?? (await api.keepAwakeStatus());
              const next = await api.setKeepAwake(!current);
              setKeepAwake(next);
              window.dispatchEvent(new CustomEvent("eu:keepawake-changed"));
              toast(next ? tr("tools.keepAwakeOn") : tr("tools.keepAwakeOff"), next ? "success" : "info");
            } catch (err) {
              reportError("palette.keepAwake", err);
              toast(errorMessage(err, tr("messages.genericError")), "error");
            }
            onClose();
          })();
        },
      },
      {
        id: "projection",
        group: G,
        label: tr("appearance.projection"),
        hint: projection ? tr("common.active") : tr("common.enable"),
        aliases: cmdAliases("projection"),
        icon: <ProjectorIcon className="w-4 h-4" />,
        run: () => {
          toggleProjection();
          onClose();
        },
      },
      {
        id: "capture",
        group: G,
        label: tr("capture.title"),
        aliases: cmdAliases("capture"),
        icon: <PlusIcon className="w-4 h-4" />,
        run: () => {
          onClose();
          window.dispatchEvent(new CustomEvent("eu:capture-open"));
        },
      },
    ];

    for (const minutes of [5, 10, 15, 30]) {
      actions.push({
        id: `timer-${minutes}`,
        group: G,
        label: `${timerTitle} · ${tr("tools.timerMinutes", { count: minutes })}`,
        aliases: [...cmdAliases("timer"), String(minutes), `${minutes}min`],
        icon: <ClockIcon className="w-4 h-4" />,
        run: startTimer(minutes),
      });
    }

    const linkGroup = tr("palette.groupLinks");
    actions.push({
      id: "links-manage",
      group: linkGroup,
      label: tr("palette.manageLinks"),
      aliases: cmdAliases("links"),
      icon: <LinkIcon className="w-4 h-4" />,
      run: go("tools"),
    });
    for (const link of links) {
      actions.push({
        id: `link-${link.id}`,
        group: linkGroup,
        label: link.label,
        hint: link.url,
        aliases: [...cmdAliases("links"), link.url],
        icon: <LinkIcon className="w-4 h-4" />,
        run: () => {
          api.openUrl(link.url).catch((err) => {
            reportError("palette.openUrl", err);
            toast(errorMessage(err, tr("messages.openUrlError")), "error");
          });
          onClose();
        },
      });
    }

    return actions;
  }, [onClose, onHelp, toast, projection, toggleProjection, keepAwake, links]);

  const resultActions = useMemo<Action[]>(() => {
    return results.map((r) => {
      if (r.kind === "course")
        return {
          id: `c${r.id}`,
          group: tr("palette.groupCourses"),
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
          group: tr("palette.groupDocs"),
          label: r.title || tr("notes.newTitle"),
          hint: tr("documents.noteKind"),
          icon: <NoteIcon className="w-4 h-4" />,
          run: () => {
            tabs.open({
              kind: "note",
              title: r.title || tr("notes.newTitle"),
              params: { noteId: r.id },
            });
            onClose();
          },
        };
      return {
        id: `f${r.id}`,
        group: tr("palette.groupDocs"),
        label: r.title,
        hint: r.subtitle,
        snippet: r.snippet || undefined,
        icon: <DocIcon className="w-4 h-4" />,
        run: () => {
          openFile({ id: r.id, name: r.title, kind: r.file_kind ?? "file" });
          onClose();
        },
      };
    });
  }, [results, onClose]);

  const filtered = useMemo(() => {
    const wantCommands = scope === "all" || scope === "commands";
    const wantResults = scope !== "commands";

    if (!term.trim()) {
      return wantCommands
        ? baseActions.filter((a) => a.group === tr("palette.groupCommands")).slice(0, 9)
        : [];
    }

    const commands = wantCommands ? rankPaletteItems(baseActions, term) : [];
    const scopedResults = wantResults
      ? resultActions.filter((r) => {
          if (scope === "courses") return r.group === tr("palette.groupCourses");
          if (scope === "documents") return r.group === tr("palette.groupDocs");
          if (scope === "reminders") return false;
          return true;
        })
      : [];

    const seen = new Set<string>();
    const out: Action[] = [];
    for (const a of [...commands, ...scopedResults]) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
    return out.slice(0, 18);
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
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      label={tr("shortcuts.palette")}
      className="max-w-xl eu-dialog-top overflow-hidden"
    >
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line">
        {scope === "all" ? (
          <SearchIcon className="w-4 h-4 text-ink-faint shrink-0" />
        ) : (
          <span className="font-mono text-body font-semibold text-accent shrink-0 w-4 text-center">
            {query.charAt(0)}
          </span>
        )}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder={tr("palette.placeholder")}
          className="eu-cmdk-input flex-1 bg-transparent text-body text-ink placeholder:text-ink-faint"
        />
      </div>
      <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-1.5">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center eu-t-body text-ink-muted">{tr("documents.nothingHere")}</p>
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
                  className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded text-left text-ink transition-colors duration-fast ${
                    i === sel ? "bg-pressed" : ""
                  }`}
                >
                  <span className={`mt-px shrink-0 ${i === sel ? "text-ink" : "text-ink-faint"}`}>
                    {a.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="eu-t-body block truncate">{a.label}</span>
                    {a.snippet && <span className="block eu-t-meta truncate">{a.snippet}</span>}
                  </span>
                  {a.hint && <span className="eu-t-caption shrink-0 mt-0.5">{a.hint}</span>}
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-3 px-3 py-1.5 border-t border-line bg-panel-alt">
        {PREFIXES.map((p) => (
          <span key={p.key} className="eu-t-caption flex items-center gap-1">
            <span className="eu-kbd">{p.key}</span>
            {p.label}
          </span>
        ))}
        <span className="flex-1" />
        <span className="eu-t-caption flex items-center gap-1">
          <span className="eu-kbd">↵</span>
          {tr("palette.open")}
        </span>
      </div>
    </Dialog>
  );
}

export default memo(CommandPalette);
