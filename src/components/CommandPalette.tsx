import { memo, useEffect, useMemo, useRef, useState } from "react";
import { changed } from "../api/client";
import { Dialog } from "../ui/Dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { q } from "../api/queries";
import { api, type FileItem, type QuickLink, type SearchResult } from "../lib/api";
import { tabs } from "../stores/tabs";
import { openFile } from "../lib/files";
import { timer } from "../stores/timer";
import { scene } from "../stores/scene";
import { get, tr } from "../lib/i18n";
import { aliasesOf, rankPaletteItems } from "../lib/palette-search";
import { useAppearance } from "../lib/theme";
import { useToast } from "./ui";
import { errorMessage } from "../lib/errors";
import { reportError } from "../lib/report";
import { Highlight } from "../ui/Highlight";
import { Kbd } from "../ui/Kbd";
import { keysOf } from "../lib/keymap";

import {
  Bell,
  BookOpen,
  CircleHelp,
  Clock,
  CodeXml,
  Coffee,
  FileText,
  House,
  Link,
  NotebookPen,
  PenLine,
  Plus,
  Projector,
  Search as SearchGlyph,
  Settings,
  Sparkles,
  Wrench,
} from "lucide-react";
import { Icon } from "../ui/Icon";

const NO_LINKS: QuickLink[] = [];
const NO_RESULTS: SearchResult[] = [];
const NO_RECENT: FileItem[] = [];

