import { useEffect, useMemo, useState, useCallback, memo } from "react";
import { api, type Course, type FileItem, type Note } from "../lib/api";
import { useTabs } from "../lib/tabs";
import { t, fmt } from "../lib/i18n";
import { humanSize, relativeTime } from "../lib/format";
import { EmptyState, useToast } from "../components/ui";
import { DocIcon, FileIcon, NoteIcon, PlusIcon } from "../components/icons";

type Filter = { kind: "all" } | { kind: "type"; value: string } | { kind: "class"; courseId: number };

const TYPE_CHIPS = [
  { value: "pdf", label: "PDF", emoji: "" },
  { value: "image", label: "Images", emoji: "" },
  { value: "board", label: "Tableaux", emoji: "" },
  { value: "note", label: "Notes", emoji: "" },
];

export default function Documents() {
  const toast = useToast();
  const tabs = useTabs();
  const [docs, setDocs] = useState<FileItem[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [filter, setFilter] = useState<Filter>({ kind: "all" });

  const refresh = () => {
    api.listFiles(null).then(setDocs).catch(() => {});
    api.allNotes().then(setNotes).catch(() => {});
    api.listCourses().then(setCourses).catch(() => {});
  };
  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("eu:library-changed", onChange);
    return () => {
      window.removeEventListener("eu:library-changed", onChange);
    };
  }, []);

  const courseName = useCallback((id: number | null) => courses.find((c) => c.id === id)?.name, [courses]);
  const courseEmoji = useCallback((_id: number | null) => "", []);

  const importDocs = async () => {
    const added = await api.importFiles(null);
    if (added.length) {
      added.forEach((f) => api.logEvent("file_import", f.name, null));
      toast(fmt(t.documents?.toastImported || "{count} document(s) importé(s)", { count: added.length }), "success");
      await api.reindexDocuments();
      window.dispatchEvent(new CustomEvent("eu:library-changed"));
    }
    refresh();
  };

  const openFile = (f: FileItem) => {
    api.logEvent("file_open", f.name, f.course_id);
    if (f.kind === "board") tabs.open({ kind: "whiteboard", title: f.name, params: { fileId: f.id } });
    else if (f.kind === "pdf" || f.kind === "image")
      tabs.open({ kind: "pdf", title: f.name, params: { fileId: f.id, fileName: f.name } });
    else api.openFile(f.id);
  };

  const openNote = (n: Note) => {
    if (n.course_id) tabs.open({ kind: "course", title: courseName(n.course_id) ?? "Cours", params: { courseId: n.course_id } });
    else tabs.open({ kind: "courses" });
  };

  // Memoized items for snappier re-renders (parent filter/state changes don't re-render every card)
  const MemoFileItem = memo(function MemoFileItem({ f, onOpen, courseName }: { f: FileItem; onOpen: (f: FileItem) => void; courseName: (id: number | null) => string | undefined }) {
    return (
      <button
        onClick={() => onOpen(f)}
        className="new-card p-4 text-left hover:border-accent-sunset/40 hover:-translate-y-0.5 active:scale-[0.995] transition-all duration-150"
      >
        <FileIcon className="w-6 h-6 mb-2 text-mute" />
        <p className="text-sm font-medium text-primary truncate">{f.name}</p>
        <p className="text-[11px] text-body-mute mt-0.5 truncate">
          {f.course_id ? `${courseEmoji(f.course_id)} ${courseName(f.course_id)}` : humanSize(f.size)}
          {" · "}
          {relativeTime(f.added_at)}
        </p>
      </button>
    );
  });

  const MemoNoteItem = memo(function MemoNoteItem({ n, onOpen, courseName }: { n: Note; onOpen: (n: Note) => void; courseName: (id: number | null) => string | undefined }) {
    return (
      <button
        onClick={() => onOpen(n)}
        className="new-card p-4 text-left hover:border-accent-sunset/40 hover:-translate-y-0.5 active:scale-[0.995] transition-all duration-150"
      >
        <div className="text-accent-sunset mb-2">
          <NoteIcon className="w-7 h-7" />
        </div>
        <p className="text-sm font-medium text-primary truncate">{n.title || (t.documents?.noteFallbackTitle || "Note")}</p>
        <p className="text-[11px] text-body-mute mt-0.5 truncate">
          {n.course_id ? `${courseEmoji(n.course_id)} ${courseName(n.course_id)}` : "Note"}
          {" · "}
          {relativeTime(n.updated_at)}
        </p>
      </button>
    );
  });

  // Stable callbacks
  const handleOpenFile = useCallback((f: FileItem) => openFile(f), [openFile]);
  const handleOpenNote = useCallback((n: Note) => openNote(n), [openNote]);

  // unified, filtered library (no text query — use global search palette for that)
  const items = useMemo(() => {
    const fileItems = docs
      .filter((f) => {
        if (filter.kind === "type" && filter.value !== "note") return f.kind === filter.value;
        if (filter.kind === "type" && filter.value === "note") return false;
        if (filter.kind === "class") return f.course_id === filter.courseId;
        return true;
      })
      .map((f) => ({ t: "file" as const, f }));
    const noteItems = notes
      .filter(() => {
        if (filter.kind === "type") return filter.value === "note";
        if (filter.kind === "class") return false;
        return true;
      })
      .map((n) => ({ t: "note" as const, n }));
    // notes that belong to a selected class
    const noteForClass =
      filter.kind === "class"
        ? notes
            .filter((n) => n.course_id === filter.courseId)
            .map((n) => ({ t: "note" as const, n }))
        : [];
    return [...noteItems, ...noteForClass, ...fileItems];
  }, [docs, notes, filter]);

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

      {items.length === 0 ? (
        <div className="new-card">
          <EmptyState
            icon={<DocIcon className="w-9 h-9" />}
            title={t.documents?.nothingHere || "Rien ici pour l'instant"}
            hint={t.documents?.nothingHint || "Importez des fichiers (ou glissez-les dans la fenêtre), ou écrivez des notes dans vos cours."}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((it) =>
            it.t === "file" ? (
              <MemoFileItem key={`f${it.f.id}`} f={it.f} onOpen={handleOpenFile} courseName={courseName} />
            ) : (
              <MemoNoteItem key={`n${it.n.id}`} n={it.n} onOpen={handleOpenNote} courseName={courseName} />
            )
          )}
        </div>
      )}
    </div>
  );
}
