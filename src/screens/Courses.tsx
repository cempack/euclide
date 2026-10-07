import { useCallback, useMemo, useState, memo } from "react";
import { tabs } from "../stores/tabs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { q } from "../api/queries";
import { api, type Course } from "../lib/api";
import { tr } from "../lib/i18n";
import { errorMessage } from "../lib/errors";
import { reportError } from "../lib/report";
import { COURSE_COLORS, COURSE_ICONS, EmptyState, Loading, Modal, useToast } from "../components/ui";
import { Field, MetaDot, PageHeader, Panel, Segmented } from "../components/layout";
import { courseVisual } from "../lib/color";
import { useAppearance } from "../lib/theme";
import { ChevronRightIcon, BookIcon, PenIcon, PlusIcon } from "../components/icons";

const NO_COURSES: Course[] = [];

type Matiere = "Mathématiques" | "NSI" | "Maths expertes";
const MATIERES: Matiere[] = ["Mathématiques", "NSI", "Maths expertes"];

// Hoisted at module scope so memo() stays stable across renders of Courses.
const CourseCard = memo(function CourseCard({
  c,
  dark,
  onOpen,
  onEdit,
}: {
  c: Course;
  dark: boolean;
  onOpen: (c: Course) => void;
  onEdit: (c: Course) => void;
}) {
  const IconComp = useMemo(() => {
    const found = COURSE_ICONS.find((i) => i.key === (c.emoji || "book"));
    return found ? found.Icon : BookIcon;
  }, [c.emoji]);
  const visual = useMemo(() => courseVisual(c.color, dark), [c.color, dark]);

  return (
    <div className="eu-panel eu-enter group relative flex overflow-hidden hover:border-line-strong transition-colors duration-fast">
      <span aria-hidden className="w-1 shrink-0" style={{ background: visual.fg }} />
      <button type="button" onClick={() => onOpen(c)} className="flex-1 min-w-0 text-left p-[14px] pr-9">
        <span
          className="grid place-items-center w-8 h-8 rounded border"
          style={{ background: visual.tint, borderColor: visual.border, color: visual.fg }}
        >
          <IconComp className="w-4 h-4" strokeWidth={1.8} />
        </span>
        <h3 className="eu-t-section text-ink mt-3 truncate">{c.name}</h3>
        <p className="eu-t-meta mt-1 flex items-center gap-2 flex-wrap">
          {c.matiere && <span>{c.matiere}</span>}
        </p>
        {c.description && <p className="eu-t-meta mt-1.5 line-clamp-2">{c.description}</p>}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit(c);
        }}
        aria-label={tr("courses.editCourse", { name: c.name })}
        data-tip={tr("courses.editCourse")}
        className="absolute top-2 right-2 eu-btn-quiet eu-btn-icon eu-btn-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-fast"
      >
        <PenIcon className="w-3.5 h-3.5" />
      </button>
      <ChevronRightIcon
        aria-hidden
        className="absolute bottom-3 right-2.5 w-4 h-4 text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity duration-fast"
      />
    </div>
  );
});

