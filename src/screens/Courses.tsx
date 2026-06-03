import { useCallback, useEffect, useMemo, useState, memo } from "react";
import { motion } from "framer-motion";
import { useTabs } from "../lib/tabs";
import { api, type Course } from "../lib/api";
import { t } from "../lib/i18n";
import {
  COURSE_COLORS,
  COURSE_ICONS,
  EmptyState,
  Loading,
  Modal,
  useToast,
} from "../components/ui";
import { ArrowRightIcon, BookIcon, PenIcon, PlusIcon } from "../components/icons";

export default function Courses() {
  const tabs = useTabs();
  const toast = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COURSE_COLORS[0]);
  const [desc, setDesc] = useState("");
  const [matiere, setMatiere] = useState<"Mathématiques" | "NSI">("Mathématiques");
  const [iconKey, setIconKey] = useState("book");

  // Edit state for popup
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(COURSE_COLORS[0]);
  const [editDesc, setEditDesc] = useState("");
  const [editMatiere, setEditMatiere] = useState<"Mathématiques" | "NSI">("Mathématiques");
  const [editIconKey, setEditIconKey] = useState("book");

  const refresh = () => {
    setLoading(true);
    api.listCourses().then(setCourses).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => {
    refresh();
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    await api.createCourse(name.trim(), iconKey, color, desc.trim(), matiere);
    window.dispatchEvent(new CustomEvent("eu:library-changed"));
    toast(`${t.common?.newCourse || "Nouveau cours"} : ${name}`, "success");
    setName("");
    setDesc("");
    setMatiere("Mathématiques");
    setIconKey("book");
    setOpen(false);
    refresh();
  };

  const openEdit = (c: Course) => {
    setEditId(c.id);
    setEditName(c.name);
    setEditColor(c.color);
    setEditDesc(c.description || "");
    setEditMatiere((c.matiere as any) || "Mathématiques");
    setEditIconKey(c.emoji || "book");
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editName.trim() || !editId) return;
    const courseToUpdate = courses.find((c) => c.id === editId);
    if (!courseToUpdate) return;
    await api.updateCourse({
      ...courseToUpdate,
      name: editName.trim(),
      emoji: editIconKey,
      color: editColor,
      description: editDesc.trim(),
      matiere: editMatiere,
    });
    window.dispatchEvent(new CustomEvent("eu:library-changed")); // ensure fresh lists everywhere (triggers cache invalidation + listeners)
    toast("Cours modifié", "success");
    setEditOpen(false);
    // reset edit
    setEditId(null);
    setEditName("");
    setEditDesc("");
    setEditMatiere("Mathématiques");
    setEditIconKey("book");
    refresh();
  };

  const closeEdit = () => {
    setEditOpen(false);
    setEditId(null);
    setEditName("");
    setEditDesc("");
    setEditMatiere("Mathématiques");
    setEditIconKey("book");
  };

  // Memoized card to avoid re-renders of static cards when list parent updates (e.g. other state)
  const MemoCourseCard = memo(function MemoCourseCard({ c, onOpen, onEdit }: { c: Course; onOpen: (c: Course) => void; onEdit: (c: Course) => void }) {
    const IconComp = useMemo(() => {
      const found = COURSE_ICONS.find((i) => i.key === (c.emoji || "book"));
      return found ? found.Icon : BookIcon;
    }, [c.emoji]);

    return (
      <motion.button
        key={c.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        onClick={() => onOpen(c)}
        className="new-card p-5 text-left group hover:border-accent-sunset/40 hover:-translate-y-0.5 active:scale-[0.995] active:border-accent-sunset/30 transition-all duration-150"
      >
        <div className="flex items-start justify-between">
          <span
            className="grid place-items-center w-10 h-10 rounded-none border border-[rgba(15,0,0,0.12)]"
            style={{ background: `${c.color}22`, color: c.color }}
          >
            <IconComp className="w-5 h-5" strokeWidth={1.8} />
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(c);
              }}
              className="opacity-0 group-hover:opacity-60 hover:opacity-100 p-1 text-mute hover:text-primary transition-all"
              title="Modifier le cours"
            >
              <PenIcon className="w-3.5 h-3.5" />
            </button>
            <ArrowRightIcon className="w-5 h-5 text-body-mute opacity-40 group-hover:text-accent-sunset group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-150" />
          </div>
        </div>
        <h3 className="mt-4 font-semibold text-primary">{c.name}</h3>
        {c.matiere && (
          <span className="inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded bg-surface-container text-on-surface/80">{c.matiere}</span>
        )}
        {c.description && (
          <p className="text-body-mute text-sm mt-1 line-clamp-2">{c.description}</p>
        )}
        <div className="mt-3 h-1 rounded-full" style={{ background: c.color }} />
      </motion.button>
    );
  });

  // Stable callbacks for memo cards
  const handleOpenCourse = useCallback((c: Course) => {
    tabs.open({ kind: "course", title: c.name, params: { courseId: c.id } });
  }, [tabs]);

  const handleEditCourse = useCallback((c: Course) => {
    openEdit(c);
  }, [openEdit]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display-sm text-display-sm tracking-tight text-primary">{t.nav.courses}</h1>
          <p className="text-body-mute text-sm mt-1">Cours (matières) avec casier de documents + classes attachées (noms Pronote exacts) + progression et notes prof par classe.</p>
        </div>
        <button onClick={() => { setIconKey("book"); setOpen(true); }} className="new-btn-primary">
          <PlusIcon className="w-4 h-4" /> {t.common?.newCourse || "Nouveau cours"}
        </button>
      </header>

      {loading ? (
        <div className="new-card">
          <Loading label="Chargement des cours…" />
        </div>
      ) : courses.length === 0 ? (
        <div className="new-card">
          <EmptyState
            icon={<BookIcon className="w-9 h-9" />}
            title="Aucun cours pour le moment"
            hint="Créez un cours : il aura un casier de documents, des notes, et vous attacherez des classes (noms exacts Pronote) pour le suivi de progression par groupe."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((c) => (
            <MemoCourseCard key={c.id} c={c} onOpen={handleOpenCourse} onEdit={handleEditCourse} />
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t.common?.newCourse || "Nouveau cours"}>
        <div className="flex flex-col gap-4">
          <input
            autoFocus
            className="new-input"
            placeholder="Nom du cours (ex : Mathématiques, NSI, Physique)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            className="new-input min-h-[72px] resize-none"
            placeholder="Description (optionnel)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          {/* Beautiful minimal selector matching theme and creation values */}
          <div className="new-segment text-xs">
            <button
              onClick={() => setMatiere("Mathématiques")}
              className={`px-2.5 py-0.5 rounded transition-colors ${matiere === "Mathématiques" ? "bg-primary text-white" : "hover:bg-surface-container/60"}`}
            >
              Mathématiques
            </button>
            <button
              onClick={() => setMatiere("NSI")}
              className={`px-2.5 py-0.5 rounded transition-colors ${matiere === "NSI" ? "bg-primary text-white" : "hover:bg-surface-container/60"}`}
            >
              NSI
            </button>
          </div>
          <div>
            <p className="text-body-mute text-sm mb-2">Couleur</p>
            <div className="flex flex-wrap gap-2">
              {COURSE_COLORS.map((col) => (
                <button
                  key={col}
                  onClick={() => setColor(col)}
                  className={`w-8 h-8 rounded-full transition-transform border border-hairline ${
                    color === col ? "ring-2 ring-offset-2 ring-accent-sunset ring-offset-surface scale-110" : ""
                  }`}
                  style={{ background: col }}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="text-body-mute text-sm mb-2">Icône (SVG)</p>
            <div className="flex flex-wrap gap-1">
              {COURSE_ICONS.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => setIconKey(key)}
                  title={label}
                  className={`w-9 h-9 rounded border flex items-center justify-center transition ${
                    iconKey === key ? "ring-2 ring-accent-sunset bg-surface" : "border-hairline hover:bg-surface-container/50"
                  }`}
                >
                  <Icon className="w-5 h-5" strokeWidth={1.8} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-1">
            <button className="new-btn-ghost" onClick={() => setOpen(false)}>
              {t.common?.cancel || "Annuler"}
            </button>
            <button className="new-btn-primary" onClick={create}>
              {t.common?.add || "Ajouter"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit popup for cours: name, description, matiere, color, icon */}
      <Modal open={editOpen} onClose={closeEdit} title="Modifier le cours">
        <div className="flex flex-col gap-4">
          <input
            autoFocus
            className="new-input"
            placeholder="Nom du cours"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <textarea
            className="new-input min-h-[72px] resize-none"
            placeholder="Description (optionnel)"
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
          />
          <div className="new-segment text-xs">
            <button
              onClick={() => setEditMatiere("Mathématiques")}
              className={`px-2.5 py-0.5 rounded transition-colors ${editMatiere === "Mathématiques" ? "bg-primary text-white" : "hover:bg-surface-container/60"}`}
            >
              Mathématiques
            </button>
            <button
              onClick={() => setEditMatiere("NSI")}
              className={`px-2.5 py-0.5 rounded transition-colors ${editMatiere === "NSI" ? "bg-primary text-white" : "hover:bg-surface-container/60"}`}
            >
              NSI
            </button>
          </div>
          <div>
            <p className="text-body-mute text-sm mb-2">Couleur</p>
            <div className="flex flex-wrap gap-2">
              {COURSE_COLORS.map((col) => (
                <button
                  key={col}
                  onClick={() => setEditColor(col)}
                  className={`w-8 h-8 rounded-full transition-transform border border-hairline ${
                    editColor === col ? "ring-2 ring-offset-2 ring-accent-sunset ring-offset-surface scale-110" : ""
                  }`}
                  style={{ background: col }}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="text-body-mute text-sm mb-2">Icône (SVG)</p>
            <div className="flex flex-wrap gap-1">
              {COURSE_ICONS.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => setEditIconKey(key)}
                  title={label}
                  className={`w-9 h-9 rounded border flex items-center justify-center transition ${
                    editIconKey === key ? "ring-2 ring-accent-sunset bg-surface" : "border-hairline hover:bg-surface-container/50"
                  }`}
                >
                  <Icon className="w-5 h-5" strokeWidth={1.8} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-1">
            <button className="new-btn-ghost" onClick={closeEdit}>
              {t.common?.cancel || "Annuler"}
            </button>
            <button className="new-btn-primary" onClick={saveEdit} disabled={!editName.trim()}>
              Enregistrer
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
