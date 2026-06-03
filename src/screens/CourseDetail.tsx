import { useEffect, useState, useMemo } from "react";
import { useTabs } from "../lib/tabs";
import { api, type Course, type CourseClass, type FileItem, type Note } from "../lib/api";
import { t, fmt } from "../lib/i18n";
import { fileKindLabel, humanSize, relativeTime } from "../lib/format";
import { COURSE_ICONS, EmptyState, Loading, Modal, useToast } from "../components/ui";
import {
  ArrowRightIcon,
  BookIcon,
  ClockIcon,
  FileIcon,
  FileKindIcon,
  PenIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";

// TTL cache for pronoteClasses (avoids sidecar + login on every open)
// on every single course tab open; the list changes rarely).
const pronoteClassesCache = { data: null as any[] | null, ts: 0 };
const PRONOTE_CACHE_TTL = 5 * 60 * 1000;

// Keep only "real" main class names from Pronote (e.g. "3C", "4A", "5B", "6D").
// Drop subgroup/division entries that look like "4ITAGR.1", "3ESPGR.2", "5ALLGR.1", "4AP.1", "6P.1" etc.
// These come from listeClasses but are not the primary class labels teachers usually attach for progression.
function sanitizePronoteClasses(raw: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const c of (raw || [])) {
    if (!c || typeof c.name !== "string") continue;
    const n = c.name.trim();
    if (!n || n.includes(".") || seen.has(n)) continue;
    seen.add(n);
    out.push({ ...c, name: n });
  }
  return out;
}

