import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useTabs } from "../lib/tabs";
import { api, type Course, type FileItem, type Note } from "../lib/api";
import { t } from "../lib/i18n";
import { fileKindEmoji, humanSize, relativeTime } from "../lib/format";
import { EmptyState, useToast } from "../components/ui";
import {
  ArrowRightIcon,
  FileIcon,
  PenIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";

type Tab = "notes" | "files";

export default function CourseDetail({ courseId }: { courseId: number }) {
  const tabs = useTabs();
  const toast = useToast();

  const [course, setCourse] = useState<Course | null>(null);
  const [tab, setTab] = useState<Tab>("notes");
  const [notes, setNotes] = useState<Note[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);

  const refreshNotes = () =>
    api.listNotes(courseId).then((n) => {
      setNotes(n);
      setActiveNote((prev) => prev ?? n[0] ?? null);
    });
  const refreshFiles = () => api.listFiles(courseId).then(setFiles);

  useEffect(() => {
    api.listCourses().then((cs) => setCourse(cs.find((c) => c.id === courseId) ?? null));
    refreshNotes();
    refreshFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const newNote = async () => {
    const note = await api.saveNote({ course_id: courseId, title: "Nouvelle note", body: "" });
    api.logEvent("note_new", note.title, courseId);
    await refreshNotes();
    setActiveNote(note);
    setTab("notes");
  };

  const importFiles = async () => {
    const added = await api.importFiles(courseId);
    if (added.length) {
      added.forEach((f) => api.logEvent("file_import", f.name, courseId));
      toast(`${added.length} fichier(s) importe(s)`, "success");
    }
    refreshFiles();
  };

  if (!course) {
    return (
      <div className="py-20">
        <EmptyState title="Cours introuvable" hint="Il a peut-etre ete supprime." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={() => tabs.open({ kind: "courses" })}
        className="text-[#6a6a6a] flex items-center gap-1.5 hover:text-[#1f1f1f] transition-colors w-fit"
      >
        <ArrowRightIcon className="w-4 h-4 rotate-180" /> {t.nav.courses}
      </button>

      <header className="flex items-center gap-4">
        <span
          className="grid place-items-center w-14 h-14 rounded-[12px] text-3xl"
          style={{ background: `${course.color}22` }}
        >
          {course.emoji}
        </span>
        <div className="flex-1">
          <h1 className="font-display text-2xl tracking-tight text-eu-text">{course.name}</h1>
          {course.description && <p className="eu-sub mt-0.5">{course.description}</p>}
        </div>
        <button
          onClick={async () => {
            if (confirm(`Supprimer le cours "${course.name}" ?`)) {
              await api.deleteCourse(courseId);
              tabs.open({ kind: "courses" });
              tabs.close(`course:${courseId}`);
            }
          }}
          className="eu-btn-ghost text-eu-muted"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </header>

      <div className="flex gap-4 border-b border-[#ededed] w-fit">
        {(["notes", "files"] as Tab[]).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`pb-2 px-4 text-sm font-medium transition-colors ${
              tab === tb ? "text-[#fa520f] border-b-2 border-[#fa520f]" : "text-[#6a6a6a] hover:text-[#1f1f1f]"
            }`}
          >
            {tb === "notes" ? "Notes" : "Fichiers"}
          </button>
        ))}
      </div>

      {tab === "notes" ? (
        <NotesPane
          notes={notes}
          active={activeNote}
          onSelect={setActiveNote}
          onNew={newNote}
          onSaved={refreshNotes}
          courseId={courseId}
          setActive={setActiveNote}
        />
      ) : (
        <FilesPane files={files} onImport={importFiles} onChanged={refreshFiles} />
      )}
    </div>
  );
}

function NotesPane({
  notes,
  active,
  onSelect,
  onNew,
  onSaved,
  setActive,
}: {
  notes: Note[];
  active: Note | null;
  onSelect: (n: Note) => void;
  onNew: () => void;
  onSaved: () => void;
  courseId: number;
  setActive: (n: Note | null) => void;
}) {
  const [draft, setDraft] = useState<Note | null>(active);
  const [preview, setPreview] = useState(false);

  useEffect(() => setDraft(active), [active]);

  const dirty = useMemo(
    () => draft && active && (draft.title !== active.title || draft.body !== active.body),
    [draft, active]
  );

  const save = async () => {
    if (!draft) return;
    const saved = await api.saveNote(draft);
    onSaved();
    setActive(saved);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
      <div className="flex flex-col gap-2">
        <button onClick={onNew} className="eu-btn-soft justify-start">
          <PlusIcon className="w-4 h-4" /> {t.newNote}
        </button>
        <div className="flex flex-col gap-1">
          {notes.map((n) => (
            <button
              key={n.id}
              onClick={() => onSelect(n)}
              className={`text-left px-3 py-2 rounded-lg transition-colors ${
                active?.id === n.id ? "bg-[#fff8e0]" : "hover:bg-[#fffaeb]"
              }`}
            >
              <p className="text-sm font-medium text-eu-text truncate">{n.title || "Sans titre"}</p>
              <p className="text-[11px] text-eu-muted">{relativeTime(n.updated_at)}</p>
            </button>
          ))}
        </div>
      </div>

      {draft ? (
        <div className="eu-card p-5 flex flex-col gap-3 min-h-[420px]">
          <div className="flex items-center gap-2">
            <input
              className="eu-input font-semibold text-base flex-1"
              value={draft.title}
              placeholder="Titre"
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <button
              onClick={() => setPreview((p) => !p)}
              className="eu-btn-ghost text-eu-muted"
              title="Apercu Markdown"
            >
              <PenIcon className="w-4 h-4" /> {preview ? "Editer" : "Apercu"}
            </button>
            <button onClick={save} disabled={!dirty} className="eu-btn-primary">
              {t.save}
            </button>
          </div>
          {preview ? (
            <article className="selectable prose-eu flex-1 overflow-y-auto px-1 text-eu-text leading-relaxed">
              <ReactMarkdown>{draft.body || "_Note vide_"}</ReactMarkdown>
            </article>
          ) : (
            <textarea
              className="eu-input flex-1 resize-none font-mono text-[13px] leading-relaxed"
              placeholder="Ecrivez en Markdown..."
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
          )}
          <div className="flex justify-between items-center">
            <button
              onClick={async () => {
                if (confirm("Supprimer cette note ?")) {
                  await api.deleteNote(draft.id);
                  setActive(null);
                  onSaved();
                }
              }}
              className="eu-btn-ghost text-eu-muted text-xs"
            >
              <TrashIcon className="w-4 h-4" /> {t.delete}
            </button>
            {dirty && <span className="text-[11px] text-eu-muted">Modifications non enregistrees</span>}
          </div>
        </div>
      ) : (
        <div className="eu-card p-5">
          <EmptyState
            icon={<PenIcon className="w-8 h-8" />}
            title="Aucune note"
            hint="Creez une note pour preparer votre lecon."
          />
        </div>
      )}
    </div>
  );
}

function FilesPane({
  files,
  onImport,
  onChanged,
}: {
  files: FileItem[];
  onImport: () => void;
  onChanged: () => void;
}) {
  const tabs = useTabs();
  const openFile = (f: FileItem) => {
    api.logEvent("file_open", f.name, f.course_id);
    if (f.kind === "board") tabs.open({ kind: "whiteboard", title: f.name, params: { fileId: f.id } });
    else if (f.kind === "pdf" || f.kind === "image")
      tabs.open({ kind: "pdf", title: f.name, params: { fileId: f.id, fileName: f.name } });
    else api.openFile(f.id);
  };
  return (
    <div className="flex flex-col gap-4">
      <button onClick={onImport} className="eu-btn-soft w-fit">
        <PlusIcon className="w-4 h-4" /> {t.importFiles}
      </button>
      {files.length === 0 ? (
        <div className="eu-card p-5">
          <EmptyState
            icon={<FileIcon className="w-8 h-8" />}
            title="Aucun fichier"
            hint="Importez vos PDF, images et supports de cours."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {files.map((f) => (
            <div key={f.id} className="eu-card p-4 flex items-center gap-3 group">
              <button
                onClick={() => openFile(f)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <span className="text-2xl">{fileKindEmoji(f.kind)}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-eu-text truncate">{f.name}</p>
                  <p className="text-[11px] text-eu-muted">
                    {humanSize(f.size)} - {relativeTime(f.added_at)}
                  </p>
                </div>
              </button>
              <button
                onClick={async () => {
                  await api.deleteFile(f.id);
                  onChanged();
                }}
                className="opacity-0 group-hover:opacity-100 text-eu-muted hover:text-red-500 transition-all"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
