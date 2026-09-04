import { useEffect, useMemo, useState, useCallback, memo } from "react";
import { api, type Course, type FileItem, type Note } from "../lib/api";
import { useTabs } from "../lib/tabs";
import { t, fmt, get } from "../lib/i18n";
import { fileKindLabel, humanSize, relativeTime } from "../lib/format";
import { EmptyState, Modal, useToast, useConfirm } from "../components/ui";
import { Field, MetaDot, PageHeader, Panel } from "../components/layout";
import { courseVisual } from "../lib/color";
import { useAppearance } from "../lib/theme";
import { DocIcon, NoteIcon, PenIcon, PlusIcon, SearchIcon, FileKindIcon, TrashIcon } from "../components/icons";
import { useVisibleRefresh } from "../lib/visible-refresh";

const DOCUMENTS_EVENTS = ["eu:library-changed"] as const;

type Filter = { kind: "all" } | { kind: "type"; value: string } | { kind: "class"; courseId: number };

type DocItem = { t: "file"; f: FileItem; date: string } | { t: "note"; n: Note; date: string };

const TYPE_CHIPS = [
  { value: "pdf", label: "PDF", emoji: "" },
  { value: "image", label: "Images", emoji: "" },
  { value: "board", label: "Tableaux", emoji: "" },
  { value: "note", label: "Notes", emoji: "" },
];

// Pure helper: buckets dates for library organization (recency first, then calendar months)
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

  // Fall back to month + year for older items — this is the key "organize by time" improvement
  const month = d.toLocaleDateString("fr-FR", { month: "long" });
  return `${month.charAt(0).toUpperCase() + month.slice(1)} ${d.getFullYear()}`;
}

// Hoisted memoized rows (module scope so React.memo survives parent renders).
// Dense rows instead of the previous 4-column card grid: a document library is
// a list, and the cards forced the name to truncate at ~18 characters.

type RowProps = {
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  icon: React.ReactNode;
  title: string;
  meta: React.ReactNode;
  accent?: string;
};

