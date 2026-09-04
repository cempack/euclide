import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { useTabs } from "../lib/tabs";
import {
  api,
  type Course,
  type CourseClass,
  type FileItem,
  type Note,
  type Sequence,
  type SequenceItem,
} from "../lib/api";
import { t, fmt, get } from "../lib/i18n";
import { fileKindLabel, humanSize, relativeTime } from "../lib/format";
import { COURSE_ICONS, EmptyState, Loading, Modal, useToast, useConfirm } from "../components/ui";
import { MetaDot, PageHeader, Panel, Segmented } from "../components/layout";
import { courseVisual } from "../lib/color";
import { useAppearance } from "../lib/theme";
import {
  BookIcon,
  CheckIcon,
  ChevronDownIcon,

  FileIcon,
  FileKindIcon,
  LayersIcon,
  PenIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";

// TTL cache for pronoteClasses (avoids sidecar + login on every open)
// on every single course tab open; the list changes rarely).
const pronoteClassesCache = { data: null as any[] | null, ts: 0 };
const PRONOTE_CACHE_TTL = 5 * 60 * 1000;

function isMainClass(name: string): boolean {
  if (!name) return false;
  const n = name.trim();
  // Filter out subgroups, options, or admin codes.
  // Standard main classes do NOT contain spaces, dots, parentheses, or commas.
  if (n.includes(" ") || n.includes(".") || n.includes("(") || n.includes(")") || n.includes(",")) {
    return false;
  }
  // Real class names are typically short (length <= 6)
  if (n.length > 6) {
    return false;
  }
  return true;
}

// Keep only "real" main class names from Pronote (e.g. "3C", "4A", "5B", "6D").
// Drop subgroup/division entries that look like "4ITAGR.1", "3ESPGR.2", "5ALLGR.1", "4AP.1", "6P.1" etc.
// These come from listeClasses but are not the primary class labels teachers usually attach for progression.
function sanitizePronoteClasses(raw: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const c of (raw || [])) {
    if (!c || typeof c.name !== "string") continue;
    const n = c.name.trim();
    if (!isMainClass(n) || seen.has(n)) continue;
    seen.add(n);
    out.push({ ...c, name: n });
  }
  return out;
}

