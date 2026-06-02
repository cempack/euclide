import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTabs } from "../lib/tabs";
import { api, type Course } from "../lib/api";
import { t } from "../lib/i18n";
import {
  COURSE_COLORS,
  COURSE_EMOJIS,
  EmptyState,
  Modal,
  useToast,
} from "../components/ui";
import { ArrowRightIcon, BookIcon, PlusIcon } from "../components/icons";

export default function Courses() {
  const tabs = useTabs();
  const toast = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(COURSE_EMOJIS[0]);
  const [color, setColor] = useState(COURSE_COLORS[0]);
  const [desc, setDesc] = useState("");

  const refresh = () => api.listCourses().then(setCourses).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    await api.createCourse(name.trim(), emoji, color, desc.trim());
    toast(`${t.newCourse} : ${name}`, "success");
    setName("");
    setDesc("");
    setOpen(false);
    refresh();
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-eu-text">{t.nav.courses}</h1>
          <p className="eu-sub mt-1">Un espace par classe ou matiere.</p>
        </div>
        <button onClick={() => setOpen(true)} className="eu-btn-primary">
          <PlusIcon className="w-4 h-4" /> {t.newCourse}
        </button>
      </header>

      {courses.length === 0 ? (
        <div className="eu-card p-6">
          <EmptyState
            icon={<BookIcon className="w-9 h-9" />}
            title="Aucun cours pour le moment"
            hint="Creez votre premier espace de cours pour rassembler notes, fichiers et lecons."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((c, i) => (
            <motion.button
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.04 }}
              onClick={() => tabs.open({ kind: "course", title: c.name, params: { courseId: c.id } })}
              className="eu-card p-5 text-left group hover:shadow-glow hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-start justify-between">
                <span
                  className="grid place-items-center w-12 h-12 rounded-[12px] text-2xl"
                  style={{ background: `${c.color}22` }}
                >
                  {c.emoji}
                </span>
                <ArrowRightIcon className="w-5 h-5 text-[#a8a8a8] opacity-40 group-hover:text-[#fa520f] group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </div>
              <h3 className="mt-4 font-semibold text-eu-text">{c.name}</h3>
              {c.description && (
                <p className="eu-sub mt-1 line-clamp-2">{c.description}</p>
              )}
              <div className="mt-3 h-1 rounded-full" style={{ background: c.color }} />
            </motion.button>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={t.newCourse}>
        <div className="flex flex-col gap-4">
          <input
            autoFocus
            className="eu-input"
            placeholder="Nom du cours (ex : Mathematiques 4e B)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <textarea
            className="eu-input min-h-[72px] resize-none"
            placeholder="Description (optionnel)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <div>
            <p className="eu-sub mb-2">Icone</p>
            <div className="flex flex-wrap gap-1.5">
              {COURSE_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className={`w-9 h-9 rounded-lg text-lg grid place-items-center transition-all ${
                    emoji === e ? "bg-[#fff8e0] ring-2 ring-[#fa520f]/40" : "hover:bg-[#fffaeb]"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="eu-sub mb-2">Couleur</p>
            <div className="flex flex-wrap gap-2">
              {COURSE_COLORS.map((col) => (
                <button
                  key={col}
                  onClick={() => setColor(col)}
                  className={`w-8 h-8 rounded-full transition-transform ${
                    color === col ? "ring-2 ring-offset-2 ring-[#fa520f] ring-offset-white scale-110" : ""
                  }`}
                  style={{ background: col }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-1">
            <button className="eu-btn-ghost" onClick={() => setOpen(false)}>
              {t.cancel}
            </button>
            <button className="eu-btn-primary" onClick={create}>
              {t.add}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