function DocRow({ onOpen, onRename, onDelete, icon, title, meta, accent }: RowProps) {
  return (
    <div className="eu-row-hover group">
      <button onClick={onOpen} className="flex items-center gap-2.5 flex-1 min-w-0 text-left" title={title}>
        <span className="shrink-0" style={accent ? { color: accent } : undefined}>
          {icon}
        </span>
        <span className="eu-t-body text-ink truncate">{title}</span>
      </button>
      <span className="eu-t-label normal-case tracking-normal shrink-0 hidden sm:block">{meta}</span>
      <button
        onClick={onRename}
        aria-label={`${get("common.rename", "Renommer")} — ${title}`}
        title={get("common.rename", "Renommer")}
        className="eu-row-actions eu-btn-quiet eu-btn-icon eu-btn-sm"
      >
        <PenIcon className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onDelete}
        aria-label={`${get("common.delete", "Supprimer")} — ${title}`}
        title={get("common.delete", "Supprimer")}
        className="eu-row-actions eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
      >
        <TrashIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

const MemoFileItem = memo(function MemoFileItem({
  f,
  onOpen,
  onRename,
  onDelete,
  courseName,
  accent,
}: {
  f: FileItem;
  onOpen: (f: FileItem) => void;
  onRename: (f: FileItem) => void;
  onDelete: (f: FileItem) => void;
  courseName: (id: number | null) => string | undefined;
  accent?: string;
}) {
  return (
    <DocRow
      icon={<FileKindIcon kind={f.kind} className="w-4 h-4" />}
      accent={accent}
      title={f.name}
      meta={
        <>
          {f.course_id ? `${courseName(f.course_id)} · ` : ""}
          {fileKindLabel(f.kind)} · {humanSize(f.size)} · {relativeTime(f.added_at)}
        </>
      }
      onOpen={() => onOpen(f)}
      onRename={() => onRename(f)}
      onDelete={() => onDelete(f)}
    />
  );
});

const MemoNoteItem = memo(function MemoNoteItem({
  n,
  onOpen,
  onRename,
  onDelete,
  courseName,
  accent,
}: {
  n: Note;
  onOpen: (n: Note) => void;
  onRename: (n: Note) => void;
  onDelete: (n: Note) => void;
  courseName: (id: number | null) => string | undefined;
  accent?: string;
}) {
  const displayTitle = n.title || t.documents?.noteFallbackTitle || "Note";
  return (
    <DocRow
      icon={<NoteIcon className="w-4 h-4" />}
      accent={accent}
      title={displayTitle}
      meta={
        <>
          {n.course_id ? `${courseName(n.course_id)} · ` : ""}
          {get("documents.noteKind", "Note")} · {relativeTime(n.updated_at)}
        </>
      }
      onOpen={() => onOpen(n)}
      onRename={() => onRename(n)}
      onDelete={() => onDelete(n)}
    />
  );
});

export default function Documents({ filterHint, visible = true }: { filterHint?: string; visible?: boolean }) {
  const toast = useToast();
  const tabs = useTabs();
  const confirm = useConfirm();
  const [docs, setDocs] = useState<FileItem[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [search, setSearch] = useState("");

  // Rename state (supports notes + every file kind: pdf/image/board/doc/sheet/etc.)
  const [renameTarget, setRenameTarget] = useState<null | { kind: "file" | "note"; id: number; current: string }>(null);
  const [renameValue, setRenameValue] = useState("");

  const refresh = useCallback(() => {
    api.listFiles(null).then((f) => setDocs(Array.isArray(f) ? f : [])).catch(() => {});
    api.allNotes().then((n) => setNotes(Array.isArray(n) ? n : [])).catch(() => {});
    api.listCourses().then((c) => setCourses(Array.isArray(c) ? c : [])).catch(() => {});
  }, []);
  useVisibleRefresh(visible, refresh, DOCUMENTS_EVENTS);

  useEffect(() => {
    if (filterHint === "note" || filterHint === "pdf" || filterHint === "image" || filterHint === "board") {
      setFilter({ kind: "type", value: filterHint });
    } else {
      setFilter({ kind: "all" });
    }
  }, [filterHint]);

  const courseName = useCallback((id: number | null) => courses.find((c) => c.id === id)?.name, [courses]);

  const importDocs = async () => {
    try {
      toast(get("messages.importing", "Import…"), "info");
      const added = (await api.importFiles(null)) ?? [];
      if (added.length) {
        added.forEach((f) => api.logEvent("file_import", f.name, null));
        toast(fmt(t.documents?.toastImported || "{count} document(s) importé(s)", { count: added.length }), "success");
        await api.indexImportedPdfs(added).catch(() => {});
        window.dispatchEvent(new CustomEvent("eu:library-changed"));
      } else {
        toast(get("messages.importError", "Import impossible (sélection annulée ?)"), "error");
      }
      refresh();
    } catch {
      toast(get("messages.genericError", "Erreur"), "error");
    }
  };

  const openFile = (f: FileItem) => {
    api.logEvent("file_open", f.name, f.course_id);
    if (f.kind === "board") tabs.open({ kind: "whiteboard", title: f.name, params: { fileId: f.id } });
    else if (f.kind === "pdf" || f.kind === "image")
      tabs.open({ kind: "pdf", title: f.name, params: { fileId: f.id, fileName: f.name } });
    else api.openFile(f.id);
  };

  const openNote = (n: Note) => {
    tabs.open({ kind: "note", title: n.title || "Note", params: { noteId: n.id } });
  };

  // Stable callbacks (Memo* are now hoisted at top of module)
  const handleOpenFile = useCallback((f: FileItem) => openFile(f), [openFile]);
  const handleOpenNote = useCallback((n: Note) => openNote(n), [openNote]);

  const startRenameFile = useCallback((f: FileItem) => {
    setRenameTarget({ kind: "file", id: f.id, current: f.name });
    setRenameValue(f.name);
  }, []);
  const startRenameNote = useCallback((n: Note) => {
    const cur = n.title || (t.documents?.noteFallbackTitle || "Note");
    setRenameTarget({ kind: "note", id: n.id, current: cur });
    setRenameValue(cur);
  }, []);
  const handleRenameFile = useCallback((f: FileItem) => startRenameFile(f), [startRenameFile]);
  const handleRenameNote = useCallback((n: Note) => startRenameNote(n), [startRenameNote]);

  const deleteFileItem = useCallback(async (f: FileItem) => {
    const ok = await confirm.ask({
      title: get("common.delete", "Supprimer"),
      message: `Supprimer le fichier « ${f.name} » ?`,
      confirmLabel: get("common.delete", "Supprimer"),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteFile(f.id);
      tabs.tabs
        .filter((t) => t.params.fileId === f.id)
        .forEach((t) => tabs.close(t.id));
      toast(get("documents.toastDeleted", "Supprimé"), "success");
      window.dispatchEvent(new CustomEvent("eu:library-changed"));
    } catch (err: any) {
      toast(err?.message || get("messages.genericError", "Erreur"), "error");
    }
  }, [confirm, tabs, toast]);

  const deleteNoteItem = useCallback(async (n: Note) => {
    const ok = await confirm.ask({
      title: get("notes.deleteConfirm", "Supprimer cette note ?"),
      message: get("notes.deleteConfirm", "Supprimer cette note ?"),
      confirmLabel: get("common.delete", "Supprimer"),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteNote(n.id);
      tabs.tabs
        .filter((t) => t.kind === "note" && t.params.noteId === n.id)
        .forEach((t) => tabs.close(t.id));
      toast(get("notes.deleted", "Note supprimée"), "success");
      window.dispatchEvent(new CustomEvent("eu:library-changed"));
    } catch (err: any) {
      toast(err?.message || get("messages.genericError", "Erreur"), "error");
    }
  }, [confirm, tabs, toast]);

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
    try {
      if (renameTarget.kind === "note") {
        const renamed = await api.renameNote(renameTarget.id, newName);
        if (!renamed?.id) {
          toast(get("messages.genericError", "Erreur"), "error");
          return;
        }
        const tid = `note:${renameTarget.id}`;
        if (tabs.tabs.some((t) => t.id === tid)) {
          tabs.rename(tid, newName);
        }
        api.logEvent("note_rename", newName, null);
      } else {
        const updated = await api.renameFile(renameTarget.id, newName);
        if (!updated?.id) {
          toast(get("messages.genericError", "Erreur"), "error");
          return;
        }
        const tid =
          updated.kind === "board"
            ? `whiteboard:${updated.id}`
            : updated.kind === "pdf" || updated.kind === "image"
            ? `pdf:${updated.id}`
            : null;
        if (tid && tabs.tabs.some((t) => t.id === tid)) {
          const patch = updated.kind === "pdf" || updated.kind === "image" ? { fileName: newName } : undefined;
          tabs.rename(tid, newName, patch);
        }
        api.logEvent("file_rename", newName, updated.course_id ?? null);
      }
      toast(fmt(t.documents?.toastRenamed || 'Renommé en "{name}"', { name: newName }), "success");
      window.dispatchEvent(new CustomEvent("eu:library-changed"));
    } catch (err: any) {
      toast(err?.message || "Erreur lors du renommage", "error");
    } finally {
      closeRename();
    }
  }, [renameTarget, renameValue, tabs, toast, closeRename]); // eslint-disable-line react-hooks/exhaustive-deps -- api/fmt/t/window are stable module imports + globals

  // Unified + sorted + filtered view (fixes previous note-first concat + enables search + groups)
  const filteredItems = useMemo((): DocItem[] => {
    // 1. Merge and sort newest-first by appropriate timestamp
    const all: DocItem[] = [
      ...docs.map((f) => ({ t: "file" as const, f, date: f.added_at })),
      ...notes.map((n) => ({ t: "note" as const, n, date: n.updated_at })),
    ].sort((a, b) => b.date.localeCompare(a.date));

    // 2. Apply search (name/title)
    let res = all;
    const q = search.trim().toLowerCase();
    if (q) {
      res = res.filter((it) => {
        const name = it.t === "file" ? it.f.name : it.n.title || "";
        return name.toLowerCase().includes(q);
      });
    }

    // 3. Apply type / class filter (consistent for notes + files)
    if (filter.kind === "type") {
      if (filter.value === "note") {
        res = res.filter((it) => it.t === "note");
      } else {
        res = res.filter((it) => it.t === "file" && it.f.kind === filter.value);
      }
    } else if (filter.kind === "class") {
      res = res.filter((it) => {
        const cid = it.t === "file" ? it.f.course_id : it.n.course_id;
        return cid === filter.courseId;
      });
    }
    return res;
  }, [docs, notes, search, filter]);

  // Group into time sections (insertion order follows the already-sorted filteredItems)
  const grouped = useMemo(() => {
    if (filteredItems.length === 0) return [] as { label: string; its: DocItem[] }[];
    const m = new Map<string, DocItem[]>();
    for (const it of filteredItems) {
      const dt = it.t === "file" ? it.f.added_at : it.n.updated_at;
      const b = getTimeBucket(dt);
      if (!m.has(b)) m.set(b, []);
      m.get(b)!.push(it);
    }
    return Array.from(m.entries()).map(([label, its]) => ({ label, its }));
  }, [filteredItems]);

  const { resolved } = useAppearance();
  const accentFor = useCallback(
    (courseId: number | null) => {
      const c = courses.find((x) => x.id === courseId);
      return c ? courseVisual(c.color, resolved === "dark").fg : undefined;
    },
    [courses, resolved]
  );

  const chipClass = (active: boolean) =>
    `eu-btn-sm eu-btn ${active ? "eu-btn-primary" : "eu-btn-ghost"}`;

  const totalSize = docs.reduce((sum, d) => sum + (d.size || 0), 0);

  return (
    <>
      <PageHeader
        title={t.nav.documents}
        meta={
          <>
            <span>{fmt(get("documents.metaFiles", "{count} fichiers"), { count: docs.length })}</span>
            <MetaDot />
            <span>{fmt(get("documents.metaNotes", "{count} notes"), { count: notes.length })}</span>
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
                tabs.open({
                  kind: "note",
                  title: t.common?.newNote || "Nouvelle note",
                  params: { isNew: true },
                })
              }
              className="eu-btn-ghost eu-btn-sm"
            >
              <NoteIcon className="w-3.5 h-3.5" /> {t.common?.newNote || "Nouvelle note"}
            </button>
            <button onClick={importDocs} className="eu-btn-primary eu-btn-sm">
              <PlusIcon className="w-3.5 h-3.5" /> {t.common?.importFiles || "Importer"}
            </button>
          </>
        }
      />

      {/* Local search filters names; ⌘K also searches inside PDF content. */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <input
            className="eu-input pl-8"
            placeholder={t.documents?.searchPlaceholder || "Rechercher un document…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={get("common.search", "Rechercher")}
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
              {get("common.clear", "Effacer")}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <button onClick={() => setFilter({ kind: "all" })} className={chipClass(filter.kind === "all")}>
            {get("documents.filterAll", "Tout")}
          </button>
          {TYPE_CHIPS.map((c) => (
            <button
              key={c.value}
              onClick={() => setFilter({ kind: "type", value: c.value })}
              className={chipClass(filter.kind === "type" && filter.value === c.value)}
            >
              {c.label}
            </button>
          ))}
          {courses.length > 0 && <span className="w-px h-5 bg-line shrink-0 mx-1" />}
          {courses.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilter({ kind: "class", courseId: c.id })}
              className={chipClass(filter.kind === "class" && filter.courseId === c.id)}
            >
              <span
                className="w-2 h-2 rounded-sm shrink-0"
                style={{ background: courseVisual(c.color, resolved === "dark").fg }}
              />
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<DocIcon className="w-4 h-4" />}
            title={
              search.trim() || filter.kind !== "all"
                ? get("documents.noResult", "Aucun résultat")
                : t.documents?.nothingHere || "Rien ici pour l'instant"
            }
            hint={
              search.trim() || filter.kind !== "all"
                ? get(
                    "documents.noResultHint",
                    "Essayez un autre mot-clé, changez de filtre, ou importez de nouveaux documents."
                  )
                : t.documents?.nothingHint ||
                  "Importez des fichiers (ou glissez-les dans la fenêtre), ou écrivez des notes dans vos cours."
            }
            action={
              <button onClick={importDocs} className="eu-btn-primary eu-btn-sm">
                <PlusIcon className="w-3.5 h-3.5" /> {t.common?.importFiles || "Importer"}
              </button>
            }
          />
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map((g) => (
            <div key={g.label} className="flex flex-col gap-2">
              <p className="eu-t-label">
                {g.label} · {g.its.length}
              </p>
              <Panel>
                <div className="eu-divide">
                  {g.its.map((it) =>
                    it.t === "file" ? (
                      <MemoFileItem
                        key={`f${it.f.id}`}
                        f={it.f}
                        onOpen={handleOpenFile}
                        onRename={handleRenameFile}
                        onDelete={deleteFileItem}
                        courseName={courseName}
                        accent={accentFor(it.f.course_id)}
                      />
                    ) : (
                      <MemoNoteItem
                        key={`n${it.n.id}`}
                        n={it.n}
                        onOpen={handleOpenNote}
                        onRename={handleRenameNote}
                        onDelete={deleteNoteItem}
                        courseName={courseName}
                        accent={accentFor(it.n.course_id)}
                      />
                    )
                  )}
                </div>
              </Panel>
            </div>
          ))}
        </div>
      )}

      {/* Rename works for notes and for every file kind. */}
      {renameTarget && (
        <Modal open={!!renameTarget} onClose={closeRename} title={get("common.rename", "Renommer")}>
          <div className="flex flex-col gap-4">
            <Field label={get("documents.newName", "Nouveau nom")}>
              <input
                autoFocus
                className="eu-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") doRename();
                  if (e.key === "Escape") closeRename();
                }}
                aria-label={get("documents.newName", "Nouveau nom")}
              />
            </Field>
            <div className="flex gap-2 justify-end">
              <button onClick={closeRename} className="eu-btn-ghost">
                {get("common.cancel", "Annuler")}
              </button>
              <button
                onClick={doRename}
                className="eu-btn-primary"
                disabled={!renameValue.trim() || renameValue.trim() === renameTarget.current}
              >
                {get("common.rename", "Renommer")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
