import { useCallback, useEffect, useState, useMemo } from "react";
import { tabs } from "../stores/tabs";
import { openFile } from "../lib/files";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { q } from "../api/queries";
import {
  api,
  type CourseClass,
  type FileItem,
  type Note,
  type Sequence,
  type SequenceItem,
} from "../lib/api";
import { tr } from "../lib/i18n";
import { errorMessage } from "../lib/errors";
import { reportError } from "../lib/report";
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
const NO_NOTES: Note[] = [];
const NO_FILES: FileItem[] = [];
const NO_CLASSES: CourseClass[] = [];

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
  for (const c of raw || []) {
    if (!c || typeof c.name !== "string") continue;
    const n = c.name.trim();
    if (!isMainClass(n) || seen.has(n)) continue;
    seen.add(n);
    out.push({ ...c, name: n });
  }
  return out;
}

export default function CourseDetail({ courseId, visible = true }: { courseId: number; visible?: boolean }) {
  const toast = useToast();
  const confirmDlg = useConfirm();

  const queryClient = useQueryClient();
  const live = { subscribed: visible };
  const coursesQ = useQuery({ ...q.courses(), ...live });
  const notesQ = useQuery({ ...q.courseNotes(courseId), ...live });
  const filesQ = useQuery({ ...q.files(courseId), ...live });
  const classesQ = useQuery({ ...q.courseClasses(courseId), ...live });
  const course = coursesQ.data?.find((c) => c.id === courseId) ?? null;
  const notes = notesQ.data ?? NO_NOTES;
  const files = filesQ.data ?? NO_FILES;
  const courseClasses = classesQ.data ?? NO_CLASSES;
  const loading = coursesQ.isPending || notesQ.isPending || filesQ.isPending || classesQ.isPending;
  const [newClassName, setNewClassName] = useState("");
  // Pronote for class dropdown + subject (only while connected).
  const pronoteConnected = !!useQuery(q.pronoteStatus()).data?.connected;
  const pronoteClassesQ = useQuery({ ...q.pronoteClasses(), enabled: pronoteConnected && visible });
  const pronoteClasses = useMemo(
    () => (pronoteConnected ? sanitizePronoteClasses(pronoteClassesQ.data ?? []) : []),
    [pronoteConnected, pronoteClassesQ.data],
  );
  const [selectedPronoteClass, setSelectedPronoteClass] = useState("");

  // Attach existing global documents to this course's casier (avoids direct uploads from course page which had refresh issues)
  const [showAttach, setShowAttach] = useState(false);
  const [attachDocs, setAttachDocs] = useState<FileItem[]>([]);
  const [attachSelected, setAttachSelected] = useState<number[]>([]);

  const { resolved } = useAppearance();

  const refreshFiles = useCallback(
    () => queryClient.invalidateQueries({ queryKey: q.files(courseId).queryKey }),
    [queryClient, courseId],
  );
  const refreshClasses = useCallback(
    () => queryClient.invalidateQueries({ queryKey: q.courseClasses(courseId).queryKey }),
    [queryClient, courseId],
  );
  const refreshAll = useCallback(() => {
    void refreshFiles();
    void refreshClasses();
  }, [refreshFiles, refreshClasses]);

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
        toast(tr("messages.genericError"), "error");
        return;
      }
      toast(tr("courseDetail.attachSuccess", { name: classToAttach }), "success");
      setNewClassName("");
      setSelectedPronoteClass("");
      refreshClasses();
    } catch (err) {
      reportError("course.attachClass", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    }
  };

  const detachClass = async (cc: CourseClass) => {
    const ok = await confirmDlg.ask({
      title: tr("courseDetail.confirmDetach", { name: cc.class_name }),
      message: tr("courseDetail.confirmDetach", { name: cc.class_name }),
      confirmLabel: tr("common.delete"),
      danger: true,
    });
    if (!ok) return;
    await api.detachCourseClass(cc.id);
    refreshClasses();
  };

  const updateMatiere = async (newMatiere: string) => {
    if (!course) return;
    await api.updateCourse({ ...course, matiere: newMatiere });
    window.dispatchEvent(new CustomEvent("eu:course-changed"));
    toast(`Matière mise à jour : ${newMatiere || "(aucune)"}`, "success");
  };

  const openAttachModal = async () => {
    try {
      // Load global docs + this course's current casier so we can exclude already-attached ones
      const [docs, currentCasier] = await Promise.all([api.listFiles(null), api.listFiles(courseId)]);
      const attachedNames = new Set((currentCasier || []).map((f: any) => (f.name || "").toLowerCase()));
      const available = (docs || []).filter((d: any) => !attachedNames.has((d.name || "").toLowerCase()));
      setAttachDocs(available);
      setAttachSelected([]);
      setShowAttach(true);
    } catch (err) {
      reportError("course.listDocs", err);
      toast(errorMessage(err, "Impossible de lister les documents"), "error");
    }
  };

  const toggleAttachDoc = (id: number) => {
    setAttachSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
  };

  const doAttachDocs = async () => {
    if (attachSelected.length === 0) return;
    try {
      // Copied on the Rust side: the webview never handles the documents' paths.
      const added = await api.attachFilesToCourse(courseId, attachSelected);
      if (added.length) {
        added.forEach((f) => api.logEvent("file_import", f.name, courseId));
        toast(tr("courseDetail.importedFilesToast", { count: added.length }), "success");
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
        <EmptyState title={tr("courseDetail.notFoundTitle")} hint={tr("courseDetail.notFoundHint")} />
      </div>
    );
  }

  const visual = courseVisual(course.color, resolved === "dark");
  const CourseIcon = COURSE_ICONS.find((i) => i.key === (course.emoji || "book"))?.Icon ?? BookIcon;

  return (
    <>
      <PageHeader
        onBack={() => tabs.open({ kind: "courses" })}
        backLabel={tr("nav.courses")}
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
            <span>{tr("courseDetail.metaClasses", { count: courseClasses.length })}</span>
            <MetaDot />
            <span>{tr("courseDetail.metaFiles", { count: files.length })}</span>
            <MetaDot />
            <span>{tr("courseDetail.metaNotes", { count: notes.length })}</span>
            {course.description && (
              <>
                <MetaDot />
                <span>{course.description}</span>
              </>
            )}
          </>
        }
        actions={
          <>
            <Segmented
              value={course.matiere || ""}
              onChange={(v) => void updateMatiere(v)}
              label={tr("courses.matiere")}
              options={[
                { value: "", label: tr("common.none") },
                { value: "Mathématiques", label: "Maths" },
                { value: "NSI", label: "NSI" },
                { value: "Maths expertes", label: "Expertes" },
              ]}
            />
            <button
              onClick={async () => {
                const ok = await confirmDlg.ask({
                  title: tr("courseDetail.confirmDeleteCourse", {
                    name: course.name,
                  }),
                  message: tr("courseDetail.confirmDeleteCourseBody"),
                  confirmLabel: tr("common.delete"),
                  danger: true,
                });
                if (!ok) return;
                await api.deleteCourse(courseId);
                window.dispatchEvent(new CustomEvent("eu:course-changed"));
                tabs.open({ kind: "courses" });
                tabs.close(`course:${courseId}`);
              }}
              aria-label={tr("common.delete")}
              data-tip={tr("courseDetail.deleteCourse", { name: course.name })}
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
        title={tr("courseDetail.lockerTitle")}
        icon={<FileIcon className="w-3.5 h-3.5" />}
        action={
          <button onClick={openAttachModal} className="eu-btn-quiet eu-btn-sm">
            <PlusIcon className="w-3.5 h-3.5" /> {tr("courseDetail.importToLocker")}
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
        title={tr("courseDetail.courseNotesHeader")}
        icon={<PenIcon className="w-3.5 h-3.5" />}
        action={
          <button
            onClick={() =>
              tabs.open({
                kind: "note",
                title: tr("common.newNote"),
                params: { isNew: true, courseId },
              })
            }
            className="eu-btn-quiet eu-btn-sm"
          >
            <PlusIcon className="w-3.5 h-3.5" /> {tr("common.newNote")}
          </button>
        }
      >
        {notes.length === 0 ? (
          <EmptyState
            icon={<PenIcon className="w-4 h-4" />}
            title={tr("courseDetail.noNotesTitle")}
            hint={tr("courseDetail.noNotesHint")}
            action={
              <button
                onClick={() =>
                  tabs.open({
                    kind: "note",
                    title: tr("common.newNote"),
                    params: { isNew: true, courseId },
                  })
                }
                className="eu-btn-primary eu-btn-sm"
              >
                <PlusIcon className="w-3.5 h-3.5" /> {tr("common.newNote")}
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
                  {n.title || tr("courseDetail.noTitle")}
                </span>
                <span className="eu-t-caption shrink-0">{relativeTime(n.updated_at)}</span>
              </button>
            ))}
          </div>
        )}
      </Panel>

      {/* Classes attachées + système de progression + notes prof par classe */}
      <Panel title={tr("courseDetail.attachedClassesHeader")} icon={<BookIcon className="w-3.5 h-3.5" />}>
        <div className="eu-panel-pad flex flex-col gap-4">
          <div className="flex gap-2">
            {availablePronoteClasses.length > 0 ? (
              <select
                className="eu-select flex-1"
                value={selectedPronoteClass}
                onChange={(e) => setSelectedPronoteClass(e.target.value)}
                aria-label={tr("courseDetail.choosePronoteClass")}
              >
                <option value="">{tr("courseDetail.choosePronoteClass")}</option>
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
                    ? tr("courseDetail.allPronoteAttached")
                    : tr("courseDetail.classNamePlaceholder")
                }
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") attachClass();
                }}
                aria-label={tr("courseDetail.classNamePlaceholder")}
              />
            )}
            <button
              className="eu-btn-primary eu-btn-sm"
              onClick={attachClass}
              disabled={availablePronoteClasses.length > 0 ? !selectedPronoteClass : !newClassName.trim()}
            >
              <PlusIcon className="w-3.5 h-3.5" />
              {tr("courseDetail.attach")}
            </button>
          </div>

          {courseClasses.length === 0 ? (
            <EmptyState
              icon={<BookIcon className="w-4 h-4" />}
              title={tr("courseDetail.noClassesAttachedTitle")}
              hint={tr("courseDetail.noClassesAttachedHint")}
            />
          ) : (
            <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-3">
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
        title={tr("courseDetail.attachDocsTitle")}
        width="max-w-xl"
      >
        <div className="space-y-3">
          <p className="eu-t-body text-ink-muted">{tr("courseDetail.attachDocsHint")}</p>
          {attachDocs.length === 0 ? (
            <p className="eu-t-body text-ink-muted">Aucun document dans la bibliothèque globale.</p>
          ) : (
            <div className="max-h-72 overflow-auto border border-line rounded divide-y divide-line/60">
              {attachDocs.map((d) => {
                const isSel = attachSelected.includes(d.id);
                return (
                  <div
                    key={d.id}
                    className={`flex items-center gap-3 p-2 eu-t-body hover:bg-hover cursor-pointer ${isSel ? "bg-panel-alt" : ""}`}
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
                      <div className="eu-t-caption text-ink-muted">
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
            <button onClick={doAttachDocs} disabled={attachSelected.length === 0} className="eu-btn-primary">
              {attachSelected.length > 0
                ? `Attacher ${attachSelected.length} document(s)`
                : "Attacher des documents"}
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
  const toast = useToast();
  const confirmDlg = useConfirm();

  if (files.length === 0) {
    return (
      <EmptyState
        icon={<FileIcon className="w-4 h-4" />}
        title={tr("courseDetail.noFilesTitle")}
        hint={tr("courseDetail.noFilesHint")}
        action={
          <button onClick={onAttach} className="eu-btn-primary eu-btn-sm">
            <PlusIcon className="w-3.5 h-3.5" />
            {tr("courseDetail.importToLocker")}
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
            onClick={() => openFile({ ...f, courseId: f.course_id })}
            className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
            data-tip={f.name}
            aria-label={f.name}
          >
            <FileKindIcon kind={f.kind} className="w-4 h-4 text-ink-faint shrink-0" />
            <span className="eu-t-body text-ink truncate">{f.name}</span>
          </button>
          <span className="eu-t-caption shrink-0 hidden @2xl:block">
            {fileKindLabel(f.kind)} · {humanSize(f.size)} · {relativeTime(f.added_at)}
          </span>
          <button
            onClick={async () => {
              const ok = await confirmDlg.ask({
                title: tr("common.delete"),
                message: tr("courseDetail.confirmDeleteFile", {
                  name: f.name,
                }),
                confirmLabel: tr("common.delete"),
                danger: true,
              });
              if (!ok) return;
              try {
                await api.deleteFile(f.id);
                tabs.closeFile(f.id);
                window.dispatchEvent(new CustomEvent("eu:library-changed"));
                onChanged();
              } catch (err: any) {
                toast(err?.message || tr("messages.genericError"), "error");
              }
            }}
            aria-label={`${tr("common.delete")} — ${f.name}`}
            data-tip={tr("common.delete")}
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
      const [s, i] = await Promise.all([api.listSequences(courseId), api.listSequenceItems(courseId)]);
      setSequences(Array.isArray(s) ? s : []);
      setItems(Array.isArray(i) ? i : []);
    } catch (err) {
      reportError("course.sequences", err);
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
    } catch (err) {
      reportError("course.addSequence", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
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
    } catch (err) {
      reportError("course.addItem", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    }
  };

  /** Which classes have stopped at a given step. */
  const classesAt = (itemId: number) => courseClasses.filter((cc) => cc.last_item_id === itemId);

  const markClassHere = async (className: string, itemId: number | null) => {
    try {
      await api.setCourseClassItem(courseId, className, itemId);
      await reload();
    } catch (err) {
      reportError("course.markClass", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    }
  };

  const openItemFile = (item: SequenceItem) => {
    if (item.file_id == null) return;
    const name = item.file_name || tr("common.document");
    openFile({ id: item.file_id, name, kind: item.file_kind || "file", courseId });
  };

  return (
    <Panel
      title={tr("sequences.title")}
      icon={<LayersIcon className="w-3.5 h-3.5" />}
      action={
        <div className="flex items-center gap-1.5">
          <input
            className="eu-input eu-field-sm w-[190px]"
            placeholder={tr("sequences.newPlaceholder")}
            value={newSequence}
            onChange={(e) => setNewSequence(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addSequence();
            }}
            aria-label={tr("sequences.newPlaceholder")}
          />
          <button
            className="eu-btn-ghost eu-btn-sm"
            onClick={() => void addSequence()}
            disabled={!newSequence.trim()}
          >
            <PlusIcon className="w-3.5 h-3.5" />
            {tr("sequences.add")}
          </button>
        </div>
      }
    >
      {loading ? (
        <Loading label={tr("common.loading")} size="small" />
      ) : sequences.length === 0 ? (
        <EmptyState
          icon={<LayersIcon className="w-4 h-4" />}
          title={tr("sequences.emptyTitle")}
          hint={tr("sequences.emptyHint")}
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
                    {tr("sequences.stepCount", { count: seqItems.length })}
                  </span>
                  <div className="eu-row-actions eu-row-tools flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => void api.moveSequence(courseId, seq.id, -1).then(reload)}
                      disabled={seqIndex === 0}
                      aria-label={tr("sequences.moveUp")}
                      data-tip={tr("sequences.moveUp")}
                      className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                    >
                      <ChevronDownIcon className="w-3.5 h-3.5 rotate-180" />
                    </button>
                    <button
                      onClick={() => void api.moveSequence(courseId, seq.id, 1).then(reload)}
                      disabled={seqIndex === sequences.length - 1}
                      aria-label={tr("sequences.moveDown")}
                      data-tip={tr("sequences.moveDown")}
                      className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                    >
                      <ChevronDownIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await confirmDlg.ask({
                          title: tr("sequences.deleteTitle"),
                          message: tr("sequences.deleteMessage", { name: seq.title }),
                          confirmLabel: tr("common.delete"),
                          danger: true,
                        });
                        if (!ok) return;
                        await api.deleteSequence(seq.id);
                        await reload();
                      }}
                      aria-label={`${tr("common.delete")} — ${seq.title}`}
                      data-tip={tr("common.delete")}
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
                          <span className="eu-t-caption w-5 shrink-0">{itemIndex + 1}</span>
                          <span className="eu-t-body text-ink truncate flex-1 min-w-24">{item.title}</span>
                          {item.file_id != null && (
                            <button
                              onClick={() => openItemFile(item)}
                              className="eu-chip hover:text-ink min-w-0 max-w-[22ch]"
                              data-tip={item.file_name || ""}
                              aria-label={item.file_name || ""}
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
                          <div className="eu-row-actions eu-row-tools flex items-center gap-0.5 shrink-0">
                            {courseClasses.length > 0 && (
                              <select
                                value=""
                                onChange={(e) => {
                                  if (e.target.value) void markClassHere(e.target.value, item.id);
                                }}
                                className="eu-select eu-field-sm w-[104px]"
                                aria-label={tr("sequences.markClass")}
                                data-tip={tr("sequences.markClass")}
                              >
                                <option value="">{tr("sequences.markClassShort")}</option>
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
                              aria-label={tr("sequences.moveUp")}
                              className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                            >
                              <ChevronDownIcon className="w-3.5 h-3.5 rotate-180" />
                            </button>
                            <button
                              onClick={() => void api.moveSequenceItem(seq.id, item.id, 1).then(reload)}
                              disabled={itemIndex === seqItems.length - 1}
                              aria-label={tr("sequences.moveDown")}
                              className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                            >
                              <ChevronDownIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={async () => {
                                await api.deleteSequenceItem(item.id);
                                await reload();
                              }}
                              aria-label={`${tr("common.delete")} — ${item.title}`}
                              data-tip={tr("common.delete")}
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
                          placeholder={tr("sequences.stepPlaceholder")}
                          value={newItem}
                          onChange={(e) => setNewItem(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void addItem(seq.id);
                            if (e.key === "Escape") setAddingTo(null);
                          }}
                          aria-label={tr("sequences.stepPlaceholder")}
                        />
                        <select
                          className="eu-select w-[170px]"
                          value={newItemFile}
                          onChange={(e) =>
                            setNewItemFile(e.target.value === "" ? "" : Number(e.target.value))
                          }
                          aria-label={tr("sequences.stepFile")}
                        >
                          <option value="">{tr("sequences.noFile")}</option>
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
                          {tr("common.add")}
                        </button>
                        <button className="eu-btn-quiet eu-btn-sm" onClick={() => setAddingTo(null)}>
                          {tr("common.cancel")}
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
                        <span className="eu-t-meta">{tr("sequences.addStep")}</span>
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
    const name = cc.last_file_name || "Document";
    openFile({ id: cc.last_file_id, name, kind: cc.last_file_kind || "file", courseId }, "progress_reopen");
  };

  return (
    <div className="eu-panel-alt p-3.5 flex flex-col gap-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 shrink-0 grid place-items-center rounded border border-line bg-panel font-mono text-small font-semibold text-ink">
            {cc.class_name.slice(0, 3)}
          </span>
          <div className="min-w-0">
            <p className="eu-t-section text-ink truncate">{cc.class_name}</p>
            <p className="eu-t-caption">
              {cc.progress_updated_at
                ? tr("courseDetail.updated", {
                    when: relativeTime(cc.progress_updated_at),
                  })
                : "—"}
            </p>
          </div>
        </div>
        <button
          onClick={() => onDetach(cc)}
          aria-label={tr("courseDetail.detach", { name: cc.class_name })}
          data-tip={tr("courseDetail.detachTitle")}
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
        <p className="eu-t-label">{tr("courseDetail.whereWeWere")}</p>
        <div className="flex items-center gap-1.5">
          <select
            className="eu-select flex-1 min-w-0"
            value={cc.last_file_id ?? ""}
            onChange={(e) => setProgress(e.target.value ? Number(e.target.value) : null)}
            aria-label={tr("courseDetail.whereWeWere")}
          >
            <option value="">{tr("courseDetail.noDocument")}</option>
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {fileKindLabel(f.kind)} · {f.name}
              </option>
            ))}
          </select>
          {cc.last_file_id != null && (
            <button onClick={reopen} className="eu-btn-primary eu-btn-sm shrink-0">
              {tr("courseDetail.reopen")}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <p className="eu-t-label">{tr("courseDetail.classNotes")}</p>
          {savingNotes && <span className="eu-t-caption">{tr("common.saving")}</span>}
        </div>
        <textarea
          className="eu-textarea min-h-[60px]"
          placeholder={tr("courseDetail.classNotesPlaceholder")}
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={saveNotes}
          aria-label={tr("courseDetail.classNotes")}
        />
      </div>

      {courseMatiere && (
        <button
          onClick={() => {
            tabs.open({
              kind: "class-content",
              title: tr("courseDetail.contentTab", { name: cc.class_name }),
              params: { courseId, className: cc.class_name, matiere: courseMatiere },
            });
          }}
          className="eu-btn-ghost eu-btn-sm w-full"
          data-tip={tr("courseDetail.showPronoteContentsTitle")}
        >
          <BookIcon className="w-3.5 h-3.5" />
          {tr("courseDetail.showPronoteContents")}
        </button>
      )}
    </div>
  );
}
