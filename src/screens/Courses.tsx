import { useCallback, useEffect, useMemo, useState, memo } from "react";
import { motion } from "framer-motion";
import { useTabs } from "../lib/tabs";
import { api, type Course } from "../lib/api";
import { t, get, fmt } from "../lib/i18n";
import {
  COURSE_COLORS,
  COURSE_ICONS,
  EmptyState,
  Loading,
  Modal,
  useToast,
} from "../components/ui";
import { Field, MetaDot, PageHeader, Panel, Segmented } from "../components/layout";
import { courseVisual } from "../lib/color";
import { useAppearance } from "../lib/theme";
import { ChevronRightIcon, BookIcon, PenIcon, PlusIcon } from "../components/icons";

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
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="eu-panel group relative flex overflow-hidden hover:border-line-strong transition-colors duration-fast"
    >
      <span aria-hidden className="w-1 shrink-0" style={{ background: visual.fg }} />
      <button
        type="button"
        onClick={() => onOpen(c)}
        className="flex-1 min-w-0 text-left p-[14px] pr-9"
      >
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
        aria-label={fmt(get("courses.editCourse", "Modifier {name}"), { name: c.name })}
        title={get("courses.editCourse", "Modifier le cours")}
        className="absolute top-2 right-2 eu-btn-quiet eu-btn-icon eu-btn-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-fast"
      >
        <PenIcon className="w-3.5 h-3.5" />
      </button>
      <ChevronRightIcon
        aria-hidden
        className="absolute bottom-3 right-2.5 w-4 h-4 text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity duration-fast"
      />
    </motion.div>
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
          placeholder={get("courses.namePlaceholder", "Nom du cours (ex : Mathématiques, NSI)")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onSubmit();
          }}
          aria-label={get("courses.name", "Nom du cours")}
        />
      </div>

      <Field label={get("courses.matiere", "Matière")}>
        <Segmented
          value={matiere}
          onChange={setMatiere}
          label={get("courses.matiere", "Matière")}
          options={MATIERES.map((m) => ({ value: m, label: m }))}
        />
      </Field>

      <Field
        label={get("courses.description", "Description")}
        hint={get("courses.descriptionHint", "Optionnel — s'affiche sur la carte du cours.")}
      >
        <textarea
          className="eu-textarea min-h-[64px]"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          aria-label={get("courses.description", "Description")}
        />
      </Field>

      <Field label={get("courses.color", "Couleur")}>
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

      <Field label={get("courses.icon", "Icône")}>
        <div className="flex flex-wrap gap-1.5">
          {COURSE_ICONS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setIconKey(key)}
              title={label}
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
          {t.common?.cancel || get("common.cancel", "Annuler")}
        </button>
        <button className="eu-btn-primary" onClick={onSubmit} disabled={!name.trim()}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

export default function Courses() {
  const tabs = useTabs();
  const toast = useToast();
  const { resolved } = useAppearance();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  // One dialog for both create and edit: `editing` holds the course being
  // modified, or null when creating. The two 80-line duplicated forms are gone.
  const [dialog, setDialog] = useState<"closed" | "create" | "edit">("closed");
  const [editing, setEditing] = useState<Course | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [matiere, setMatiere] = useState<Matiere>("Mathématiques");
  const [color, setColor] = useState(COURSE_COLORS[0]);
  const [iconKey, setIconKey] = useState("book");

  const refresh = useCallback(() => {
    api
      .listCourses()
      .then((c) => setCourses(Array.isArray(c) ? c : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("eu:course-changed", onChange);
    return () => window.removeEventListener("eu:course-changed", onChange);
  }, [refresh]);

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
        toast(get("courses.updated", "Cours modifié"), "success");
      } else {
        const created = await api.createCourse(name.trim(), iconKey, color, desc.trim(), matiere);
        if (!created?.id) {
          toast(get("messages.genericError", "Erreur"), "error");
          return;
        }
        toast(`${t.common?.newCourse || "Nouveau cours"} : ${name.trim()}`, "success");
      }
      window.dispatchEvent(new CustomEvent("eu:library-changed"));
      window.dispatchEvent(new CustomEvent("eu:course-changed"));
      close();
      refresh();
    } catch {
      toast(get("messages.genericError", "Erreur"), "error");
    }
  };

  const handleOpenCourse = useCallback(
    (c: Course) => {
      tabs.open({ kind: "course", title: c.name, params: { courseId: c.id } });
    },
    [tabs]
  );

  return (
    <>
      <PageHeader
        title={t.nav.courses}
        meta={
          <>
            <span>{fmt(get("courses.metaCount", "{count} cours"), { count: courses.length })}</span>
            <MetaDot />
            <span>{get("courses.subtitle", "Classes, séquences et casiers")}</span>
          </>
        }
        actions={
          <button onClick={openCreate} className="eu-btn-primary eu-btn-sm">
            <PlusIcon className="w-3.5 h-3.5" /> {t.common?.newCourse || "Nouveau cours"}
          </button>
        }
      />

      {loading ? (
        <Panel>
          <Loading label={get("courses.loading", "Chargement des cours…")} />
        </Panel>
      ) : courses.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<BookIcon className="w-4 h-4" />}
            title={get("courses.emptyTitle", "Aucun cours pour le moment")}
            hint={get(
              "courses.emptyHint",
              "Un cours rassemble un casier de documents, des notes, une progression par séquences, et les classes qui le suivent (noms Pronote exacts)."
            )}
            action={
              <button onClick={openCreate} className="eu-btn-primary eu-btn-sm">
                <PlusIcon className="w-3.5 h-3.5" /> {t.common?.newCourse || "Nouveau cours"}
              </button>
            }
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
        title={
          dialog === "edit"
            ? get("courses.editTitle", "Modifier le cours")
            : t.common?.newCourse || "Nouveau cours"
        }
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
          submitLabel={
            dialog === "edit" ? get("common.save", "Enregistrer") : t.common?.add || "Ajouter"
          }
        />
      </Modal>
    </>
  );
}
