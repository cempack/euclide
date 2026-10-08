import { memo, useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, List } from "lucide-react";
import { api, thumbUrl, type Course, type FileItem, type Note, type SearchResult } from "../lib/api";
import { tabs } from "../stores/tabs";
import { useImportFiles } from "../shell/useImportFiles";
import { openFile } from "../lib/files";
import { tr, trn } from "../lib/i18n";
import { errorMessage } from "../lib/errors";
import { logged, reportError } from "../lib/report";
import { fileKindLabel, humanSize, relativeTime } from "../lib/format";
import { EmptyState, Modal, useToast, useConfirm } from "../components/ui";
import { Field, MetaDot, PageHeader, Panel } from "../components/layout";
import { courseVisual } from "../lib/color";
import { useAppearance } from "../lib/theme";
import { useSetting } from "../api/hooks";
import { q } from "../api/queries";
import { Icon } from "../ui/Icon";
import { Highlight } from "../ui/Highlight";
import { tip } from "../ui/Tooltip";
import {
  DocIcon,
  FileKindIcon,
  NoteIcon,
  PenIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "../components/icons";

/** Stable empty lists while a query loads, so memos hold. */
const NO_FILES: FileItem[] = [];
const NO_NOTES: Note[] = [];
const NO_COURSES: Course[] = [];
const NO_HITS: SearchResult[] = [];

type Filter = { kind: "all" } | { kind: "type"; value: string } | { kind: "class"; courseId: number };
type View = "list" | "grid";

function filterFromHint(hint: string | undefined): Filter {
  return hint === "note" || hint === "pdf" || hint === "image" || hint === "board"
    ? { kind: "type", value: hint }
    : { kind: "all" };
}

type DocItem = { t: "file"; f: FileItem; date: string } | { t: "note"; n: Note; date: string };

const TYPE_CHIPS = [
  { value: "pdf", label: "PDF" },
  { value: "image", label: "Images" },
  { value: "board", label: "Tableaux" },
  { value: "note", label: "Notes" },
];

/** Recent first, then month by month: how a teacher remembers documents. */
function getTimeBucket(iso: string): string {
  if (!iso) return "Sans date";
  const normalized = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return "Sans date";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - itemDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "Récents";
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Hier";
  if (diffDays <= 7) return "Cette semaine";

  const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (monthsAgo === 0) return "Ce mois";
  if (monthsAgo === 1) return "Mois dernier";
  const month = d.toLocaleDateString("fr-FR", { month: "long" });
  return `${month.charAt(0).toUpperCase() + month.slice(1)} ${d.getFullYear()}`;
}

/** Common LaTeX, as text: enough for an excerpt to read « f(x) = x² sur ℝ ». */
const TEX: [RegExp, string | ((match: string, digit: string) => string)][] = [
  [/\\mathbb\{R\}/g, "ℝ"],
  [/\\mathbb\{N\}/g, "ℕ"],
  [/\\mathbb\{Z\}/g, "ℤ"],
  [/\\mathbb\{Q\}/g, "ℚ"],
  [/\\infty/g, "∞"],
  [/\\times/g, "×"],
  [/\\leq?/g, "≤"],
  [/\\geq?/g, "≥"],
  [/\\neq/g, "≠"],
  [/\\pi/g, "π"],
  [/\\sqrt/g, "√"],
  [/\\int/g, "∫"],
  [/\\sum/g, "Σ"],
  [/\\[,;:! ]/g, " "],
  [/\^\{?(\d)\}?/g, (_, d: string) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)]],
  [/_\{?(\d)\}?/g, (_, d: string) => "₀₁₂₃₄₅₆₇₈₉"[Number(d)]],
  [/\\[a-zA-Z]+/g, ""],
  [/[{}]/g, ""],
];