export default function CourseDetail({ courseId }: { courseId: number }) {
  const tabs = useTabs();
  const toast = useToast();

  const [course, setCourse] = useState<Course | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [courseClasses, setCourseClasses] = useState<CourseClass[]>([]);
  const [newClassName, setNewClassName] = useState("");
  // Pronote for class dropdown + subject
  const [pronoteClasses, setPronoteClasses] = useState<any[]>([]);
  const [selectedPronoteClass, setSelectedPronoteClass] = useState("");
  const [loading, setLoading] = useState(true);

  // Attach existing global documents to this course's casier (avoids direct uploads from course page which had refresh issues)
  const [showAttach, setShowAttach] = useState(false);
  const [attachDocs, setAttachDocs] = useState<FileItem[]>([]);
  const [attachSelected, setAttachSelected] = useState<number[]>([]);

  const refreshNotes = () => api.listNotes(courseId).then(setNotes);
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

    // Pronote attach dropdown (cached)
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
          let list = pronoteClassesCache.data;
          if (Array.isArray(list)) {
            list = sanitizePronoteClasses(list);
            pronoteClassesCache.data = list;
            setPronoteClasses(list);
          } else {
            setPronoteClasses([]);
          }
          return;
        }
        api
          .pronoteClasses()
          .then((r: any) => {
            if (r?.ok && Array.isArray(r.classes)) {
              const cleaned = sanitizePronoteClasses(r.classes);
              pronoteClassesCache.data = cleaned;
              pronoteClassesCache.ts = Date.now();
              setPronoteClasses(cleaned);
            }
          })
          .catch(() => {});
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // Keep notes (and files) in sync when edited/deleted from the standalone editor or Documents
  useEffect(() => {
    const onLibChange = () => {
      refreshNotes();
      refreshFiles();
    };
    window.addEventListener("eu:library-changed", onLibChange);
    return () => window.removeEventListener("eu:library-changed", onLibChange);
  }, [courseId]);

  // Sanitized + not-yet-attached Pronote classes for the dropdown (prevents weird/non-class entries and dups).
  // We aggressively drop subgroup names containing "." (e.g. 4ITAGR.1, 3ESPGR.2, 5ALLGR.1, 4AP.1)
  // so only main classes like "3C", "4A", "5B", "6D" appear in the chooser.
  const availablePronoteClasses = useMemo(() => {
    const attached = new Set(courseClasses.map((cc: any) => cc.class_name));
    const seen = new Set<string>();
    return (pronoteClasses || []).filter((c: any) => {
      if (!c || typeof c.name !== "string") return false;
      const n = c.name.trim();
      if (!n || n.includes(".") || attached.has(n) || seen.has(n)) return false;
      seen.add(n);
      return true;
    });
  }, [pronoteClasses, courseClasses]);



  const attachClass = async () => {
    const useSelect = availablePronoteClasses.length > 0;
    const classToAttach = (useSelect ? selectedPronoteClass : newClassName).trim();
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

  const openAttachModal = async () => {
    try {
      // Load global docs + this course's current casier so we can exclude already-attached ones
      const [docs, currentCasier] = await Promise.all([
        api.listFiles(null),
        api.listFiles(courseId),
      ]);
      const attachedNames = new Set((currentCasier || []).map((f: any) => (f.name || '').toLowerCase()));
      const available = (docs || []).filter((d: any) => !attachedNames.has((d.name || '').toLowerCase()));
      setAttachDocs(available);
      setAttachSelected([]);
      setShowAttach(true);
    } catch {
      toast("Impossible de lister les documents", "error");
    }
  };

  const toggleAttachDoc = (id: number) => {
    setAttachSelected((sel) =>
      sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]
    );
  };

  const doAttachDocs = async () => {
    if (attachSelected.length === 0) return;
    const paths: string[] = [];
    for (const id of attachSelected) {
      try {
        const p = await api.filePath(id);
        paths.push(p);
      } catch {}
    }
    if (paths.length === 0) {
      setShowAttach(false);
      return;
    }
    try {
      const added = await api.importPaths(paths, courseId);
      if (added.length) {
        added.forEach((f) => api.logEvent("file_import", f.name, courseId));
        toast(
          fmt(t.courseDetail?.importedFilesToast || "{count} importé(s)", { count: added.length }),
          "success"
        );
        window.dispatchEvent(new CustomEvent("eu:library-changed"));
      }
      setShowAttach(false);
      refreshFiles();
      refreshClasses();
    } catch (err: any) {
      toast(err?.message || "Erreur lors de l'attachement", "error");
    }
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
          <button
            onClick={() => updateMatiere("Maths expertes")}
            className={`px-2 py-0.5 rounded transition-colors ${course.matiere === "Maths expertes" ? "bg-primary text-white" : "hover:bg-surface-container/60"}`}
          >
            Maths expertes
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
          <button onClick={openAttachModal} className="new-btn-ghost text-xs py-0.5">
            <PlusIcon className="w-3.5 h-3.5" /> {t.courseDetail?.importToLocker || "Attacher depuis Documents"}
          </button>
        </div>
        <div className="p-3">
          <p className="text-[11px] text-mute mb-3">{t.courseDetail?.documentsHint || "Documents, PDF, tableaux du casier (copiés depuis Documents)."}</p>
          <FilesPane
            files={files}
            onChanged={() => {
              refreshFiles();
              refreshClasses(); // last_file may have been deleted
            }}
          />
        </div>
      </section>

      {/* Notes de cours — liste simple ; cliquer ouvre l'éditeur complet dans un onglet (comme Tableau blanc) */}
      <section className="terminal-card overflow-hidden">
        <div className="terminal-header flex items-center justify-between">
          <div className="font-medium">{t.courseDetail?.courseNotesHeader || "Notes de cours"}</div>
          <button
            onClick={() => tabs.open({ kind: "note", title: "Nouvelle note", params: { isNew: true, courseId } })}
            className="new-btn-ghost text-xs py-0.5"
          >
            <PlusIcon className="w-3.5 h-3.5" /> {t.common?.newNote || "Nouvelle note"}
          </button>
        </div>
        <div className="p-3">
          {notes.length === 0 ? (
            <EmptyState
              icon={<PenIcon className="w-6 h-6" />}
              title={t.courseDetail?.noNotesTitle || "Aucune note"}
              hint={t.courseDetail?.noNotesHint || "Créez une note — elle s'ouvrira dans un onglet avec un éditeur Markdown complet (aperçu, barre d'outils, choix du cours ou général)."}
            />
          ) : (
            <div className="flex flex-col gap-1">
              {notes.map((n) => (
                <button
                  key={n.id}
                  onClick={() => tabs.open({ kind: "note", title: n.title || "Note", params: { noteId: n.id } })}
                  className="text-left px-3 py-2 rounded hover:bg-surface-container/60 flex items-center justify-between group"
                >
                  <span className="text-sm font-medium truncate text-primary">{n.title || (t.courseDetail?.noTitle || "Sans titre")}</span>
                  <span className="text-[11px] text-mute ml-2 shrink-0">{relativeTime(n.updated_at)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Classes attachées + système de progression + notes prof par classe */}
      <section className="terminal-card overflow-hidden">
        <div className="terminal-header">
          <div className="font-medium">{t.courseDetail?.attachedClassesHeader || "Classes attachées"}</div>
        </div>
        <div className="p-4">
        <div className="flex gap-2 mb-5">
          {availablePronoteClasses.length > 0 ? (
            <select
              className="new-input flex-1"
              value={selectedPronoteClass}
              onChange={(e) => setSelectedPronoteClass(e.target.value)}
            >
              <option value="">{t.courseDetail?.choosePronoteClass || "— Choisir une classe —"}</option>
              {availablePronoteClasses.map((c: any, i: number) => (
                <option key={i} value={c.name}>{c.name}</option>
              ))}
            </select>
          ) : (
            <input
              className="new-input flex-1"
              placeholder={
                pronoteClasses.length > 0
                  ? (t.courseDetail?.allPronoteAttached || "Toutes les classes Pronote déjà attachées")
                  : (t.courseDetail?.classNamePlaceholder || "Nom Pronote exact")
              }
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") attachClass();
              }}
            />
          )}
          <button
            className="new-btn-primary bg-primary text-white disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={attachClass}
            disabled={availablePronoteClasses.length > 0 ? !selectedPronoteClass : !newClassName.trim()}
          >
            {t.courseDetail?.attach || "Attacher"}
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

      {/* Modal to select+attach existing global documents instead of direct upload (fixes update/refresh issues from cour page) */}
      <Modal
        open={showAttach}
        onClose={() => setShowAttach(false)}
        title={t.courseDetail?.attachDocsTitle || "Attacher des documents"}
        width="max-w-xl"
      >
        <div className="space-y-3">
          <p className="text-sm text-mute">
            {t.courseDetail?.attachDocsHint || "Sélectionnez des fichiers de la bibliothèque Documents pour les copier dans le casier de ce cours."}
          </p>
          {attachDocs.length === 0 ? (
            <p className="text-sm text-mute">Aucun document dans la bibliothèque globale.</p>
          ) : (
            <div className="max-h-72 overflow-auto border border-hairline rounded divide-y divide-hairline/60">
              {attachDocs.map((d) => {
                const isSel = attachSelected.includes(d.id);
                return (
                  <div
                    key={d.id}
                    className={`flex items-center gap-3 p-2 text-sm hover:bg-surface-soft cursor-pointer ${isSel ? 'bg-surface-container' : ''}`}
                    onClick={() => toggleAttachDoc(d.id)}
                  >
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleAttachDoc(d.id);
                      }}
                      className="w-4 h-4 accent-primary"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <FileKindIcon kind={d.kind} className="w-4 h-4 text-mute shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-primary">{d.name}</div>
                      <div className="text-[10px] text-mute">
                        {fileKindLabel(d.kind)} · {humanSize(d.size)} · {relativeTime(d.added_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowAttach(false)} className="new-btn-ghost">
              Annuler
            </button>
            <button
              onClick={doAttachDocs}
              disabled={attachSelected.length === 0}
              className="new-btn-primary"
            >
              {attachSelected.length > 0 ? `Attacher ${attachSelected.length} document(s)` : "Attacher des documents"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function FilesPane({
  files,
  onChanged,
}: {
  files: FileItem[];
  onChanged: () => void;
}) {
  const tabs = useTabs();
  const toast = useToast();
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
            hint={t.courseDetail?.noFilesHint || "Attachez des documents de la bibliothèque."}
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
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!confirm(`Supprimer le fichier "${f.name}" ?`)) return;
                  try {
                    await api.deleteFile(f.id);
                    window.dispatchEvent(new CustomEvent("eu:library-changed"));
                    onChanged();
                  } catch (err: any) {
                    toast(err?.message || "Erreur lors de la suppression", "error");
                  }
                }}
                className="opacity-0 group-hover:opacity-100 text-mute hover:text-red-400 transition-all duration-150"
                title={`Supprimer ${f.name}`}
              >
                <TrashIcon className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openFile(f);
                }}
                className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded bg-tui-accent hover:brightness-90 text-white transition"
                title="Ouvrir le document"
              >
                →
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Per-class card: shows current progress (with reopen), dropdown to pick document as progress,
// Editable prof notes (saved on blur).
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
          title="Afficher le contenu Pronote (cahier de textes + documents)"
        >
          <BookIcon className="w-4 h-4" />
          {t.courseDetail?.showPronoteContents || "Contenu Pronote"}
        </button>
      )}
    </div>
  );
}

