import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useTabs } from "../lib/tabs";
import {
  api,
  type AppInfo,
  type Course,
  type FileItem,
  type Note,
  type QuickLink,
  type Reminder,
  type ScheduleEntry,
} from "../lib/api";
import { t } from "../lib/i18n";
import { greeting, longDate, relativeTime, fileKindEmoji } from "../lib/format";
import { EmptyState, Modal, SectionHeader, useToast } from "../components/ui";
import {
  BellIcon,
  BookIcon,
  CheckIcon,
  ClockIcon,
  DocIcon,
  FileIcon,
  LinkIcon,
  NoteIcon,
  PenIcon,
  PlusIcon,
  SearchIcon,
} from "../components/icons";

const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
};

export default function Dashboard({ info }: { info: AppInfo | null }) {
  const tabs = useTabs();
  const toast = useToast();
  const [classes, setClasses] = useState<ScheduleEntry[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [recent, setRecent] = useState<FileItem[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [docCount, setDocCount] = useState(0);
  const [links, setLinks] = useState<QuickLink[]>([]);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");

  const refresh = () => {
    api.getTodayClasses().then(setClasses).catch(() => {});
    api.listReminders().then(setReminders).catch(() => {});
    api.recentFiles(6).then(setRecent).catch(() => {});
    api.allNotes().then(setNotes).catch(() => {});
    api.listCourses().then(setCourses).catch(() => {});
    api.listFiles(null).then((f) => setDocCount(f.length)).catch(() => {});
    api.listLinks().then(setLinks).catch(() => {});
  };

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("eu:library-changed", onChange);
    return () => window.removeEventListener("eu:library-changed", onChange);
  }, []);

  const courseName = (id: number | null) => courses.find((c) => c.id === id)?.name;

  const addReminder = async () => {
    if (!newTitle.trim()) return;
    await api.createReminder(newTitle.trim(), newDue || null);
    setNewTitle("");
    setNewDue("");
    setAdding(false);
    toast(t.add + " : rappel", "success");
    refresh();
  };

  const toggle = async (r: Reminder) => {
    await api.toggleReminder(r.id, !r.done);
    if (!r.done) api.logEvent("reminder_done", r.title, null);
    refresh();
  };

  const openFile = async (f: FileItem) => {
    api.logEvent("file_open", f.name, f.course_id);
    if (f.kind === "board") tabs.open({ kind: "whiteboard", title: f.name, params: { fileId: f.id } });
    else if (f.kind === "pdf" || f.kind === "image")
      tabs.open({ kind: "pdf", title: f.name, params: { fileId: f.id, fileName: f.name } });
    else await api.openFile(f.id);
  };

  const pending = reminders.filter((r) => !r.done);

  // Smarter: surface the class happening now or coming up next.
  const nextClass = useMemo(() => {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const ongoing = classes.find((c) => c.start_time <= hhmm && c.end_time > hhmm);
    if (ongoing) return { c: ongoing, live: true as const };
    const upcoming = classes.find((c) => c.start_time > hhmm);
    return upcoming ? { c: upcoming, live: false as const } : null;
  }, [classes]);

  return (
    <div className="flex flex-col gap-8">
      <motion.header {...fadeUp} transition={{ duration: 0.4 }}>
        <p className="eu-sub mb-1 capitalize">{longDate()}</p>
        <h1 className="font-display text-3xl tracking-tight text-[#1f1f1f]">
          {greeting()}
        </h1>
        <p className="eu-sub mt-2">{t.tagline}</p>
      </motion.header>

      {nextClass && (
        <motion.button
          {...fadeUp}
          transition={{ duration: 0.4, delay: 0.03 }}
          onClick={() => tabs.open({ kind: "tools" })}
          className="relative overflow-hidden eu-card p-5 text-left flex items-center gap-4 hover:shadow-glow transition-all"
        >
          <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-[#fa520f]/10 blur-2xl" />
          <span className="grid place-items-center w-12 h-12 rounded-[12px] bg-[#fff8e0] text-[#fa520f]">
            <ClockIcon className="w-6 h-6" />
          </span>
          <div className="flex-1">
            <p className="text-[12px] font-medium text-[#fa520f]">
              {nextClass.live ? "En cours maintenant" : "Prochain cours"}
            </p>
            <p className="font-semibold text-eu-text">{nextClass.c.subject}</p>
            <p className="eu-sub">
              {nextClass.c.start_time} - {nextClass.c.end_time}
              {nextClass.c.room && ` · Salle ${nextClass.c.room}`}
            </p>
          </div>
        </motion.button>
      )}

      {/* Stats strip */}
      <motion.section {...fadeUp} transition={{ duration: 0.4, delay: 0.04 }} className="grid grid-cols-3 gap-3">
        <Stat label="Cours" value={courses.length} icon={<BookIcon className="w-5 h-5" />} onClick={() => tabs.open({ kind: "courses" })} />
        <Stat label="Documents" value={docCount} icon={<DocIcon className="w-5 h-5" />} onClick={() => tabs.open({ kind: "documents" })} />
        <Stat label="Notes" value={notes.length} icon={<NoteIcon className="w-5 h-5" />} onClick={() => tabs.open({ kind: "documents" })} />
      </motion.section>

      {/* Quick actions */}
      <motion.section {...fadeUp} transition={{ duration: 0.4, delay: 0.05 }}>
        <SectionHeader title={t.quickActions} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickAction icon={<PlusIcon />} label={t.newCourse} onClick={() => tabs.open({ kind: "courses" })} />
          <QuickAction icon={<SearchIcon />} label={t.search} onClick={() => tabs.open({ kind: "documents" })} />
          <QuickAction
            icon={<PenIcon />}
            label={t.whiteboard}
            onClick={() => tabs.open({ kind: "whiteboard", title: "Nouveau tableau", params: { isNew: true } })}
          />
          <QuickAction icon={<BellIcon />} label={t.newReminder} onClick={() => setAdding(true)} />
        </div>
      </motion.section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today */}
        <motion.section {...fadeUp} transition={{ duration: 0.4, delay: 0.1 }} className="eu-card p-5">
          <SectionHeader
            title={t.todayClasses}
            action={<span className="eu-chip"><ClockIcon className="w-3.5 h-3.5" />{classes.length}</span>}
          />
          {classes.length === 0 ? (
            <EmptyState icon={<BookIcon className="w-8 h-8" />} title={t.noClassesToday} />
          ) : (
            <ul className="flex flex-col gap-2">
              {classes.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-[#fffaeb] transition-colors"
                >
                  <div className="flex flex-col items-center justify-center w-14 shrink-0">
                    <span className="text-sm font-semibold text-[#fa520f]">{c.start_time}</span>
                    <span className="text-[11px] text-eu-muted">{c.end_time}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-eu-text truncate">{c.subject}</p>
                    {c.room && <p className="text-xs text-eu-muted">Salle {c.room}</p>}
                  </div>
                  {c.source === "pronote" && <span className="eu-chip">Pronote</span>}
                </li>
              ))}
            </ul>
          )}
        </motion.section>

        {/* Reminders */}
        <motion.section {...fadeUp} transition={{ duration: 0.4, delay: 0.15 }} className="eu-card p-5">
          <SectionHeader
            title={t.reminders}
            action={
              <button onClick={() => setAdding(true)} className="eu-btn-soft py-1.5 px-2.5 text-xs">
                <PlusIcon className="w-4 h-4" />
              </button>
            }
          />
          {pending.length === 0 ? (
            <EmptyState icon={<BellIcon className="w-8 h-8" />} title={t.noReminders} />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {pending.map((r) => (
                <li key={r.id} className="flex items-center gap-3 group">
                  <button
                    onClick={() => toggle(r)}
                    className="w-5 h-5 shrink-0 rounded-full border-2 border-[#ededed] hover:border-[#fa520f] flex items-center justify-center transition-colors"
                  >
                    <CheckIcon className="w-3 h-3 text-transparent group-hover:text-[#fa520f] group-hover:opacity-40" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-eu-text truncate">{r.title}</p>
                    {r.due_at && <p className="text-[11px] text-eu-muted">{r.due_at}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      </div>

      {/* Recent files */}
      <motion.section {...fadeUp} transition={{ duration: 0.4, delay: 0.2 }}>
        <SectionHeader title={t.recentFiles} />
        {recent.length === 0 ? (
          <div className="eu-card p-5">
            <EmptyState icon={<FileIcon className="w-8 h-8" />} title={t.noRecentFiles} />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {recent.map((f) => (
              <button
                key={f.id}
                onClick={() => openFile(f)}
                className="eu-card p-4 text-left hover:shadow-glow hover:-translate-y-0.5 transition-all"
              >
                <div className="text-2xl mb-2">{fileKindEmoji(f.kind)}</div>
                <p className="text-sm font-medium text-eu-text truncate">{f.name}</p>
                <p className="text-[11px] text-eu-muted mt-0.5">{relativeTime(f.added_at)}</p>
              </button>
            ))}
          </div>
        )}
      </motion.section>

      {/* Recent notes */}
      {notes.length > 0 && (
        <motion.section {...fadeUp} transition={{ duration: 0.4, delay: 0.24 }}>
          <SectionHeader title="Notes recentes" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {notes.slice(0, 4).map((n) => (
              <button
                key={n.id}
                onClick={() =>
                  n.course_id
                    ? tabs.open({ kind: "course", title: courseName(n.course_id) ?? "Cours", params: { courseId: n.course_id } })
                    : tabs.open({ kind: "courses" })
                }
                className="eu-card p-4 text-left hover:shadow-glow transition-all"
              >
                <div className="flex items-center gap-2">
                  <NoteIcon className="w-4 h-4 text-[#fa520f] shrink-0" />
                  <p className="font-medium text-eu-text truncate">{n.title || "Note"}</p>
                </div>
                <p className="eu-sub mt-1 line-clamp-2 text-[12.5px]">
                  {n.body.replace(/[#*`>_-]/g, "").trim().slice(0, 120) || "(vide)"}
                </p>
                <p className="text-[11px] text-eu-muted mt-1.5">
                  {n.course_id ? courseName(n.course_id) : "Sans cours"} · {relativeTime(n.updated_at)}
                </p>
              </button>
            ))}
          </div>
        </motion.section>
      )}

      {/* Quick links */}
      {links.length > 0 && (
        <motion.section {...fadeUp} transition={{ duration: 0.4, delay: 0.28 }}>
          <SectionHeader title={t.quickLinks} />
          <div className="flex flex-wrap gap-2">
            {links.map((l) => (
              <button key={l.id} onClick={() => api.openUrl(l.url)} className="eu-chip hover:brightness-105">
                <LinkIcon className="w-3.5 h-3.5" /> {l.label}
              </button>
            ))}
          </div>
        </motion.section>
      )}

      {info && (
        <p className="text-center text-[11px] text-[#a8a8a8]">
          {t.appName} v{info.version} - {info.data_dir}
        </p>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title={t.newReminder}>
        <div className="flex flex-col gap-3">
          <input
            autoFocus
            className="eu-input"
            placeholder="Ex : preparer le controle de mardi"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addReminder()}
          />
          <input
            className="eu-input"
            placeholder="Echeance (optionnel)"
            value={newDue}
            onChange={(e) => setNewDue(e.target.value)}
          />
          <div className="flex justify-end gap-2 mt-1">
            <button className="eu-btn-ghost" onClick={() => setAdding(false)}>
              {t.cancel}
            </button>
            <button className="eu-btn-primary" onClick={addReminder}>
              {t.add}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="eu-card p-4 flex items-center gap-3 hover:shadow-glow hover:-translate-y-0.5 transition-all text-left"
    >
      <span className="grid place-items-center w-10 h-10 rounded-lg bg-[#fff8e0] text-[#fa520f] shrink-0">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="font-display text-2xl text-eu-text leading-tight tabular-nums">{value}</p>
        <p className="text-[12px] text-eu-muted truncate">{label}</p>
      </div>
    </button>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="eu-card p-4 flex flex-col items-start gap-3 hover:shadow-glow hover:-translate-y-0.5 transition-all"
    >
      <span className="grid place-items-center w-10 h-10 rounded-lg bg-[#fff8e0] text-[#fa520f]">
        {icon}
      </span>
      <span className="text-sm font-medium text-eu-text">{label}</span>
    </button>
  );
}