/** A note's text without Markdown signs, formulas written out. */
function plainText(body: string): string {
  return body
    .replace(/\$\$?([^$]*)\$\$?/g, (_, tex: string) =>
      TEX.reduce((t, [re, to]) => t.replace(re, to as (match: string, digit: string) => string), tex),
    )
    .replace(/[#>*_`~|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const excerpt = (body: string) => plainText(body).slice(0, 180);

/** Bumped when previews were drawn (features/previews): grid images reload. */
let thumbsVersion = 0;
function subscribeThumbs(onChange: () => void) {
  const handler = () => {
    thumbsVersion += 1;
    onChange();
  };
  window.addEventListener("eu:thumbnails-changed", handler);
  return () => window.removeEventListener("eu:thumbnails-changed", handler);
}
const useThumbsVersion = () => useSyncExternalStore(subscribeThumbs, () => thumbsVersion);

type ItemActions = {
  open: (it: DocItem) => void;
  rename: (it: DocItem) => void;
  remove: (it: DocItem) => void;
};

function itemTitle(it: DocItem) {
  return it.t === "file" ? it.f.name : it.n.title || tr("documents.noteFallbackTitle");
}

function ItemIcon({ it }: { it: DocItem }) {
  return it.t === "file" ? (
    <FileKindIcon kind={it.f.kind} className="w-4 h-4" />
  ) : (
    <NoteIcon className="w-4 h-4" />
  );
}

/** Rename and delete, on hover or focus; they never open the document. */
function RowTools({ it, actions }: { it: DocItem; actions: ItemActions }) {
  const title = itemTitle(it);
  return (
    <span className="eu-row-actions flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => actions.rename(it)}
        aria-label={`${tr("common.rename")} — ${title}`}
        {...tip(tr("common.rename"), "F2")}
        className="eu-btn-quiet eu-btn-icon eu-btn-sm"
      >
        <PenIcon className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => actions.remove(it)}
        aria-label={`${tr("common.delete")} — ${title}`}
        {...tip(tr("common.delete"), "Suppr")}
        className="eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
      >
        <TrashIcon className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}

const DocRow = memo(function DocRow({
  it,
  index,
  current,
  meta,
  accent,
  actions,
}: {
  it: DocItem;
  index: number;
  current: boolean;
  meta: string;
  accent?: string;
  actions: ItemActions;
}) {
  return (
    <div
      role="option"
      aria-selected={current}
      tabIndex={current ? 0 : -1}
      data-doc-index={index}
      onClick={() => actions.open(it)}
      className="eu-doc-row eu-row-hover group eu-focus-inset"
    >
      <span className="shrink-0" style={accent ? { color: accent } : undefined}>
        <ItemIcon it={it} />
      </span>
      <span className="eu-t-body text-ink truncate flex-1 min-w-0">{itemTitle(it)}</span>
      <span className="eu-t-caption shrink-0 hidden @xl:block">{meta}</span>
      <RowTools it={it} actions={actions} />
    </div>
  );
});

const DocCard = memo(function DocCard({
  it,
  index,
  current,
  meta,
  accent,
  actions,
  version,
}: {
  it: DocItem;
  index: number;
  current: boolean;
  meta: string;
  accent?: string;
  actions: ItemActions;
  version: number;
}) {
  const [noPreview, setNoPreview] = useState(false);
  const previewable =
    it.t === "file" && (it.f.kind === "pdf" || it.f.kind === "image" || it.f.kind === "board");
  return (
    <div
      role="option"
      aria-selected={current}
      tabIndex={current ? 0 : -1}
      data-doc-index={index}
      onClick={() => actions.open(it)}
      className="eu-doc-card group"
    >
      <div className="eu-doc-card-preview relative">
        <span className="eu-doc-card-tools">
          <RowTools it={it} actions={actions} />
        </span>
        {previewable && !noPreview ? (
          <img
            src={`${thumbUrl(it.f.id)}?v=${version}`}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setNoPreview(true)}
            className="absolute inset-0 w-full h-full object-cover object-top"
          />
        ) : it.t === "note" && it.n.body?.trim() ? (
          <p className="eu-doc-card-excerpt">{excerpt(it.n.body)}</p>
        ) : (
          <span className="text-ink-faint" style={accent ? { color: accent } : undefined}>
            {it.t === "file" ? (
              <FileKindIcon kind={it.f.kind} className="w-7 h-7" />
            ) : (
              <NoteIcon className="w-7 h-7" />
            )}
          </span>
        )}
      </div>
      <div className="flex items-start gap-2 px-2.5 py-2">
        <span className="shrink-0 mt-0.5" style={accent ? { color: accent } : undefined}>
          <ItemIcon it={it} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block eu-t-small font-medium text-ink truncate">{itemTitle(it)}</span>
          <span className="block eu-t-caption truncate">{meta}</span>
        </span>
      </div>
    </div>
  );
});

export default function Documents({
  filterHint,
  visible = true,
}: {
  filterHint?: string;
  visible?: boolean;
}) {
  const toast = useToast();
  const { pick: pickFiles } = useImportFiles();
  const importDocs = () => void pickFiles();
  const confirm = useConfirm();
  const live = { subscribed: visible };
  const docs = useQuery({ ...q.files(null), ...live }).data ?? NO_FILES;
  const notes = useQuery({ ...q.notes(), ...live }).data ?? NO_NOTES;
  const courses = useQuery({ ...q.courses(), ...live }).data ?? NO_COURSES;
  const [filter, setFilter] = useState<Filter>(() => filterFromHint(filterHint));
  const [search, setSearch] = useState("");
  const [savedView, setView] = useSetting("documents_view");
  const view: View = savedView === "grid" ? "grid" : "list";
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const version = useThumbsVersion();

  const [renameTarget, setRenameTarget] = useState<null | { it: DocItem; current: string }>(null);
  const [renameValue, setRenameValue] = useState("");

  // Opened with a type to show (« Documents » from a note…): start on it.
  const [hintFor, setHintFor] = useState(filterHint);
  if (hintFor !== filterHint) {
    setHintFor(filterHint);
    setFilter(filterFromHint(filterHint));
  }

  const courseName = useCallback((id: number | null) => courses.find((c) => c.id === id)?.name, [courses]);

  const removeItem = useCallback(
    async (it: DocItem) => {
      const name = itemTitle(it);
      const ok = await confirm.ask({
        title: it.t === "file" ? tr("documents.deleteFileTitle") : tr("notes.deleteConfirm"),
        message: tr("documents.deleteMessage", { name }),
        confirmLabel: tr("common.delete"),
        danger: true,
      });
      if (!ok) return;
      try {
        if (it.t === "file") {
          await api.deleteFile(it.f.id);
          tabs.closeFile(it.f.id);
          toast(tr("documents.toastDeleted"), "success");
        } else {
          await api.deleteNote(it.n.id);
          tabs
            .list()
            .filter((t) => t.kind === "note" && t.params.noteId === it.n.id)
            .forEach((t) => tabs.close(t.id, { discard: true }));
          toast(tr("notes.deleted"), "success");
        }
        window.dispatchEvent(new CustomEvent("eu:library-changed"));
      } catch (err) {
        reportError("documents.delete", err);
        toast(errorMessage(err, tr("messages.genericError")), "error");
      }
    },
    [confirm, toast],
  );

  const actions = useMemo<ItemActions>(
    () => ({
      open: (it) => {
        if (it.t === "file") openFile({ ...it.f, courseId: it.f.course_id });
        else tabs.open({ kind: "note", title: it.n.title || "Note", params: { noteId: it.n.id } });
      },
      rename: (it) => {
        const current = itemTitle(it);
        setRenameTarget({ it, current });
        setRenameValue(current);
      },
      remove: (it) => void removeItem(it),
    }),
    [removeItem],
  );

  const closeRename = useCallback(() => {
    setRenameTarget(null);
    setRenameValue("");
  }, []);

  const doRename = useCallback(async () => {
    if (!renameTarget) return;
    const newName = renameValue.trim();
    if (!newName || newName === renameTarget.current) {
      closeRename();
      return;
    }
    const { it } = renameTarget;
    try {
      if (it.t === "note") {
        await api.renameNote(it.n.id, newName);
        const tid = `note:${it.n.id}`;
        if (tabs.list().some((t) => t.id === tid)) tabs.rename(tid, newName);
        api.logEvent("note_rename", newName, null).catch(logged("documents.logRename"));
      } else {
        const updated = await api.renameFile(it.f.id, newName);
        const tid =
          updated.kind === "board"
            ? `whiteboard:${updated.id}`
            : updated.kind === "pdf" || updated.kind === "image"
              ? `pdf:${updated.id}`
              : null;
        if (tid && tabs.list().some((t) => t.id === tid)) {
          const patch =
            updated.kind === "pdf" || updated.kind === "image" ? { fileName: newName } : undefined;
          tabs.rename(tid, newName, patch);
        }
        api.logEvent("file_rename", newName, updated.course_id ?? null).catch(logged("documents.logRename"));
      }
      toast(tr("documents.toastRenamed", { name: newName }), "success");
      window.dispatchEvent(new CustomEvent("eu:library-changed"));
    } catch (err) {
      reportError("documents.rename", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    } finally {
      closeRename();
    }
  }, [renameTarget, renameValue, toast, closeRename]);

  // Everything, newest first; then the search on names, then the filter.
  const all = useMemo(
    (): DocItem[] =>
      [
        ...docs.map((f) => ({ t: "file" as const, f, date: f.added_at })),
        ...notes.map((n) => ({ t: "note" as const, n, date: n.updated_at })),
      ].sort((a, b) => b.date.localeCompare(a.date)),
    [docs, notes],
  );
  const term = search.trim().toLowerCase();
  const named = useMemo(
    () => (term ? all.filter((it) => itemTitle(it).toLowerCase().includes(term)) : all),
    [all, term],
  );
  const filtered = useMemo(() => {
    if (filter.kind === "type") {
      return filter.value === "note"
        ? named.filter((it) => it.t === "note")
        : named.filter((it) => it.t === "file" && it.f.kind === filter.value);
    }
    if (filter.kind === "class") {
      return named.filter((it) => (it.t === "file" ? it.f.course_id : it.n.course_id) === filter.courseId);
    }
    return named;
  }, [named, filter]);

  // How many each chip would show (after the search, before the filter).
  const counts = useMemo(() => {
    const byType: Record<string, number> = {};
    const byCourse: Record<number, number> = {};
    for (const it of named) {
      const type = it.t === "note" ? "note" : it.f.kind;
      byType[type] = (byType[type] ?? 0) + 1;
      const cid = it.t === "file" ? it.f.course_id : it.n.course_id;
      if (cid != null) byCourse[cid] = (byCourse[cid] ?? 0) + 1;
    }
    return { byType, byCourse };
  }, [named]);

  const grouped = useMemo(() => {
    const m = new Map<string, DocItem[]>();
    for (const it of filtered) {
      const b = getTimeBucket(it.date);
      if (!m.has(b)) m.set(b, []);
      m.get(b)!.push(it);
    }
    return Array.from(m.entries()).map(([label, its]) => ({ label, its }));
  }, [filtered]);

  // Words found inside documents and notes (search index), beyond names.
  const contentTerm = search.trim();
  const hits = useQuery({
    queryKey: ["search", contentTerm],
    queryFn: () => api.globalSearch(contentTerm),
    enabled: visible && contentTerm.length >= 2,
    staleTime: 30_000,
  }).data;
  const contentHits = (contentTerm.length >= 2 && hits ? hits : NO_HITS).filter(
    (h) => h.snippet && h.kind !== "course",
  );

  const { resolved } = useAppearance();
  const accentFor = useCallback(
    (courseId: number | null) => {
      const c = courses.find((x) => x.id === courseId);
      return c ? courseVisual(c.color, resolved === "dark").fg : undefined;
    },
    [courses, resolved],
  );
  const metaOf = (it: DocItem) =>
    it.t === "file"
      ? `${it.f.course_id ? `${courseName(it.f.course_id)} · ` : ""}${fileKindLabel(it.f.kind)} · ${humanSize(
          it.f.size,
        )} · ${relativeTime(it.f.added_at)}`
      : `${it.n.course_id ? `${courseName(it.n.course_id)} · ` : ""}${tr("documents.noteKind")} · ${relativeTime(
          it.n.updated_at,
        )}`;

  // The keyboard cursor stays on a document that is shown.
  const count = filtered.length;
  const at = Math.min(cursor, Math.max(0, count - 1));
  const move = (index: number) => {
    const next = Math.max(0, Math.min(count - 1, index));
    setCursor(next);
    listRef.current?.querySelector<HTMLElement>(`[data-doc-index="${next}"]`)?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!count) return;
    const list = listRef.current;
    const first = list?.querySelector<HTMLElement>("[data-doc-index]");
    const columns =
      view === "grid" && list && first ? Math.max(1, Math.round(list.clientWidth / first.offsetWidth)) : 1;
    const it = filtered[at];
    if (e.key === "ArrowDown") move(at + columns);
    else if (e.key === "ArrowUp") move(at - columns);
    else if (e.key === "ArrowRight" && view === "grid") move(at + 1);
    else if (e.key === "ArrowLeft" && view === "grid") move(at - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(count - 1);
    else if (e.key === "Enter") actions.open(it);
    else if (e.key === "F2") actions.rename(it);
    else if (e.key === "Delete") actions.remove(it);
    else return;
    e.preventDefault();
  };

  const chipProps = (active: boolean) => ({ className: "eu-filter", "aria-pressed": active });
  const totalSize = docs.reduce((sum, d) => sum + (d.size || 0), 0);
  // Positions in display order, for the keyboard (rows of every section).
  const sections = grouped.map((g, gi) => {
    const before = grouped.slice(0, gi).reduce((n, s) => n + s.its.length, 0);
    return { ...g, start: before };
  });

  return (
    <>
      <PageHeader
        title={tr("nav.documents")}
        meta={
          <>
            <span>{trn("documents.metaFiles", docs.length)}</span>
            <MetaDot />
            <span>{trn("documents.metaNotes", notes.length)}</span>
            {totalSize > 0 && (
              <>
                <MetaDot />
                <span>{humanSize(totalSize)}</span>
              </>
            )}
          </>
        }
        actions={
          <>
            <button
              onClick={() =>
                tabs.open({ kind: "note", title: tr("common.newNote"), params: { isNew: true } })
              }
              className="eu-btn-ghost eu-btn-sm"
            >
              <NoteIcon className="w-3.5 h-3.5" /> {tr("common.newNote")}
            </button>
            <button onClick={importDocs} className="eu-btn-primary eu-btn-sm">
              <PlusIcon className="w-3.5 h-3.5" /> {tr("common.importFiles")}
            </button>
          </>
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <input
              className="eu-input pl-8"
              placeholder={tr("documents.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && count) {
                  e.preventDefault();
                  move(0);
                }
              }}
              aria-label={tr("common.search")}
            />
            <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            {(search.trim() || filter.kind !== "all") && (
              <button
                onClick={() => {
                  setSearch("");
                  setFilter({ kind: "all" });
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 eu-btn-quiet eu-btn-sm"
              >
                {tr("common.clear")}
              </button>
            )}
          </div>
          <div className="eu-segment shrink-0" role="radiogroup" aria-label={tr("documents.viewLabel")}>
            {(
              [
                { id: "list", icon: List, label: tr("documents.viewList") },
                { id: "grid", icon: LayoutGrid, label: tr("documents.viewGrid") },
              ] as const
            ).map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={view === v.id}
                aria-pressed={view === v.id}
                aria-label={v.label}
                {...tip(v.label)}
                onClick={() => setView(v.id)}
              >
                <Icon icon={v.icon} size={16} />
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-1.5">
          <button onClick={() => setFilter({ kind: "all" })} {...chipProps(filter.kind === "all")}>
            {tr("documents.filterAll")}
            <span className="eu-filter-count">{named.length}</span>
          </button>
          {TYPE_CHIPS.map((c) => (
            <button
              key={c.value}
              onClick={() => setFilter({ kind: "type", value: c.value })}
              {...chipProps(filter.kind === "type" && filter.value === c.value)}
            >
              {c.label}
              <span className="eu-filter-count">{counts.byType[c.value] ?? 0}</span>
            </button>
          ))}
          {courses.length > 0 && <span className="w-px h-5 bg-line shrink-0 mx-1" />}
          {courses.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilter({ kind: "class", courseId: c.id })}
              {...chipProps(filter.kind === "class" && filter.courseId === c.id)}
            >
              <span
                className="w-2 h-2 rounded-sm shrink-0"
                style={{ background: courseVisual(c.color, resolved === "dark").fg }}
              />
              {c.name}
              <span className="eu-filter-count">{counts.byCourse[c.id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {contentHits.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="eu-t-label">{tr("documents.inContent", { count: contentHits.length })}</p>
          <Panel>
            <div className="eu-divide">
              {contentHits.map((h) => (
                <button
                  key={`${h.kind}${h.id}`}
                  type="button"
                  onClick={() => {
                    if (h.kind === "note")
                      tabs.open({ kind: "note", title: h.title, params: { noteId: h.id } });
                    else
                      openFile({
                        id: h.id,
                        name: h.title,
                        kind: h.file_kind || "file",
                        courseId: h.course_id,
                      });
                  }}
                  className="eu-row-hover w-full text-left flex-col !items-stretch gap-0.5"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    {h.kind === "note" ? (
                      <NoteIcon className="w-4 h-4 shrink-0" />
                    ) : (
                      <FileKindIcon kind={h.file_kind} className="w-4 h-4 shrink-0" />
                    )}
                    <span className="eu-t-body text-ink truncate">{h.title}</span>
                  </span>
                  <Highlight
                    text={plainText(h.snippet)}
                    className="block eu-t-small text-ink-muted pl-6.5 truncate"
                  />
                </button>
              ))}
            </div>
          </Panel>
        </section>
      )}

      {count === 0 ? (
        <Panel>
          <EmptyState
            icon={<DocIcon className="w-4 h-4" />}
            title={
              search.trim() || filter.kind !== "all" ? tr("documents.noResult") : tr("documents.nothingHere")
            }
            hint={
              search.trim() || filter.kind !== "all"
                ? tr("documents.noResultHint")
                : tr("documents.nothingHint")
            }
            action={
              <button onClick={importDocs} className="eu-btn-primary eu-btn-sm">
                <PlusIcon className="w-3.5 h-3.5" /> {tr("common.importFiles")}
              </button>
            }
          />
        </Panel>
      ) : (
        <div
          ref={listRef}
          role="listbox"
          aria-label={tr("nav.documents")}
          onKeyDown={onKeyDown}
          onFocus={(e) => {
            const i = Number((e.target as HTMLElement).dataset.docIndex);
            if (!Number.isNaN(i)) setCursor(i);
          }}
          className="flex flex-col gap-4"
        >
          {sections.map((g) => (
            <section
              key={g.label}
              className="eu-doc-group flex flex-col gap-2"
              role="group"
              aria-label={g.label}
            >
              <p className="eu-doc-group-head eu-t-label">
                {g.label} · {g.its.length}
              </p>
              {view === "list" ? (
                <Panel>
                  <div className="eu-divide">
                    {g.its.map((it, i) => (
                      <DocRow
                        key={it.t === "file" ? `f${it.f.id}` : `n${it.n.id}`}
                        it={it}
                        index={g.start + i}
                        current={g.start + i === at}
                        meta={metaOf(it)}
                        accent={accentFor(it.t === "file" ? it.f.course_id : it.n.course_id)}
                        actions={actions}
                      />
                    ))}
                  </div>
                </Panel>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
                  {g.its.map((it, i) => (
                    <DocCard
                      key={it.t === "file" ? `f${it.f.id}` : `n${it.n.id}`}
                      it={it}
                      index={g.start + i}
                      current={g.start + i === at}
                      meta={metaOf(it)}
                      accent={accentFor(it.t === "file" ? it.f.course_id : it.n.course_id)}
                      actions={actions}
                      version={version}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {/* Rename works for notes and for every file kind. */}
      {renameTarget && (
        <Modal open={!!renameTarget} onClose={closeRename} title={tr("common.rename")}>
          <div className="flex flex-col gap-4">
            <Field label={tr("documents.newName")}>
              <input
                autoFocus
                className="eu-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void doRename();
                  if (e.key === "Escape") closeRename();
                }}
                aria-label={tr("documents.newName")}
              />
            </Field>
            <div className="flex gap-2 justify-end">
              <button onClick={closeRename} className="eu-btn-ghost">
                {tr("common.cancel")}
              </button>
              <button
                onClick={() => void doRename()}
                className="eu-btn-primary"
                disabled={!renameValue.trim() || renameValue.trim() === renameTarget.current}
              >
                {tr("common.rename")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