export default function CourseDetail({ courseId, visible = true }: { courseId: number; visible?: boolean }) {
  const tabs = useTabs();
  const toast = useToast();
  const confirmDlg = useConfirm();

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
  const staleLib = useRef(false);

  const { resolved } = useAppearance();

  const refreshNotes = useCallback(
    () => api.listNotes(courseId).then((n) => setNotes(Array.isArray(n) ? n : [])).catch(() => {}),
    [courseId]
  );
  const refreshFiles = useCallback(
    () => api.listFiles(courseId).then((f) => setFiles(Array.isArray(f) ? f : [])).catch(() => {}),
    [courseId]
  );
  const refreshClasses = useCallback(
    () =>
      api
        .listCourseClasses(courseId)
        .then((c) => setCourseClasses(Array.isArray(c) ? c : []))
        .catch(() => {}),
    [courseId]
  );
  const refreshAll = useCallback(() => {
    refreshFiles();
    refreshClasses();
  }, [refreshFiles, refreshClasses]);

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
      if (!visible) {
        staleLib.current = true;
        return;
      }
      refreshNotes();
      refreshFiles();
    };
    window.addEventListener("eu:library-changed", onLibChange);
    return () => window.removeEventListener("eu:library-changed", onLibChange);
  }, [visible, refreshNotes, refreshFiles]);

  useEffect(() => {
    if (visible && staleLib.current) {
      staleLib.current = false;
      refreshNotes();
      refreshFiles();
    }
  }, [visible, refreshNotes, refreshFiles]);

  // Sanitized + not-yet-attached Pronote classes for the dropdown (prevents weird/non-class entries and dups).
  // We aggressively drop subgroup names containing "." (e.g. 4ITAGR.1, 3ESPGR.2, 5ALLGR.1, 4AP.1)
  // so only main classes like "3C", "4A", "5B", "6D" appear in the chooser.
  const availablePronoteClasses = useMemo(() => {
    const attached = new Set(courseClasses.map((cc: any) => cc.class_name));
    const seen = new Set<string>();
    return (pronoteClasses || []).filter((c: any) => {
      if (!c || typeof c.name !== "string") return false;
      const n = c.name.trim();
      if (!isMainClass(n) || attached.has(n) || seen.has(n)) return false;
      seen.add(n);
      return true;
    });
  }, [pronoteClasses, courseClasses]);



  const attachClass = async () => {
    const useSelect = availablePronoteClasses.length > 0;
    const classToAttach = (useSelect ? selectedPronoteClass : newClassName).trim();
    if (!classToAttach) return;
    try {
      const attached = await api.attachClassToCourse(courseId, classToAttach);
      if (!attached?.id) {
        toast(get("messages.genericError", "Erreur"), "error");
        return;
      }
      toast(fmt(t.courseDetail?.attachSuccess || 'Classe "{name}" attachée', { name: classToAttach }), "success");
      setNewClassName("");
      setSelectedPronoteClass("");
      refreshClasses();
    } catch {
      toast(get("messages.genericError", "Erreur"), "error");
    }
  };

  const detachClass = async (cc: CourseClass) => {
    const ok = await confirmDlg.ask({
      title: fmt(t.courseDetail?.confirmDetach || 'Détacher la classe "{name}" ?', { name: cc.class_name }),
      message: fmt(t.courseDetail?.confirmDetach || 'Détacher la classe "{name}" ?', { name: cc.class_name }),
      confirmLabel: get("common.delete", "Supprimer"),
      danger: true,
    });
    if (!ok) return;
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
        <div className="eu-panel">
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

  const visual = courseVisual(course.color, resolved === "dark");
  const CourseIcon =
    COURSE_ICONS.find((i) => i.key === (course.emoji || "book"))?.Icon ?? BookIcon;

  return (
    <>
      <PageHeader
        onBack={() => tabs.open({ kind: "courses" })}
        backLabel={t.common?.courses || t.nav.courses}
        icon={
          <span
            className="grid place-items-center w-8 h-8 rounded border"
            style={{ background: visual.tint, borderColor: visual.border, color: visual.fg }}
          >
            <CourseIcon className="w-4 h-4" strokeWidth={1.8} />
          </span>
        }
        title={course.name}
        meta={
          <>
            <span>
              {fmt(get("courseDetail.metaClasses", "{count} classes"), { count: courseClasses.length })}
            </span>
            <MetaDot />
            <span>
              {fmt(get("courseDetail.metaFiles", "{count} documents"), { count: files.length })}
            </span>
            <MetaDot />
            <span>{fmt(get("courseDetail.metaNotes", "{count} notes"), { count: notes.length })}</span>
            {course.description && (
              <>
                <MetaDot />
                <span className="normal-case tracking-normal">{course.description}</span>
              </>
            )}
          </>
        }
        actions={
          <>
            <Segmented
              value={course.matiere || ""}
              onChange={(v) => void updateMatiere(v)}
              label={get("courses.matiere", "Matière")}
              options={[
                { value: "", label: get("common.none", "Aucune") },
                { value: "Mathématiques", label: "Maths" },
                { value: "NSI", label: "NSI" },
                { value: "Maths expertes", label: "Expertes" },
              ]}
            />
            <button
              onClick={async () => {
                const ok = await confirmDlg.ask({
                  title: fmt(t.courseDetail?.confirmDeleteCourse || 'Supprimer le cours "{name}" ?', {
                    name: course.name,
                  }),
                  message: get(
                    "courseDetail.confirmDeleteCourseBody",
                    "Le casier, les notes et les séquences de ce cours seront supprimés."
                  ),
                  confirmLabel: get("common.delete", "Supprimer"),
                  danger: true,
                });
                if (!ok) return;
                await api.deleteCourse(courseId);
                window.dispatchEvent(new CustomEvent("eu:course-changed"));
                tabs.open({ kind: "courses" });
                tabs.close(`course:${courseId}`);
              }}
              aria-label={get("common.delete", "Supprimer")}
              title={fmt(get("courseDetail.deleteCourse", "Supprimer « {name} »"), { name: course.name })}
              className="eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
          </>
        }
      />

      <SequencePane courseId={courseId} files={files} courseClasses={courseClasses} onRefresh={refreshAll} />

      {/* Casier: documents shared by every class of this course. */}
      <Panel
        title={get("courseDetail.lockerTitle", "Casier du cours")}
        icon={<FileIcon className="w-3.5 h-3.5" />}
        action={
          <button onClick={openAttachModal} className="eu-btn-quiet eu-btn-sm">
            <PlusIcon className="w-3.5 h-3.5" />{" "}
            {t.courseDetail?.importToLocker || "Attacher depuis Documents"}
          </button>
        }
      >
        <FilesPane
          files={files}
          onChanged={() => {
            refreshFiles();
            refreshClasses(); // last_file may have been deleted
          }}
          onAttach={openAttachModal}
        />
      </Panel>

      {/* Course notes: clicking opens the full Markdown editor in a tab. */}
      <Panel
        title={t.courseDetail?.courseNotesHeader || "Notes de cours"}
        icon={<PenIcon className="w-3.5 h-3.5" />}
        action={
          <button
            onClick={() =>
              tabs.open({
                kind: "note",
                title: t.common?.newNote || "Nouvelle note",
                params: { isNew: true, courseId },
              })
            }
            className="eu-btn-quiet eu-btn-sm"
          >
            <PlusIcon className="w-3.5 h-3.5" /> {t.common?.newNote || "Nouvelle note"}
          </button>
        }
      >
        {notes.length === 0 ? (
          <EmptyState
            icon={<PenIcon className="w-4 h-4" />}
            title={t.courseDetail?.noNotesTitle || "Aucune note"}
            hint={
              t.courseDetail?.noNotesHint ||
              "Une note s'ouvre dans un onglet, avec un éditeur Markdown, un aperçu et l'export PDF."
            }
            action={
              <button
                onClick={() =>
                  tabs.open({
                    kind: "note",
                    title: t.common?.newNote || "Nouvelle note",
                    params: { isNew: true, courseId },
                  })
                }
                className="eu-btn-primary eu-btn-sm"
              >
                <PlusIcon className="w-3.5 h-3.5" /> {t.common?.newNote || "Nouvelle note"}
              </button>
            }
          />
        ) : (
          <div className="eu-divide">
            {notes.map((n) => (
              <button
                key={n.id}
                onClick={() =>
                  tabs.open({ kind: "note", title: n.title || "Note", params: { noteId: n.id } })
                }
                className="eu-row-hover w-full text-left"
              >
                <PenIcon className="w-4 h-4 text-ink-faint shrink-0" />
                <span className="eu-t-body text-ink truncate flex-1">
                  {n.title || t.courseDetail?.noTitle || "Sans titre"}
                </span>
                <span className="eu-t-label normal-case tracking-normal shrink-0">
                  {relativeTime(n.updated_at)}
                </span>
              </button>
            ))}
          </div>
        )}
      </Panel>

      {/* Classes attachées + système de progression + notes prof par classe */}
      <Panel
        title={t.courseDetail?.attachedClassesHeader || "Classes attachées"}
        icon={<BookIcon className="w-3.5 h-3.5" />}
      >
        <div className="eu-panel-pad flex flex-col gap-4">
          <div className="flex gap-2">
            {availablePronoteClasses.length > 0 ? (
              <select
                className="eu-select flex-1"
                value={selectedPronoteClass}
                onChange={(e) => setSelectedPronoteClass(e.target.value)}
                aria-label={t.courseDetail?.choosePronoteClass || "Choisir une classe"}
              >
                <option value="">{t.courseDetail?.choosePronoteClass || "— Choisir une classe —"}</option>
                {availablePronoteClasses.map((c: any, i: number) => (
                  <option key={i} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="eu-input flex-1"
                placeholder={
                  pronoteClasses.length > 0
                    ? t.courseDetail?.allPronoteAttached || "Toutes les classes Pronote déjà attachées"
                    : t.courseDetail?.classNamePlaceholder || "Nom Pronote exact"
                }
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") attachClass();
                }}
                aria-label={t.courseDetail?.classNamePlaceholder || "Nom Pronote exact"}
              />
            )}
            <button
              className="eu-btn-primary eu-btn-sm"
              onClick={attachClass}
              disabled={availablePronoteClasses.length > 0 ? !selectedPronoteClass : !newClassName.trim()}
            >
              <PlusIcon className="w-3.5 h-3.5" />
              {t.courseDetail?.attach || "Attacher"}
            </button>
          </div>

          {courseClasses.length === 0 ? (
            <EmptyState
              icon={<BookIcon className="w-4 h-4" />}
              title={t.courseDetail?.noClassesAttachedTitle || "Aucune classe attachée"}
              hint={
                t.courseDetail?.noClassesAttachedHint ||
                "Attachez une classe avec son nom Pronote exact : Euclide suit alors sa progression et affiche son cahier de textes."
              }
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {courseClasses.map((cc) => (
                <ClassCard
                  key={cc.id}
                  cc={cc}
                  files={files}
                  courseId={courseId}
                  courseMatiere={course?.matiere || ""}
                  onRefresh={refreshAll}
                  onDetach={detachClass}
                />
              ))}
            </div>
          )}
        </div>
      </Panel>

      {/* Modal to select+attach existing global documents instead of direct upload (fixes update/refresh issues from cour page) */}
      <Modal
        open={showAttach}
        onClose={() => setShowAttach(false)}
        title={t.courseDetail?.attachDocsTitle || "Attacher des documents"}
        width="max-w-xl"
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            {t.courseDetail?.attachDocsHint || "Sélectionnez des fichiers de la bibliothèque Documents pour les copier dans le casier de ce cours."}
          </p>
          {attachDocs.length === 0 ? (
            <p className="text-sm text-ink-muted">Aucun document dans la bibliothèque globale.</p>
          ) : (
            <div className="max-h-72 overflow-auto border border-line rounded divide-y divide-line/60">
              {attachDocs.map((d) => {
                const isSel = attachSelected.includes(d.id);
                return (
                  <div
                    key={d.id}
                    className={`flex items-center gap-3 p-2 text-sm hover:bg-panel-alt cursor-pointer ${isSel ? 'bg-panel-alt' : ''}`}
                    onClick={() => toggleAttachDoc(d.id)}
                  >
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleAttachDoc(d.id);
                      }}
                      className="w-4 h-4 accent-ink"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <FileKindIcon kind={d.kind} className="w-4 h-4 text-ink-muted shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-ink">{d.name}</div>
                      <div className="text-[10px] text-ink-muted">
                        {fileKindLabel(d.kind)} · {humanSize(d.size)} · {relativeTime(d.added_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowAttach(false)} className="eu-btn-ghost">
              Annuler
            </button>
            <button
              onClick={doAttachDocs}
              disabled={attachSelected.length === 0}
              className="eu-btn-primary"
            >
              {attachSelected.length > 0 ? `Attacher ${attachSelected.length} document(s)` : "Attacher des documents"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function FilesPane({
  files,
  onChanged,
  onAttach,
}: {
  files: FileItem[];
  onChanged: () => void;
  onAttach: () => void;
}) {
  const tabs = useTabs();
  const toast = useToast();
  const confirmDlg = useConfirm();

  const openFile = (f: FileItem) => {
    api.logEvent("file_open", f.name, f.course_id);
    if (f.kind === "board") tabs.open({ kind: "whiteboard", title: f.name, params: { fileId: f.id } });
    else if (f.kind === "pdf" || f.kind === "image")
      tabs.open({ kind: "pdf", title: f.name, params: { fileId: f.id, fileName: f.name } });
    else api.openFile(f.id);
  };

  if (files.length === 0) {
    return (
      <EmptyState
        icon={<FileIcon className="w-4 h-4" />}
        title={t.courseDetail?.noFilesTitle || "Aucun document dans ce casier"}
        hint={
          t.courseDetail?.noFilesHint ||
          "Attachez des documents de la bibliothèque, ou déposez-les directement dans la fenêtre."
        }
        action={
          <button onClick={onAttach} className="eu-btn-primary eu-btn-sm">
            <PlusIcon className="w-3.5 h-3.5" />
            {t.courseDetail?.importToLocker || "Attacher un document"}
          </button>
        }
      />
    );
  }

  return (
    <div className="eu-divide">
      {files.map((f) => (
        <div key={f.id} className="eu-row-hover group">
          <button
            onClick={() => openFile(f)}
            className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
            title={f.name}
          >
            <FileKindIcon kind={f.kind} className="w-4 h-4 text-ink-faint shrink-0" />
            <span className="eu-t-body text-ink truncate">{f.name}</span>
          </button>
          <span className="eu-t-label normal-case tracking-normal shrink-0 hidden sm:block">
            {fileKindLabel(f.kind)} · {humanSize(f.size)} · {relativeTime(f.added_at)}
          </span>
          <button
            onClick={async () => {
              const ok = await confirmDlg.ask({
                title: get("common.delete", "Supprimer"),
                message: fmt(get("courseDetail.confirmDeleteFile", "Supprimer « {name} » ?"), {
                  name: f.name,
                }),
                confirmLabel: get("common.delete", "Supprimer"),
                danger: true,
              });
              if (!ok) return;
              try {
                await api.deleteFile(f.id);
                tabs.tabs
                  .filter((tab) => tab.params.fileId === f.id)
                  .forEach((tab) => tabs.close(tab.id));
                window.dispatchEvent(new CustomEvent("eu:library-changed"));
                onChanged();
              } catch (err: any) {
                toast(err?.message || get("messages.genericError", "Erreur"), "error");
              }
            }}
            aria-label={`${get("common.delete", "Supprimer")} — ${f.name}`}
            title={get("common.delete", "Supprimer")}
            className="eu-row-actions eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progression: sequences (chapters) -> items (steps) -> optional document.
//
// This answers a question the previous model could not: "where is 3C in the
// chapter?". Before, per-class progress was only "the last document opened",
// which says nothing about what remains to be done.
// ---------------------------------------------------------------------------

function SequencePane({
  courseId,
  files,
  courseClasses,
  onRefresh,
}: {
  courseId: number;
  files: FileItem[];
  courseClasses: CourseClass[];
  onRefresh: () => void;
}) {
  const toast = useToast();
  const confirmDlg = useConfirm();
  const tabs = useTabs();

  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [items, setItems] = useState<SequenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSequence, setNewSequence] = useState("");
  const [addingTo, setAddingTo] = useState<number | null>(null);
  const [newItem, setNewItem] = useState("");
  const [newItemFile, setNewItemFile] = useState<number | "">("");
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    try {
      const [s, i] = await Promise.all([
        api.listSequences(courseId),
        api.listSequenceItems(courseId),
      ]);
      setSequences(Array.isArray(s) ? s : []);
      setItems(Array.isArray(i) ? i : []);
    } catch {
      setSequences([]);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = async () => {
    await load();
    onRefresh();
  };

  const addSequence = async () => {
    const title = newSequence.trim();
    if (!title) return;
    try {
      await api.createSequence(courseId, title);
      setNewSequence("");
      await reload();
    } catch {
      toast(get("messages.genericError", "Erreur"), "error");
    }
  };

  const addItem = async (sequenceId: number) => {
    const title = newItem.trim();
    if (!title) return;
    try {
      await api.createSequenceItem(sequenceId, title, newItemFile === "" ? null : Number(newItemFile));
      setNewItem("");
      setNewItemFile("");
      await reload();
    } catch {
      toast(get("messages.genericError", "Erreur"), "error");
    }
  };

  /** Which classes have stopped at a given step. */
  const classesAt = (itemId: number) => courseClasses.filter((cc) => cc.last_item_id === itemId);

  const markClassHere = async (className: string, itemId: number | null) => {
    try {
      await api.setCourseClassItem(courseId, className, itemId);
      await reload();
    } catch {
      toast(get("messages.genericError", "Erreur"), "error");
    }
  };

  const openItemFile = (item: SequenceItem) => {
    if (item.file_id == null) return;
    const name = item.file_name || get("common.document", "Document");
    api.logEvent("file_open", name, courseId);
    if (item.file_kind === "board") {
      tabs.open({ kind: "whiteboard", title: name, params: { fileId: item.file_id } });
    } else if (item.file_kind === "pdf" || item.file_kind === "image") {
      tabs.open({ kind: "pdf", title: name, params: { fileId: item.file_id, fileName: name } });
    } else {
      api.openFile(item.file_id);
    }
  };

  return (
    <Panel
      title={get("sequences.title", "Progression")}
      icon={<LayersIcon className="w-3.5 h-3.5" />}
      action={
        <div className="flex items-center gap-1.5">
          <input
            className="eu-input h-7 w-[190px] text-[12px]"
            placeholder={get("sequences.newPlaceholder", "Nouvelle séquence…")}
            value={newSequence}
            onChange={(e) => setNewSequence(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addSequence();
            }}
            aria-label={get("sequences.newPlaceholder", "Nouvelle séquence")}
          />
          <button
            className="eu-btn-ghost eu-btn-sm"
            onClick={() => void addSequence()}
            disabled={!newSequence.trim()}
          >
            <PlusIcon className="w-3.5 h-3.5" />
            {get("sequences.add", "Ajouter")}
          </button>
        </div>
      }
    >
      {loading ? (
        <Loading label={get("common.loading", "Chargement…")} size="small" />
      ) : sequences.length === 0 ? (
        <EmptyState
          icon={<LayersIcon className="w-4 h-4" />}
          title={get("sequences.emptyTitle", "Aucune séquence")}
          hint={get(
            "sequences.emptyHint",
            "Découpez le cours en séquences (chapitres) puis en étapes : activité, cours, exercices, évaluation. Chaque classe peut ensuite être positionnée sur une étape."
          )}
        />
      ) : (
        <div className="eu-divide">
          {sequences.map((seq, seqIndex) => {
            const seqItems = items.filter((i) => i.sequence_id === seq.id);
            const isCollapsed = !!collapsed[seq.id];
            return (
              <div key={seq.id}>
                <div className="eu-row group bg-panel-alt/60">
                  <button
                    onClick={() => setCollapsed((c) => ({ ...c, [seq.id]: !c[seq.id] }))}
                    aria-expanded={!isCollapsed}
                    aria-label={seq.title}
                    className="eu-btn-quiet eu-btn-icon eu-btn-sm shrink-0"
                  >
                    <ChevronDownIcon
                      className={`w-3.5 h-3.5 transition-transform duration-fast ${
                        isCollapsed ? "-rotate-90" : ""
                      }`}
                    />
                  </button>
                  <span className="eu-t-body font-medium text-ink truncate flex-1">{seq.title}</span>
                  <span className="eu-chip shrink-0">
                    {fmt(get("sequences.stepCount", "{count} étapes"), { count: seqItems.length })}
                  </span>
                  <div className="eu-row-actions flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => void api.moveSequence(courseId, seq.id, -1).then(reload)}
                      disabled={seqIndex === 0}
                      aria-label={get("sequences.moveUp", "Monter")}
                      title={get("sequences.moveUp", "Monter")}
                      className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                    >
                      <ChevronDownIcon className="w-3.5 h-3.5 rotate-180" />
                    </button>
                    <button
                      onClick={() => void api.moveSequence(courseId, seq.id, 1).then(reload)}
                      disabled={seqIndex === sequences.length - 1}
                      aria-label={get("sequences.moveDown", "Descendre")}
                      title={get("sequences.moveDown", "Descendre")}
                      className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                    >
                      <ChevronDownIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await confirmDlg.ask({
                          title: get("sequences.deleteTitle", "Supprimer la séquence"),
                          message: fmt(
                            get("sequences.deleteMessage", "Supprimer « {name} » et ses étapes ?"),
                            { name: seq.title }
                          ),
                          confirmLabel: get("common.delete", "Supprimer"),
                          danger: true,
                        });
                        if (!ok) return;
                        await api.deleteSequence(seq.id);
                        await reload();
                      }}
                      aria-label={`${get("common.delete", "Supprimer")} — ${seq.title}`}
                      title={get("common.delete", "Supprimer")}
                      className="eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="pl-8">
                    {seqItems.map((item, itemIndex) => {
                      const here = classesAt(item.id);
                      return (
                        <div key={item.id} className="eu-row group border-t border-line">
                          <span className="eu-t-num text-[11px] text-ink-faint w-5 shrink-0">
                            {itemIndex + 1}
                          </span>
                          <span className="eu-t-body text-ink truncate flex-1">{item.title}</span>
                          {item.file_id != null && (
                            <button
                              onClick={() => openItemFile(item)}
                              className="eu-chip hover:text-ink shrink-0 max-w-[22ch]"
                              title={item.file_name || ""}
                            >
                              <FileKindIcon kind={item.file_kind || "file"} className="w-3 h-3" />
                              <span className="truncate">{item.file_name}</span>
                            </button>
                          )}
                          {here.map((cc) => (
                            <span key={cc.id} className="eu-chip-accent shrink-0">
                              <CheckIcon className="w-3 h-3" />
                              {cc.class_name}
                            </span>
                          ))}
                          <div className="eu-row-actions flex items-center gap-0.5 shrink-0">
                            {courseClasses.length > 0 && (
                              <select
                                value=""
                                onChange={(e) => {
                                  if (e.target.value) void markClassHere(e.target.value, item.id);
                                }}
                                className="eu-select h-7 text-[11px] w-[104px]"
                                aria-label={get("sequences.markClass", "Marquer une classe ici")}
                                title={get("sequences.markClass", "Marquer une classe ici")}
                              >
                                <option value="">{get("sequences.markClassShort", "Classe ici…")}</option>
                                {courseClasses.map((cc) => (
                                  <option key={cc.id} value={cc.class_name}>
                                    {cc.class_name}
                                  </option>
                                ))}
                              </select>
                            )}
                            <button
                              onClick={() => void api.moveSequenceItem(seq.id, item.id, -1).then(reload)}
                              disabled={itemIndex === 0}
                              aria-label={get("sequences.moveUp", "Monter")}
                              className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                            >
                              <ChevronDownIcon className="w-3.5 h-3.5 rotate-180" />
                            </button>
                            <button
                              onClick={() => void api.moveSequenceItem(seq.id, item.id, 1).then(reload)}
                              disabled={itemIndex === seqItems.length - 1}
                              aria-label={get("sequences.moveDown", "Descendre")}
                              className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                            >
                              <ChevronDownIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={async () => {
                                await api.deleteSequenceItem(item.id);
                                await reload();
                              }}
                              aria-label={`${get("common.delete", "Supprimer")} — ${item.title}`}
                              title={get("common.delete", "Supprimer")}
                              className="eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {addingTo === seq.id ? (
                      <div className="eu-row border-t border-line gap-2">
                        <input
                          autoFocus
                          className="eu-input flex-1"
                          placeholder={get("sequences.stepPlaceholder", "Titre de l'étape…")}
                          value={newItem}
                          onChange={(e) => setNewItem(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void addItem(seq.id);
                            if (e.key === "Escape") setAddingTo(null);
                          }}
                          aria-label={get("sequences.stepPlaceholder", "Titre de l'étape")}
                        />
                        <select
                          className="eu-select w-[170px]"
                          value={newItemFile}
                          onChange={(e) =>
                            setNewItemFile(e.target.value === "" ? "" : Number(e.target.value))
                          }
                          aria-label={get("sequences.stepFile", "Document lié")}
                        >
                          <option value="">{get("sequences.noFile", "— Sans document —")}</option>
                          {files.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                        <button
                          className="eu-btn-primary eu-btn-sm"
                          onClick={() => void addItem(seq.id)}
                          disabled={!newItem.trim()}
                        >
                          {get("common.add", "Ajouter")}
                        </button>
                        <button className="eu-btn-quiet eu-btn-sm" onClick={() => setAddingTo(null)}>
                          {get("common.cancel", "Annuler")}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setAddingTo(seq.id);
                          setNewItem("");
                          setNewItemFile("");
                        }}
                        className="eu-row-hover w-full text-left border-t border-line text-ink-muted"
                      >
                        <PlusIcon className="w-3.5 h-3.5 shrink-0" />
                        <span className="eu-t-meta">{get("sequences.addStep", "Ajouter une étape")}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
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
    <div className="eu-panel-alt p-3.5 flex flex-col gap-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 shrink-0 grid place-items-center rounded border border-line bg-panel font-mono text-[12px] font-semibold text-ink">
            {cc.class_name.slice(0, 3)}
          </span>
          <div className="min-w-0">
            <p className="eu-t-section text-ink truncate">{cc.class_name}</p>
            <p className="eu-t-label normal-case tracking-normal">
              {cc.progress_updated_at
                ? fmt(get("courseDetail.updated", "mise à jour {when}"), {
                    when: relativeTime(cc.progress_updated_at),
                  })
                : "—"}
            </p>
          </div>
        </div>
        <button
          onClick={() => onDetach(cc)}
          aria-label={fmt(get("courseDetail.detach", "Détacher {name}"), { name: cc.class_name })}
          title={get("courseDetail.detachTitle", "Détacher cette classe")}
          className="eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger shrink-0"
        >
          <TrashIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Progression: which step of the course, and which document. */}
      {cc.last_item_title && (
        <div className="flex items-center gap-2 min-w-0">
          <LayersIcon className="w-3.5 h-3.5 text-ink-faint shrink-0" />
          <span className="eu-t-meta truncate">
            {cc.last_sequence_title ? `${cc.last_sequence_title} — ` : ""}
            <span className="text-ink">{cc.last_item_title}</span>
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <p className="eu-t-label">{t.courseDetail?.whereWeWere || "Où on en était"}</p>
        <div className="flex items-center gap-1.5">
          <select
            className="eu-select flex-1 min-w-0"
            value={cc.last_file_id ?? ""}
            onChange={(e) => setProgress(e.target.value ? Number(e.target.value) : null)}
            aria-label={t.courseDetail?.whereWeWere || "Où on en était"}
          >
            <option value="">{get("courseDetail.noDocument", "— Aucun document —")}</option>
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {fileKindLabel(f.kind)} · {f.name}
              </option>
            ))}
          </select>
          {cc.last_file_id != null && (
            <button onClick={reopen} className="eu-btn-primary eu-btn-sm shrink-0">
              {t.courseDetail?.reopen || "Reprendre"}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <p className="eu-t-label">{get("courseDetail.classNotes", "Notes pour cette classe")}</p>
          {savingNotes && (
            <span className="eu-t-label normal-case tracking-normal">
              {get("common.saving", "enregistrement…")}
            </span>
          )}
        </div>
        <textarea
          className="eu-textarea min-h-[60px] text-[13px]"
          placeholder={
            t.courseDetail?.classNotesPlaceholder ||
            "Ex : fini l'exercice p.47, distribuer le DM pour le 12, revoir les fonctions."
          }
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={saveNotes}
          aria-label={get("courseDetail.classNotes", "Notes pour cette classe")}
        />
      </div>

      {courseMatiere && (
        <button
          onClick={() => {
            tabs.open({
              kind: "class-content",
              title: fmt(get("courseDetail.contentTab", "Contenu {name}"), { name: cc.class_name }),
              params: { courseId, className: cc.class_name, matiere: courseMatiere },
            });
          }}
          className="eu-btn-ghost eu-btn-sm w-full"
          title={get("courseDetail.showPronoteContentsTitle", "Cahier de textes et documents Pronote")}
        >
          <BookIcon className="w-3.5 h-3.5" />
          {t.courseDetail?.showPronoteContents || "Contenu Pronote"}
        </button>
      )}
    </div>
  );
}
