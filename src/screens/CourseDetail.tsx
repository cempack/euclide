import { useEffect, useMemo, useRef, useState } from "react";
import { useTabs } from "../lib/tabs";
import { api, type Course, type CourseClass, type FileItem, type Note } from "../lib/api";
import { t, fmt } from "../lib/i18n";
import { fileKindLabel, humanSize, relativeTime } from "../lib/format";
import { COURSE_ICONS, EmptyState, Loading, useToast } from "../components/ui";
import {
  ArrowRightIcon,
  BookIcon,
  ClockIcon,
  FileIcon,
  PenIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";

// Simple module-level TTL cache for pronoteClasses (avoids spawning sidecar + Pronote network login
// on every single course tab open; the list changes rarely).
const pronoteClassesCache = { data: null as any[] | null, ts: 0 };
const PRONOTE_CACHE_TTL = 5 * 60 * 1000;

export default function CourseDetail({ courseId }: { courseId: number }) {
  const tabs = useTabs();
  const toast = useToast();

  const [course, setCourse] = useState<Course | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [courseClasses, setCourseClasses] = useState<CourseClass[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [newClassName, setNewClassName] = useState("");
  // Pronote integration for class dropdown + subject for contents
  const [pronoteClasses, setPronoteClasses] = useState<any[]>([]);
  const [selectedPronoteClass, setSelectedPronoteClass] = useState("");
  const [loading, setLoading] = useState(true);

  const refreshNotes = () =>
    api.listNotes(courseId).then((n) => {
      setNotes(n);
      setActiveNote((prev) => prev ?? n[0] ?? null);
    });
  const refreshFiles = () => api.listFiles(courseId).then(setFiles);
  const refreshClasses = () => api.listCourseClasses(courseId).then(setCourseClasses).catch(() => {});

  useEffect(() => {
    setLoading(true);
    const pCourse = api.listCourses().then((cs) => {
      setCourse(cs.find((c) => c.id === courseId) ?? null);
    });
    const pNotes = refreshNotes();
    const pFiles = refreshFiles();
    const pClasses = refreshClasses();
    Promise.all([pCourse, pNotes, pFiles, pClasses]).finally(() => setLoading(false));

    // Pronote for attach dropdown (background + cached to avoid slowness on every open)
    api
      .pronoteStatus()
      .then((s) => {
        const connected = !!s.connected;
        if (!connected) {
          pronoteClassesCache.data = null;
          pronoteClassesCache.ts = 0;
          setPronoteClasses([]);
          return;
        }
        const now = Date.now();
        if (pronoteClassesCache.data && now - pronoteClassesCache.ts < PRONOTE_CACHE_TTL) {
          setPronoteClasses(pronoteClassesCache.data);
          return;
        }
        api
          .pronoteClasses()
          .then((r: any) => {
            if (r?.ok && Array.isArray(r.classes)) {
              pronoteClassesCache.data = r.classes;
              pronoteClassesCache.ts = Date.now();
              setPronoteClasses(r.classes);
            }
          })
          .catch(() => {});
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const newNote = async () => {
    const note = await api.saveNote({ course_id: courseId, title: t.common?.newNote || "Nouvelle note", body: "" });
    api.logEvent("note_new", note.title, courseId);
    await refreshNotes();
    setActiveNote(note);
  };

  const importFiles = async () => {
    const added = await api.importFiles(courseId);
    if (added.length) {
      added.forEach((f) => api.logEvent("file_import", f.name, courseId));
      toast(fmt(t.messages?.imported || "{count} fichier(s) importé(s)", { count: added.length }), "success");
    }
    refreshFiles();
    refreshClasses();
  };

  const attachClass = async () => {
    const classToAttach = (pronoteClasses.length > 0 ? selectedPronoteClass : newClassName).trim();
    if (!classToAttach) return;
    await api.attachClassToCourse(courseId, classToAttach);
    toast(fmt(t.courseDetail?.attachSuccess || 'Classe "{name}" attachée', { name: classToAttach }), "success");
    setNewClassName("");
    setSelectedPronoteClass("");
    refreshClasses();
  };

  const detachClass = async (cc: CourseClass) => {
    if (!confirm(fmt(t.courseDetail?.confirmDetach || 'Détacher la classe "{name}" ?', { name: cc.class_name }))) return;
    await api.detachCourseClass(cc.id);
    refreshClasses();
  };

  const updateMatiere = async (newMatiere: string) => {
    if (!course) return;
    await api.updateCourse({ ...course, matiere: newMatiere });
    const cs = await api.listCourses();
    setCourse(cs.find((c) => c.id === courseId) ?? null);
    toast(`Matière mise à jour : ${newMatiere || "(aucune)"}`, "success");
  };

  if (loading) {
    return (
      <div className="py-10">
        <div className="new-card">
          <Loading label="Chargement du cours…" />
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="py-20">
        <EmptyState title={t.courseDetail?.notFoundTitle || "Cours introuvable"} hint={t.courseDetail?.notFoundHint || "Il a peut-être été supprimé."} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={() => tabs.open({ kind: "courses" })}
        className="text-mute flex items-center gap-1.5 hover:text-primary transition-colors w-fit"
      >
        <ArrowRightIcon className="w-4 h-4 rotate-180" /> {t.common?.courses || t.nav.courses}
      </button>

      <header className="flex items-center gap-4">
        <span
          className="grid place-items-center w-10 h-10 rounded-none border border-[rgba(15,0,0,0.12)]"
          style={{ background: `${course.color}22`, color: course.color }}
        >
          {(() => {
            const found = COURSE_ICONS.find((i) => i.key === (course.emoji || "book"));
            const IconComp = found ? found.Icon : BookIcon;
            return <IconComp className="w-5 h-5" strokeWidth={1.8} />;
          })()}
        </span>
        <div className="flex-1">
          <h1 className="font-display-sm text-display-sm tracking-tight text-primary">{course.name}</h1>
          {course.description && <p className="text-mute text-sm mt-0.5">{course.description}</p>}
        </div>
        {/* Beautiful minimal theme selector for Pronote matiere (values match creation, no clutter text) */}
        <div className="new-segment text-xs">
          <button
            onClick={() => updateMatiere("")}
            className={`px-2 py-0.5 rounded transition-colors ${!course.matiere ? "bg-primary text-white" : "hover:bg-surface-container/60"}`}
          >
            Aucune
          </button>
          <button
            onClick={() => updateMatiere("Mathématiques")}
            className={`px-2 py-0.5 rounded transition-colors ${course.matiere === "Mathématiques" ? "bg-primary text-white" : "hover:bg-surface-container/60"}`}
          >
            Mathématiques
          </button>
          <button
            onClick={() => updateMatiere("NSI")}
            className={`px-2 py-0.5 rounded transition-colors ${course.matiere === "NSI" ? "bg-primary text-white" : "hover:bg-surface-container/60"}`}
          >
            NSI
          </button>
        </div>
        <button
          onClick={async () => {
            if (confirm(fmt(t.courseDetail?.confirmDeleteCourse || 'Supprimer le cours "{name}" ?', { name: course.name }))) {
              await api.deleteCourse(courseId);
              tabs.open({ kind: "courses" });
              tabs.close(`course:${courseId}`);
            }
          }}
          className="new-btn-ghost"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </header>

      {/* Casier du cours : documents partagés pour ce cours (toutes classes) */}
      <section className="terminal-card overflow-hidden">
        <div className="terminal-header">
          <div className="font-medium">Casier du cours</div>
          <button onClick={importFiles} className="new-btn-ghost text-xs py-0.5">
            <PlusIcon className="w-3.5 h-3.5" /> {t.courseDetail?.importToLocker || "Importer dans le casier"}
          </button>
        </div>
        <div className="p-3">
          <p className="text-[11px] text-mute mb-3">{t.courseDetail?.documentsHint || "Documents, PDF, tableaux partagés pour ce cours."}</p>
          <FilesPane
            files={files}
            onChanged={() => {
              refreshFiles();
              refreshClasses(); // last_file may have been deleted
            }}
            courseClasses={courseClasses}
            onSetProgress={(fileId) => {
              // Convenience: if exactly one class, quick set it; else user sets via the class cards below
              if (courseClasses.length === 1) {
                api
                  .setCourseClassProgress(courseId, courseClasses[0].class_name, fileId)
                  .then(refreshClasses);
              } else {
                toast(t.courseDetail?.progressToastHint || "Utilisez les sélecteurs dans la section Classes ci-dessous pour choisir la progression par classe.", "success");
              }
            }}
          />
        </div>
      </section>

      {/* Notes de cours (générales au cours, pas par classe) */}
      <section className="terminal-card overflow-hidden">
        <div className="terminal-header">
          <div className="font-medium">{t.courseDetail?.courseNotesHeader || "Notes de cours"}</div>
        </div>
        <div className="p-3">
          <NotesPane
            notes={notes}
            active={activeNote}
            onSelect={setActiveNote}
            onNew={newNote}
            onSaved={refreshNotes}
            courseId={courseId}
            setActive={setActiveNote}
          />
        </div>
      </section>

      {/* Classes attachées + système de progression + notes prof par classe */}
      <section className="terminal-card overflow-hidden">
        <div className="terminal-header">
          <div className="font-medium">{t.courseDetail?.attachedClassesHeader || "Classes attachées"}</div>
        </div>
        <div className="p-4">
        <div className="flex gap-2 mb-5">
          {pronoteClasses.length > 0 ? (
            <select
              className="new-input flex-1"
              value={selectedPronoteClass}
              onChange={(e) => setSelectedPronoteClass(e.target.value)}
            >
              <option value="">— Choisir une classe (Pronote) —</option>
              {pronoteClasses.map((c: any, i: number) => (
                <option key={i} value={c.name}>{c.name}</option>
              ))}
            </select>
          ) : (
            <input
              className="new-input flex-1"
              placeholder={t.courseDetail?.classNamePlaceholder || "Nom de classe (Pronote)"}
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") attachClass();
              }}
            />
          )}
          <button className="new-btn-primary bg-primary text-white" onClick={attachClass}>
            Attacher la classe
          </button>
        </div>

        {courseClasses.length === 0 ? (
          <div className="py-3">
            <EmptyState
              icon={<BookIcon className="w-6 h-6" />}
              title={t.courseDetail?.noClassesAttachedTitle || "Aucune classe attachée"}
              hint={t.courseDetail?.noClassesAttachedHint || "Ajoutez une classe (nom Pronote exact) pour le suivi de progression."}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {courseClasses.map((cc) => (
              <ClassCard
                key={cc.id}
                cc={cc}
                files={files}
                courseId={courseId}
                courseMatiere={course?.matiere || ""}
                onRefresh={() => {
                  refreshClasses();
                  refreshFiles();
                }}
                onDetach={detachClass}
              />
            ))}
          </div>
        )}
        </div>
      </section>
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
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(active);
    // Default to preview for existing notes with content; edit for new/empty
    setPreview(!!(active && active.body && active.body.trim().length > 0));
  }, [active]);

  useEffect(() => {
    if (editorRef.current && !preview && draft) {
      let html = draft.body || '';
      if (html && !/<[a-z][\s\S]*>/i.test(html)) {
        // legacy plain text note: escape and convert newlines
        html = html
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br/>');
      }
      editorRef.current.innerHTML = html;
    }
  }, [preview, draft?.id]);

  const dirty = useMemo(
    () => draft && active && (draft.title !== active.title || draft.body !== active.body),
    [draft, active]
  );

  const save = async () => {
    if (!draft) return;
    const saved = await api.saveNote(draft);
    onSaved();
    setActive(saved);
    setPreview(true); // after save, show preview state
    window.dispatchEvent(new CustomEvent("eu:library-changed"));
  };

  const format = (command: string, value?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false, value);
    setDraft(prev => (prev ? { ...prev, body: editor.innerHTML } : null));
  };

  const insertLink = () => {
    const url = window.prompt('URL du lien ?', 'https://');
    if (url) {
      format('createLink', url);
    }
  };

  const handleInput = () => {
    const editor = editorRef.current;
    if (editor && draft) {
      setDraft({ ...draft, body: editor.innerHTML });
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
      <div className="flex flex-col gap-2">
        <button onClick={onNew} className="new-btn-ghost justify-start">
          <PlusIcon className="w-4 h-4" /> {t.common?.newNote || "Nouvelle note"}
        </button>
        <div className="flex flex-col gap-1">
          {notes.map((n) => (
            <button
              key={n.id}
              onClick={() => onSelect(n)}
              className={`text-left px-3 py-2 rounded transition-colors ${
                active?.id === n.id ? "bg-surface-container text-primary" : "hover:bg-surface-container/60 text-on-surface"
              }`}
            >
              <p className="text-sm font-medium truncate">{n.title || (t.courseDetail?.noTitle || "Sans titre")}</p>
              <p className="text-[11px] text-mute">{relativeTime(n.updated_at)}</p>
            </button>
          ))}
        </div>
      </div>

      {draft ? (
        <div className="new-card flex flex-col gap-3 min-h-[420px]">
          {/* Header: title + edit/preview toggle + save */}
          <div className="flex items-center gap-2">
            {preview ? (
              <div className="font-semibold text-base flex-1 truncate text-on-surface px-1">{draft.title || "Sans titre"}</div>
            ) : (
              <input
                className="new-input font-semibold text-base flex-1"
                value={draft.title}
                placeholder={t.courseDetail?.noteTitlePlaceholder || "Titre"}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            )}
            <button
              onClick={() => setPreview((p) => !p)}
              className="new-btn-ghost"
              title={preview ? "Éditer la note" : "Aperçu de la note"}
            >
              <PenIcon className="w-4 h-4" /> {preview ? (t.courseDetail?.edit || "Éditer") : (t.courseDetail?.preview || "Aperçu")}
            </button>
            {(!preview || dirty) && (
              <button onClick={save} disabled={!dirty} className="new-btn-primary bg-primary text-white">
                {t.common?.save || "Enregistrer"}
              </button>
            )}
          </div>

          {/* Beautiful formatting toolbar - only in edit mode, usable note-style buttons */}
          {!preview && (
            <div className="flex items-center gap-0.5 p-1 bg-surface-soft border border-hairline rounded">
              <button
                onClick={() => format('bold')}
                className="p-1 hover:bg-surface rounded transition-colors"
                title="Gras (Bold)"
              >
                <span className="material-symbols-outlined text-base">format_bold</span>
              </button>
              <button
                onClick={() => format('italic')}
                className="p-1 hover:bg-surface rounded transition-colors"
                title="Italique (Italic)"
              >
                <span className="material-symbols-outlined text-base">format_italic</span>
              </button>
              <button
                onClick={() => format('formatBlock', 'pre')}
                className="p-1 hover:bg-surface rounded transition-colors"
                title="Code"
              >
                <span className="material-symbols-outlined text-base">code</span>
              </button>
              <button
                onClick={() => format('formatBlock', 'h1')}
                className="p-1 hover:bg-surface rounded transition-colors"
                title="Titre principal (H1)"
              >
                <span className="material-symbols-outlined text-base">title</span>
              </button>
              <button
                onClick={() => format('insertUnorderedList')}
                className="p-1 hover:bg-surface rounded transition-colors"
                title="Liste à puces"
              >
                <span className="material-symbols-outlined text-base">format_list_bulleted</span>
              </button>
              <button
                onClick={insertLink}
                className="p-1 hover:bg-surface rounded transition-colors"
                title="Insérer un lien"
              >
                <span className="material-symbols-outlined text-base">link</span>
              </button>
            </div>
          )}

          {/* Content area - consistent borders, WYSIWYG note editor */}
          {preview ? (
            <div
              className="p-3 text-sm leading-relaxed border border-hairline rounded flex-1 overflow-auto"
              style={{ minHeight: '200px' }}
              dangerouslySetInnerHTML={{ __html: draft.body || '<span class="text-mute">Note vide</span>' }}
            />
          ) : (
            <div
              ref={editorRef}
              contentEditable
              className="new-input flex-1 p-3 text-sm leading-relaxed overflow-auto focus:outline-none"
              style={{ minHeight: '200px', whiteSpace: 'pre-wrap' }}
              onInput={handleInput}
            />
          )}

          <div className="flex justify-between items-center">
            <button
              onClick={async () => {
                if (confirm(t.courseDetail?.confirmDeleteNote || "Supprimer cette note ?")) {
                  await api.deleteNote(draft.id);
                  setActive(null);
                  onSaved();
                }
              }}
              className="new-btn-ghost text-xs"
            >
              <TrashIcon className="w-4 h-4" /> {t.common?.delete || "Supprimer"}
            </button>
            {dirty && <span className="text-[11px] text-mute">{t.courseDetail?.unsavedChanges || "Modifications non enregistrées"}</span>}
          </div>
        </div>
      ) : (
        <div className="new-card">
          <EmptyState
            icon={<PenIcon className="w-8 h-8" />}
            title={t.courseDetail?.noNotesTitle || "Aucune note"}
            hint={t.courseDetail?.noNotesHint || "Créez une note pour préparer votre leçon."}
          />
        </div>
      )}
    </div>
  );
}

function FilesPane({
  files,
  onChanged,
  courseClasses = [],
  onSetProgress,
}: {
  files: FileItem[];
  onChanged: () => void;
  courseClasses?: CourseClass[];
  onSetProgress?: (fileId: number | null) => void;
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
    <div className="flex flex-col gap-2">
      {files.length === 0 ? (
        <div className="new-card min-h-[180px] flex items-center justify-center">
          <EmptyState
            icon={<FileIcon className="w-8 h-8" />}
            title={t.courseDetail?.noFilesTitle || "Aucun fichier"}
            hint={t.courseDetail?.noFilesHint || "Importez des PDF, images, tableaux dans le casier du cours."}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {files.map((f) => (
            <div key={f.id} className="new-card p-4 flex items-center gap-3 group">
              <button
                onClick={() => openFile(f)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <FileIcon className="w-5 h-5 text-mute shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary truncate">{f.name}</p>
                  <p className="text-[11px] text-mute">
                    {fileKindLabel(f.kind)} · {humanSize(f.size)} · {relativeTime(f.added_at)}
                  </p>
                </div>
              </button>
              <button
                onClick={async () => {
                  await api.deleteFile(f.id);
                  onChanged();
                }}
                className="opacity-0 group-hover:opacity-100 text-mute hover:text-red-400 transition-all duration-150"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
              {onSetProgress && courseClasses && courseClasses.length > 0 && (
                <button
                  onClick={() => onSetProgress(f.id)}
                  className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded bg-surface-container hover:bg-accent-sunset hover:text-primary text-mute transition border border-hairline"
                  title={t.courseDetail?.setAsProgress || "Définir comme 'où on en était' (pour la classe si une seule)"}
                >
                  →
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Per-class card: shows current progress (with reopen), dropdown to pick document as progress,
// and editable prof notes (saved on blur).
function ClassCard({
  cc,
  files,
  courseId,
  courseMatiere,
  onRefresh,
  onDetach,
}: {
  cc: CourseClass;
  files: FileItem[];
  courseId: number;
  courseMatiere: string;
  onRefresh: () => void;
  onDetach: (cc: CourseClass) => void;
}) {
  const tabs = useTabs();
  const [notesDraft, setNotesDraft] = useState(cc.notes);
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    setNotesDraft(cc.notes);
  }, [cc.notes]);

  const saveNotes = async () => {
    if (notesDraft === cc.notes) return;
    setSavingNotes(true);
    try {
      await api.updateCourseClassNotes(courseId, cc.class_name, notesDraft);
      onRefresh();
    } finally {
      setSavingNotes(false);
    }
  };

  const setProgress = async (fileId: number | null) => {
    await api.setCourseClassProgress(courseId, cc.class_name, fileId);
    onRefresh();
  };

  const reopen = () => {
    if (!cc.last_file_id) return;
    api.logEvent("progress_reopen", cc.last_file_name || "", courseId);
    const kind = cc.last_file_kind || "file";
    const name = cc.last_file_name || "Document";
    if (kind === "board") {
      tabs.open({ kind: "whiteboard", title: name, params: { fileId: cc.last_file_id } });
    } else if (kind === "pdf" || kind === "image") {
      tabs.open({ kind: "pdf", title: name, params: { fileId: cc.last_file_id, fileName: name } });
    } else {
      api.openFile(cc.last_file_id);
    }
  };

  return (
    <div className="new-card p-5 flex flex-col gap-5">
      {/* Header: class indicator + name + subtle meta + trash */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded border border-[rgba(15,0,0,0.12)] bg-[var(--eu-surface-soft)] flex items-center justify-center text-sm font-semibold text-primary tracking-tight">
            {cc.class_name.slice(0,2)}
          </div>
          <div>
            <div className="font-semibold text-primary text-lg leading-none">{cc.class_name}</div>
            <div className="text-[11px] text-mute flex items-center gap-1 mt-1">
              <ClockIcon className="w-3.5 h-3.5" />
              Progression {cc.progress_updated_at ? "• " + relativeTime(cc.progress_updated_at) : "—"}
            </div>
          </div>
        </div>
        <button 
          onClick={() => onDetach(cc)} 
          className="text-mute hover:text-red-400 p-1 -mr-1 -mt-1 rounded hover:bg-surface-container/50 transition-colors" 
          title="Détacher cette classe"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Progress: clean, breathing, no redundant "Dernier" line */}
      <div>
        <div className="flex items-center gap-2 text-xs font-medium text-mute mb-1.5">
          <ClockIcon className="w-4 h-4" />
          {t.courseDetail?.whereWeWere || "Où on en était :"}
        </div>
        <div className="flex items-center gap-2">
          <select
            className="new-input text-sm flex-1"
            value={cc.last_file_id ?? ""}
            onChange={(e) => setProgress(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— Aucun document —</option>
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {fileKindLabel(f.kind)} {f.name}
              </option>
            ))}
          </select>
          {cc.last_file_id && (
            <button onClick={reopen} className="new-btn-primary bg-primary text-white text-sm whitespace-nowrap px-3">
              {t.courseDetail?.reopen || "Reprendre"}
            </button>
          )}
          {cc.last_file_id && (
            <button onClick={() => setProgress(null)} className="new-btn-ghost text-sm px-2">
              Effacer
            </button>
          )}
        </div>
      </div>

      {/* Notes: cleaner, no auto-save text, more breathing */}
      <div>
        <div className="flex items-center justify-between text-xs font-medium text-mute mb-1.5">
          <span className="flex items-center gap-2">
            <PenIcon className="w-4 h-4" />
            Notes professeur (cette classe)
          </span>
          {savingNotes && <span className="text-[10px] text-mute">enregistrement…</span>}
        </div>
        <textarea
          className="new-input text-sm min-h-[68px] resize-y"
          placeholder={t.courseDetail?.classNotesPlaceholder || "Ex : fini exo p.47, distribuer DM pour le 12, revoir les bases sur les fonctions..."}
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={saveNotes}
        />
      </div>

      {/* Action: subtle, icon + short text */}
      {courseMatiere && (
        <button
          onClick={() => {
            tabs.open({
              kind: "class-content",
              title: `Contenu ${cc.class_name} — ${courseMatiere}`,
              params: { courseId, className: cc.class_name, matiere: courseMatiere },
            });
          }}
          className="new-btn-ghost text-sm w-full justify-center flex items-center gap-2 text-mute hover:text-primary"
          title={t.courseDetail?.showPronoteContents || "Afficher les 7 derniers contenus Pronote (cahier de textes) + documents joints pour cette classe et matière"}
        >
          <BookIcon className="w-4 h-4" />
          Contenu Pronote
        </button>
      )}
    </div>
  );
}

