import { useEffect, useMemo, useState, useCallback, memo } from "react";
import { api, type Course, type FileItem, type Note } from "../lib/api";
import { useTabs } from "../lib/tabs";
import { t, fmt, get } from "../lib/i18n";
import { fileKindLabel, humanSize, relativeTime } from "../lib/format";
import { EmptyState, Modal, useToast, useConfirm } from "../components/ui";
import { DocIcon, NoteIcon, PenIcon, PlusIcon, SearchIcon, FileKindIcon, TrashIcon } from "../components/icons";

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

// Hoisted memoized item components (defined at module scope so React.memo works across parent re-renders for snappier lists)
const MemoFileItem = memo(function MemoFileItem({
  f,
  onOpen,
  onRename,
  onDelete,
  courseName,
}: {
  f: FileItem;
  onOpen: (f: FileItem) => void;
  onRename: (f: FileItem) => void;
  onDelete: (f: FileItem) => void;
  courseName: (id: number | null) => string | undefined;
}) {
  return (
    <div
      className="new-card p-4 text-left relative group hover:border-tui-accent/40 hover:-translate-y-0.5 active:scale-[0.995] transition-all duration-150 cursor-pointer"
      onClick={() => onOpen(f)}
    >
      <FileKindIcon kind={f.kind} className="w-7 h-7 mb-2 text-mute" />
      <p className="text-sm font-medium text-primary truncate pr-6">{f.name}</p>
      <p className="text-[11px] text-body-mute mt-0.5 truncate">
        {f.course_id ? courseName(f.course_id) : `${fileKindLabel(f.kind)} · ${humanSize(f.size)}`}
        {" · "}
        {relativeTime(f.added_at)}
      </p>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRename(f);
        }}
        className="absolute top-2 right-8 p-1 rounded opacity-0 group-hover:opacity-100 text-mute hover:text-primary hover:bg-surface-container transition-all"
        title="Renommer"
      >
        <PenIcon className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(f);
        }}
        className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 text-mute hover:text-red-600 hover:bg-red-50 transition-all"
        title="Supprimer"
      >
        <TrashIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});

const MemoNoteItem = memo(function MemoNoteItem({
  n,
  onOpen,
  onRename,
  onDelete,
  courseName,
}: {
  n: Note;
  onOpen: (n: Note) => void;
  onRename: (n: Note) => void;
  onDelete: (n: Note) => void;
  courseName: (id: number | null) => string | undefined;
}) {
  const displayTitle = n.title || (t.documents?.noteFallbackTitle || "Note");
  return (
    <div
      className="new-card p-4 text-left relative group hover:border-tui-accent/40 hover:-translate-y-0.5 active:scale-[0.995] transition-all duration-150 cursor-pointer"
      onClick={() => onOpen(n)}
    >
      <div className="text-tui-accent mb-2">
        <NoteIcon className="w-7 h-7" />
      </div>
      <p className="text-sm font-medium text-primary truncate pr-6">{displayTitle}</p>
      <p className="text-[11px] text-body-mute mt-0.5 truncate">
        {n.course_id ? `${courseName(n.course_id)} · Note` : "Note"}
        {" · "}
        {relativeTime(n.updated_at)}
      </p>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRename(n);
        }}
        className="absolute top-2 right-8 p-1 rounded opacity-0 group-hover:opacity-100 text-mute hover:text-primary hover:bg-surface-container transition-all"
        title="Renommer"
      >
        <PenIcon className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(n);
        }}
        className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 text-mute hover:text-red-600 hover:bg-red-50 transition-all"
        title="Supprimer"
      >
        <TrashIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
});