interface Action {
  id: string;
  label: string;
  hint?: string;
  aliases?: string[];
  /** Search-result excerpt (PDF content matches). */
  snippet?: string;
  group: string;
  icon: React.ReactNode;
  /** Its keyboard shortcut (lib/keymap.ts), shown on the right. */
  keys?: string;
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
  onCapture,
}: {
  open: boolean;
  onClose: () => void;
  onHelp: () => void;
  /** Opens quick capture (the palette closes first). */
  onCapture: () => void;
}) {
  const toast = useToast();
  const { projection, toggleProjection } = useAppearance();

  const [query, setQuery] = useState("");
  const queryClient = useQueryClient();
  const links = useQuery({ ...q.links(), enabled: open }).data ?? NO_LINKS;
  const recent = useQuery({ ...q.recentFiles(5), enabled: open }).data ?? NO_RECENT;
  const keepAwake = useQuery({ ...q.keepAwake(), enabled: open }).data ?? null;
  const setKeepAwake = (on: boolean) => queryClient.setQueryData(q.keepAwake().queryKey, on);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // A fresh palette each time it opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setSel(0);
    }
  }
  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const { scope, term } = scopeOf(query);

  // Search courses, files (names and contents) and notes once typing pauses.
  // Each term is its own query: a slow answer for « fo » cannot replace the
  // one for « fonc ».
  const [searchTerm, setSearchTerm] = useState("");
  useEffect(() => {
    const h = window.setTimeout(() => setSearchTerm(term.trim()), 130);
    return () => window.clearTimeout(h);
  }, [term]);
  const searching = open && scope !== "commands" && searchTerm.length >= 2;
  const search = useQuery({
    queryKey: ["search", searchTerm],
    queryFn: () => api.globalSearch(searchTerm),
    enabled: searching,
    staleTime: 30_000,
  });
  useEffect(() => {
    if (search.error) reportError("palette.search", search.error);
  }, [search.error]);
  const results = (searching && search.data) || NO_RESULTS;

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
        icon: <Icon icon={House} size={16} />,
        run: go("dashboard"),
      },
      {
        id: "courses",
        group: G,
        label: tr("nav.courses"),
        aliases: cmdAliases("courses"),
        icon: <Icon icon={BookOpen} size={16} />,
        run: go("courses"),
      },
      {
        id: "docs",
        group: G,
        label: tr("nav.documents"),
        aliases: cmdAliases("documents"),
        icon: <Icon icon={FileText} size={16} />,
        run: go("documents"),
      },
      {
        id: "tools",
        group: G,
        label: tr("nav.tools"),
        aliases: cmdAliases("tools"),
        icon: <Icon icon={Wrench} size={16} />,
        run: go("tools"),
      },
      {
        id: "python",
        group: G,
        label: tr("nav.python"),
        aliases: cmdAliases("python"),
        icon: <Icon icon={CodeXml} size={16} />,
        run: go("python"),
      },
      {
        id: "reminders",
        group: G,
        label: tr("nav.reminders"),
        aliases: cmdAliases("reminders"),
        icon: <Icon icon={Bell} size={16} />,
        run: go("reminders"),
      },
      {
        id: "board",
        group: G,
        label: tr("nav.whiteboard"),
        hint: tr("palette.new"),
        aliases: cmdAliases("whiteboard"),
        icon: <Icon icon={PenLine} size={16} />,
        run: go("whiteboard", tr("app.tabWhiteboard"), { isNew: true }),
      },
      {
        id: "note",
        group: G,
        label: tr("common.newNote"),
        hint: tr("palette.new"),
        aliases: cmdAliases("note"),
        icon: <Icon icon={NotebookPen} size={16} />,
        keys: keysOf("newNote"),
        run: go("note", tr("common.newNote"), { isNew: true }),
      },
      {
        id: "recap",
        group: G,
        label: tr("nav.recap"),
        aliases: cmdAliases("recap"),
        icon: <Icon icon={Sparkles} size={16} />,
        run: go("recap", tr("nav.recap")),
      },
      {
        id: "settings",
        group: G,
        label: tr("nav.settings"),
        aliases: cmdAliases("settings"),
        icon: <Icon icon={Settings} size={16} />,
        keys: keysOf("settings"),
        run: go("settings"),
      },
      {
        id: "help",
        group: G,
        label: tr("app.shortcutsTitle"),
        aliases: cmdAliases("help"),
        icon: <Icon icon={CircleHelp} size={16} />,
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
        icon: <Icon icon={Coffee} size={16} />,
        run: () => {
          void (async () => {
            try {
              const current = keepAwake ?? (await api.keepAwakeStatus());
              const next = await api.setKeepAwake(!current);
              setKeepAwake(next);
              changed("keepAwake");
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
        icon: <Icon icon={Projector} size={16} />,
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
        icon: <Icon icon={Plus} size={16} />,
        keys: keysOf("capture"),
        run: () => {
          onClose();
          onCapture();
        },
      },
    ];

    actions.push({
      id: "scene",
      group: G,
      label: tr("scene.open"),
      aliases: [...cmdAliases("timer"), "horloge", "plein écran", "projecteur"],
      icon: <Icon icon={Clock} size={16} />,
      keys: keysOf("scene"),
      run: () => {
        scene.open();
        onClose();
      },
    });

    for (const minutes of [5, 10, 15, 30]) {
      actions.push({
        id: `timer-${minutes}`,
        group: G,
        label: `${timerTitle} · ${tr("tools.timerMinutes", { count: minutes })}`,
        aliases: [...cmdAliases("timer"), String(minutes), `${minutes}min`],
        icon: <Icon icon={Clock} size={16} />,
        run: startTimer(minutes),
      });
    }

    const linkGroup = tr("palette.groupLinks");
    actions.push({
      id: "links-manage",
      group: linkGroup,
      label: tr("palette.manageLinks"),
      aliases: cmdAliases("links"),
      icon: <Icon icon={Link} size={16} />,
      run: go("tools"),
    });
    for (const link of links) {
      actions.push({
        id: `link-${link.id}`,
        group: linkGroup,
        label: link.label,
        hint: link.url,
        aliases: [...cmdAliases("links"), link.url],
        icon: <Icon icon={Link} size={16} />,
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
          icon: <Icon icon={BookOpen} size={16} />,
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
          icon: <Icon icon={NotebookPen} size={16} />,
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
        icon: <Icon icon={FileText} size={16} />,
        run: () => {
          openFile({ id: r.id, name: r.title, kind: r.file_kind ?? "file" });
          onClose();
        },
      };
    });
  }, [results, onClose]);

  // Before anything is typed: the documents opened last, to go back to them.
  const recentActions = useMemo<Action[]>(
    () =>
      recent.map((f) => ({
        id: `r${f.id}`,
        group: tr("palette.groupRecent"),
        label: f.name,
        hint: tr("palette.recentHint"),
        icon: <Icon icon={FileText} size={16} />,
        run: () => {
          openFile({ ...f, courseId: f.course_id });
          onClose();
        },
      })),
    [recent, onClose],
  );

  const filtered = useMemo(() => {
    const wantCommands = scope === "all" || scope === "commands";
    const wantResults = scope !== "commands";

    if (!term.trim()) {
      const commands = wantCommands
        ? baseActions.filter((a) => a.group === tr("palette.groupCommands")).slice(0, 9)
        : [];
      const recents = scope === "all" || scope === "documents" ? recentActions : [];
      return [...recents, ...commands];
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
  }, [baseActions, resultActions, recentActions, term, scope]);

  const listRef = useRef<HTMLDivElement>(null);

  // The cursor goes back to the top when the list changes.
  const [listFor, setListFor] = useState({ query, results });
  if (listFor.query !== query || listFor.results !== results) {
    setListFor({ query, results });
    setSel(0);
  }

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
          <Icon icon={SearchGlyph} size={16} className="text-ink-faint shrink-0" />
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
                    {a.snippet && <Highlight text={a.snippet} className="block eu-t-meta truncate" />}
                  </span>
                  {a.keys ? (
                    <Kbd keys={a.keys} className="shrink-0 mt-0.5" />
                  ) : (
                    a.hint && (
                      <span className={`eu-t-caption shrink-0 mt-0.5 ${i === sel ? "text-ink-muted" : ""}`}>
                        {a.hint}
                      </span>
                    )
                  )}
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