/** Shared body of the create and edit dialogs — they were duplicated. */
function CourseForm({
  name,
  setName,
  desc,
  setDesc,
  matiere,
  setMatiere,
  color,
  setColor,
  iconKey,
  setIconKey,
  dark,
  onCancel,
  onSubmit,
  submitLabel,
}: {
  name: string;
  setName: (v: string) => void;
  desc: string;
  setDesc: (v: string) => void;
  matiere: Matiere;
  setMatiere: (v: Matiere) => void;
  color: string;
  setColor: (v: string) => void;
  iconKey: string;
  setIconKey: (v: string) => void;
  dark: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  const preview = courseVisual(color, dark);
  const PreviewIcon = COURSE_ICONS.find((i) => i.key === iconKey)?.Icon ?? BookIcon;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span
          className="grid place-items-center w-10 h-10 shrink-0 rounded border"
          style={{ background: preview.tint, borderColor: preview.border, color: preview.fg }}
        >
          <PreviewIcon className="w-5 h-5" strokeWidth={1.8} />
        </span>
        <input
          autoFocus
          className="eu-input"
          placeholder={tr("courses.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onSubmit();
          }}
          aria-label={tr("courses.name")}
        />
      </div>

      <Field label={tr("courses.matiere")}>
        <Segmented
          value={matiere}
          onChange={setMatiere}
          label={tr("courses.matiere")}
          options={MATIERES.map((m) => ({ value: m, label: m }))}
        />
      </Field>

      <Field label={tr("courses.description")} hint={tr("courses.descriptionHint")}>
        <textarea
          className="eu-textarea min-h-[64px]"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          aria-label={tr("courses.description")}
        />
      </Field>

      <Field label={tr("courses.color")}>
        <div className="flex flex-wrap gap-1.5">
          {COURSE_COLORS.map((col) => (
            <button
              key={col}
              type="button"
              onClick={() => setColor(col)}
              aria-label={col}
              aria-pressed={color === col}
              className={`w-7 h-7 rounded border transition-transform duration-fast ${
                color === col ? "border-ink scale-110" : "border-line hover:scale-105"
              }`}
              style={{ background: col }}
            />
          ))}
        </div>
      </Field>

      <Field label={tr("courses.icon")}>
        <div className="flex flex-wrap gap-1.5">
          {COURSE_ICONS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setIconKey(key)}
              data-tip={label}
              aria-label={label}
              aria-pressed={iconKey === key}
              className={`w-8 h-8 grid place-items-center rounded border transition-colors duration-fast ${
                iconKey === key
                  ? "border-ink bg-panel-alt text-ink"
                  : "border-line text-ink-muted hover:bg-panel-alt"
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={1.8} />
            </button>
          ))}
        </div>
      </Field>

      <div className="flex justify-end gap-2 mt-1">
        <button className="eu-btn-ghost" onClick={onCancel}>
          {tr("common.cancel")}
        </button>
        <button className="eu-btn-primary" onClick={onSubmit} disabled={!name.trim()}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

export default function Courses() {
  const toast = useToast();
  const { resolved } = useAppearance();
  const queryClient = useQueryClient();
  const coursesQ = useQuery(q.courses());
  const courses = coursesQ.data ?? NO_COURSES;
  const loading = coursesQ.isPending;

  // One dialog for both create and edit: `editing` holds the course being
  // modified, or null when creating. The two 80-line duplicated forms are gone.
  const [dialog, setDialog] = useState<"closed" | "create" | "edit">("closed");
  const [editing, setEditing] = useState<Course | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [matiere, setMatiere] = useState<Matiere>("Mathématiques");
  const [color, setColor] = useState(COURSE_COLORS[0]);
  const [iconKey, setIconKey] = useState("book");

  const refresh = () => void queryClient.invalidateQueries({ queryKey: q.courses().queryKey });

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDesc("");
    setMatiere("Mathématiques");
    setColor(COURSE_COLORS[courses.length % COURSE_COLORS.length]);
    setIconKey("book");
    setDialog("create");
  };

  const openEdit = useCallback((c: Course) => {
    setEditing(c);
    setName(c.name);
    setDesc(c.description || "");
    setMatiere((c.matiere as Matiere) || "Mathématiques");
    setColor(c.color || COURSE_COLORS[0]);
    setIconKey(c.emoji || "book");
    setDialog("edit");
  }, []);

  const close = () => setDialog("closed");

  const submit = async () => {
    if (!name.trim()) return;
    try {
      if (editing) {
        await api.updateCourse({
          ...editing,
          name: name.trim(),
          emoji: iconKey,
          color,
          description: desc.trim(),
          matiere,
        });
        toast(tr("courses.updated"), "success");
      } else {
        const created = await api.createCourse(name.trim(), iconKey, color, desc.trim(), matiere);
        if (!created?.id) {
          toast(tr("messages.genericError"), "error");
          return;
        }
        toast(`${tr("common.newCourse")} : ${name.trim()}`, "success");
      }
      window.dispatchEvent(new CustomEvent("eu:library-changed"));
      window.dispatchEvent(new CustomEvent("eu:course-changed"));
      close();
      refresh();
    } catch (err) {
      reportError("courses.save", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    }
  };

  const handleOpenCourse = useCallback((c: Course) => {
    tabs.open({ kind: "course", title: c.name, params: { courseId: c.id } });
  }, []);

  return (
    <>
      <PageHeader
        title={tr("nav.courses")}
        meta={
          <>
            <span>{tr("courses.metaCount", { count: courses.length })}</span>
            <MetaDot />
            <span>{tr("courses.subtitle")}</span>
          </>
        }
        actions={
          <button onClick={openCreate} className="eu-btn-primary eu-btn-sm">
            <PlusIcon className="w-3.5 h-3.5" /> {tr("common.newCourse")}
          </button>
        }
      />

      {loading ? (
        <Panel>
          <Loading label={tr("courses.loading")} />
        </Panel>
      ) : courses.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<BookIcon className="w-4 h-4" />}
            title={tr("courses.emptyTitle")}
            hint={tr("courses.emptyHint")}
            action={
              <button onClick={openCreate} className="eu-btn-primary eu-btn-sm">
                <PlusIcon className="w-3.5 h-3.5" /> {tr("common.newCourse")}
              </button>
            }
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
          {courses.map((c) => (
            <CourseCard
              key={c.id}
              c={c}
              dark={resolved === "dark"}
              onOpen={handleOpenCourse}
              onEdit={openEdit}
            />
          ))}
        </div>
      )}

      <Modal
        open={dialog !== "closed"}
        onClose={close}
        title={dialog === "edit" ? tr("courses.editTitle") : tr("common.newCourse")}
      >
        <CourseForm
          name={name}
          setName={setName}
          desc={desc}
          setDesc={setDesc}
          matiere={matiere}
          setMatiere={setMatiere}
          color={color}
          setColor={setColor}
          iconKey={iconKey}
          setIconKey={setIconKey}
          dark={resolved === "dark"}
          onCancel={close}
          onSubmit={submit}
          submitLabel={dialog === "edit" ? tr("common.save") : tr("common.add")}
        />
      </Modal>
    </>
  );
}