export default function Documents({ filterHint }: { filterHint?: string }) {
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

  const refresh = () => {
    api.listFiles(null).then((f) => setDocs(Array.isArray(f) ? f : [])).catch(() => {});
    api.allNotes().then((n) => setNotes(Array.isArray(n) ? n : [])).catch(() => {});
    api.listCourses().then((c) => setCourses(Array.isArray(c) ? c : [])).catch(() => {});
  };
  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("eu:library-changed", onChange);
    return () => {
      window.removeEventListener("eu:library-changed", onChange);
    };
  }, []);

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

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors whitespace-nowrap ${
      active
        ? "bg-surface-container text-primary border-hairline"
        : "bg-surface text-body-mute border-hairline hover:text-primary"
    }`;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display-sm text-display-sm tracking-tight text-primary">{t.nav.documents}</h1>
          <p className="text-body-mute text-sm mt-1">{t.documents?.subtitle || "Tous vos supports et notes, au même endroit."}</p>
        </div>
        <button onClick={importDocs} className="new-btn-primary">
          <PlusIcon className="w-4 h-4" /> {t.common?.importFiles || "Importer des fichiers"}
        </button>
      </header>

      {/* Local search (name/title filter) — complements the global ⌘K palette which also searches PDF content */}
      <div className="relative">
        <input
          className="new-input w-full pl-9 text-sm"
          placeholder={t.documents?.searchPlaceholder || "Rechercher un document..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-body-mute pointer-events-none" />
        {(search.trim() || filter.kind !== "all") && (
          <button
            onClick={() => {
              setSearch("");
              setFilter({ kind: "all" });
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] px-2 py-0.5 rounded bg-surface-container hover:bg-hairline text-body-mute"
          >
            Effacer
          </button>
        )}
      </div>

      {/* filter tags */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button onClick={() => setFilter({ kind: "all" })} className={chip(filter.kind === "all")}>
          Tout
        </button>
        {TYPE_CHIPS.map((c) => (
          <button
            key={c.value}
            onClick={() => setFilter({ kind: "type", value: c.value })}
            className={chip(filter.kind === "type" && filter.value === c.value)}
          >
            {c.label}
          </button>
        ))}
        {courses.length > 0 && <span className="w-px h-5 bg-hairline shrink-0" />}
        {courses.map((c) => (
          <button
            key={c.id}
            onClick={() => setFilter({ kind: "class", courseId: c.id })}
            className={chip(filter.kind === "class" && filter.courseId === c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {filteredItems.length === 0 ? (
        <div className="new-card">
          <EmptyState
            icon={<DocIcon className="w-9 h-9" />}
            title={search.trim() || filter.kind !== "all" ? "Aucun résultat" : (t.documents?.nothingHere || "Rien ici pour l'instant")}
            hint={
              search.trim() || filter.kind !== "all"
                ? "Essayez un autre mot-clé, changez de filtre, ou importez de nouveaux documents."
                : (t.documents?.nothingHint || "Importez des fichiers (ou glissez-les dans la fenêtre), ou écrivez des notes dans vos cours.")
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map((g) => (
            <div key={g.label}>
              <div className="text-[10px] font-semibold tracking-[0.5px] text-body-mute uppercase mb-1.5 px-0.5">{g.label}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {g.its.map((it) =>
                  it.t === "file" ? (
                    <MemoFileItem key={`f${it.f.id}`} f={it.f} onOpen={handleOpenFile} onRename={handleRenameFile} onDelete={deleteFileItem} courseName={courseName} />
                  ) : (
                    <MemoNoteItem key={`n${it.n.id}`} n={it.n} onOpen={handleOpenNote} onRename={handleRenameNote} onDelete={deleteNoteItem} courseName={courseName} />
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Rename modal for any document type (note or file of any kind) */}
      {renameTarget && (
        <Modal open={!!renameTarget} onClose={closeRename} title={get("common.rename", "Renommer")}>
          <div className="flex flex-col gap-4">
            <input
              autoFocus
              className="new-input"
              placeholder="Nouveau nom"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") doRename();
                if (e.key === "Escape") closeRename();
              }}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={closeRename} className="new-btn-ghost">
                {get("common.cancel", "Annuler")}
              </button>
              <button
                onClick={doRename}
                className="new-btn-primary"
                disabled={!renameValue.trim() || renameValue.trim() === renameTarget.current}
              >
                {get("common.rename", "Renommer")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
