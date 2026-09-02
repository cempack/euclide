import { useEffect, useState, useMemo, useCallback } from "react";
import { useTabs } from "../lib/tabs";
import {
  api,
  type AppInfo,
  type Course,
  type CourseClass,
  type FileItem,
  type Note,
  type PronoteStatus,
  type QuickLink,
  type Reminder,
  type ScheduleEntry,
  type RecapData,
} from "../lib/api";
import { t, get, fmt } from "../lib/i18n";
import {
  classProgress,
  focusClass,
  formatDueLabel,
  getClassStatus,
  humanMinutes,
  longDate,
  minutesRemaining,
  minutesUntil,
  relativeTime,
  greeting,
} from "../lib/format";
import { courseVisual } from "../lib/color";
import { useAppearance } from "../lib/theme";
import { COURSE_ICONS, EmptyState, useToast, useConfirm } from "../components/ui";
import {
  MetaDot,
  PageHeader,
  Panel,
  StatStrip,
  StatTile,
} from "../components/layout";
import {
  BellIcon,
  BookIcon,
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  DescriptionIcon,
  FileKindIcon,
  LayersIcon,
  LinkIcon,
  NoteIcon,
  PenIcon,
  PlayIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";
import { Favicon } from "../components/Favicon";

/**
 * Le tableau de bord.
 *
 * Hierarchy, in the order a teacher needs it between two bells:
 *   1. what is happening now (the class in progress, and how to resume it),
 *   2. what must be done (reminders due),
 *   3. where I left off (recent documents),
 *   4. the inventory (counts, quick links).
 *
 * State that used to live here as widgets — Pronote connection, screen lock,
 * the mini activity recap — now lives in the window status bar and in Outils,
 * so it is reachable from every screen instead of only from this one.
 */
export default function Dashboard({ info: _info }: { info?: AppInfo | null }) {
  const tabs = useTabs();
  const toast = useToast();
  const confirm = useConfirm();
  const { resolved } = useAppearance();

  const [classes, setClasses] = useState<ScheduleEntry[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [docCount, setDocCount] = useState(0);
  const [links, setLinks] = useState<QuickLink[]>([]);
  const [recentFiles, setRecentFiles] = useState<FileItem[]>([]);
  const [pronoteStatus, setPronoteStatus] = useState<PronoteStatus | null>(null);
  const [recap, setRecap] = useState<RecapData | null>(null);
  const [remoteIcons, setRemoteIcons] = useState(false);

  // Live tick so "in progress", countdowns and the gauge move without a refetch.
  const [nowTick, setNowTick] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const refresh = useCallback(() => {
    api.getTodayClasses().then(setClasses).catch(() => {});
    api.listReminders().then((r) => setReminders(Array.isArray(r) ? r : [])).catch(() => {});
    api.allNotes().then((n) => setNotes(Array.isArray(n) ? n : [])).catch(() => {});
    api.listCourses().then((c) => setCourses(Array.isArray(c) ? c : [])).catch(() => {});
    api.listFiles(null).then((f) => setDocCount(Array.isArray(f) ? f.length : 0)).catch(() => {});
    api.listLinks().then((l) => setLinks(Array.isArray(l) ? l : [])).catch(() => {});
    api.recentFiles(6).then((f) => setRecentFiles(Array.isArray(f) ? f : [])).catch(() => {});
    api.pronoteStatus().then(setPronoteStatus).catch(() => {});
    api.getRecap("today").then(setRecap).catch(() => {});
    api.getSetting("remote_favicons").then((v) => setRemoteIcons(v === "1")).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    const events = [
      "eu:library-changed",
      "eu:quicklinks-changed",
      "eu:schedule-changed",
      "eu:reminders-changed",
      "eu:course-changed",
      "eu:pronote-changed",
    ];
    events.forEach((ev) => window.addEventListener(ev, onChange));
    return () => events.forEach((ev) => window.removeEventListener(ev, onChange));
  }, [refresh]);

  // ---- reminders -----------------------------------------------------------

  const toggle = async (r: Reminder) => {
    const markingDone = !r.done;
    setReminders((prev) => prev.map((x) => (x.id === r.id ? { ...x, done: markingDone } : x)));
    try {
      await api.toggleReminder(r.id, markingDone);
      if (markingDone) {
        api.logEvent("reminder_done", r.title, r.course_id);
        const cheers: string[] =
          t.dashboard?.cheers && t.dashboard.cheers.length ? t.dashboard.cheers : ["Bien joué !"];
        toast(cheers[Math.floor(Math.random() * cheers.length)], "success");
      }
      window.dispatchEvent(new CustomEvent("eu:reminders-changed"));
    } catch {
      setReminders((prev) => prev.map((x) => (x.id === r.id ? { ...x, done: !markingDone } : x)));
      toast(get("messages.genericError", "Erreur"), "error");
    }
  };

  const deleteReminder = async (id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const ok = await confirm.ask({
      title: t.dashboard?.confirmDeleteReminder || "Supprimer ce rappel ?",
      message: t.dashboard?.confirmDeleteReminder || "Supprimer ce rappel ?",
      confirmLabel: get("common.delete", "Supprimer"),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteReminder(id);
      window.dispatchEvent(new CustomEvent("eu:reminders-changed"));
      refresh();
    } catch {
      toast(t.dashboard?.errorDeleteReminder || "Erreur lors de la suppression", "error");
    }
  };

  const pending = reminders.filter((r) => !r.done);

  // ---- opening things ------------------------------------------------------

  /** Best-effort match between a schedule entry and a course of the library. */
  const courseForEntry = useCallback(
    (entry: ScheduleEntry): Course | undefined => {
      const sub = (entry.subject || "").toLowerCase();
      if (typeof entry.course_id === "number") {
        const byId = courses.find((c) => c.id === entry.course_id);
        if (byId) return byId;
      }
      return (
        courses.find((c) => sub.includes(c.name.toLowerCase())) ||
        courses.find((c) => c.matiere && sub.includes(c.matiere.toLowerCase().slice(0, 8)))
      );
    },
    [courses]
  );

  const openFromSchedule = useCallback(
    async (entry: ScheduleEntry) => {
      const course = courseForEntry(entry);
      if (!course) {
        tabs.open({ kind: "courses" });
        return;
      }
      try {
        const attached = await api.listCourseClasses(course.id);
        const hit = attached.find(
          (cc) =>
            (entry.subject || "").toLowerCase().includes(cc.class_name.toLowerCase()) ||
            (entry.subject || "").includes(cc.class_name)
        );
        if (hit) {
          tabs.open({
            kind: "class-content",
            title: hit.class_name,
            params: { courseId: course.id, className: hit.class_name, matiere: course.matiere },
          });
          return;
        }
      } catch {
        // fall through to the course page
      }
      tabs.open({ kind: "course", title: course.name, params: { courseId: course.id } });
    },
    [courseForEntry, tabs]
  );

  const openFile = useCallback(
    (f: { id: number; name: string; kind: string; course_id?: number | null }) => {
      api.logEvent("file_open", f.name, f.course_id ?? null);
      if (f.kind === "board") {
        tabs.open({ kind: "whiteboard", title: f.name, params: { fileId: f.id } });
      } else if (f.kind === "pdf" || f.kind === "image") {
        tabs.open({ kind: "pdf", title: f.name, params: { fileId: f.id, fileName: f.name } });
      } else {
        api.openFile(f.id);
      }
    },
    [tabs]
  );

  const importDocs = async () => {
    try {
      toast(get("messages.importing", "Import…"), "info");
      const added = await api.importFiles(null);
      const count = Array.isArray(added) ? added.length : 0;
      if (count === 0) {
        toast(get("messages.importError", "Import impossible (sélection annulée ?)"), "error");
        return;
      }
      toast(fmt(get("messages.imported", "{count} importé(s)"), { count }), "success");
      await api.indexImportedPdfs(Array.isArray(added) ? added : []).catch(() => {});
      window.dispatchEvent(new CustomEvent("eu:library-changed"));
    } catch {
      toast(get("messages.importError", "Import impossible (sélection annulée ?)"), "error");
    }
  };

  // ---- « maintenant » -------------------------------------------------------

  const focus = useMemo(() => focusClass(classes, nowTick), [classes, nowTick]);
  const focusCourse = focus ? courseForEntry(focus.entry) : undefined;
  const [focusClasses, setFocusClasses] = useState<CourseClass[]>([]);

  // Per-class progress for the class in front of us: this is the data that
  // powers « Reprendre ». It already existed but was only visible three clicks
  // deep, inside the course page.
  useEffect(() => {
    if (!focusCourse) {
      setFocusClasses([]);
      return;
    }
    let cancelled = false;
    api
      .listCourseClasses(focusCourse.id)
      .then((list) => {
        if (!cancelled) setFocusClasses(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setFocusClasses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [focusCourse?.id]);

  const focusClassRow = useMemo(() => {
    if (!focus) return undefined;
    const subject = (focus.entry.subject || "").toLowerCase();
    return focusClasses.find(
      (cc) => subject.includes(cc.class_name.toLowerCase()) || focus.entry.subject.includes(cc.class_name)
    );
  }, [focus, focusClasses]);

  return (
    <>
      <PageHeader
        title={greeting(
          nowTick,
          pronoteStatus?.connected ? pronoteStatus.account_name : null
        )}
        meta={
          <>
            <span>{longDate(nowTick)}</span>
            <MetaDot />
            <span>
              {classes.length === 0
                ? get("dashboard.metaNoClass", "aucun cours")
                : fmt(get("dashboard.metaClasses", "{count} cours"), { count: classes.length })}
            </span>
            <MetaDot />
            <span>
              {fmt(get("dashboard.metaReminders", "{count} rappels"), { count: pending.length })}
            </span>
            {pronoteStatus && (
              <>
                <MetaDot />
                <span className={pronoteStatus.connected ? "text-ok" : ""}>
                  {pronoteStatus.connected
                    ? get("status.pronoteOn", "pronote connecté")
                    : get("status.pronoteOff", "pronote hors ligne")}
                </span>
              </>
            )}
          </>
        }
        actions={
          <>
            <button
              className="eu-btn-ghost eu-btn-sm"
              onClick={() =>
                tabs.open({
                  kind: "note",
                  title: t.common?.newNote || "Nouvelle note",
                  params: { isNew: true },
                })
              }
            >
              <NoteIcon className="w-3.5 h-3.5" />
              {get("dashboard.newNote", "Note")}
            </button>
            <button
              className="eu-btn-ghost eu-btn-sm"
              onClick={() =>
                tabs.open({
                  kind: "whiteboard",
                  title: get("app.tabWhiteboard", "Tableau"),
                  params: { isNew: true },
                })
              }
            >
              <PenIcon className="w-3.5 h-3.5" />
              {get("dashboard.newBoard", "Tableau")}
            </button>
            <button className="eu-btn-primary eu-btn-sm" onClick={importDocs}>
              <PlusIcon className="w-3.5 h-3.5" />
              {t.common?.importFiles || "Importer"}
            </button>
          </>
        }
      />

      {focus && (
        <NowCard
          entry={focus.entry}
          state={focus.state}
          now={nowTick}
          course={focusCourse}
          courseClass={focusClassRow}
          dark={resolved === "dark"}
          onOpenContent={() => void openFromSchedule(focus.entry)}
          onResume={openFile}
          onOpenBoard={() =>
            tabs.open({
              kind: "whiteboard",
              title: get("app.tabWhiteboard", "Tableau"),
              params: { isNew: true, courseId: focusCourse?.id },
            })
          }
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <Panel
            title={get("dashboard.todayTitle", "Aujourd'hui")}
            icon={<CalendarIcon className="w-3.5 h-3.5" />}
            action={
              <button
                className="eu-btn-quiet eu-btn-sm"
                onClick={() => tabs.open({ kind: "settings" })}
              >
                {get("dashboard.schedule", "Emploi du temps")}
                <ChevronRightIcon className="w-3 h-3" />
              </button>
            }
          >
            {classes.length === 0 ? (
              <EmptyState
                icon={<CalendarIcon className="w-4 h-4" />}
                title={get("dashboard.noClassTitle", "Aucun cours aujourd'hui")}
                hint={
                  t.dashboard?.noClassesToday ||
                  "Profitez du calme — ou ajoutez vos cours dans l'emploi du temps."
                }
                action={
                  <button
                    className="eu-btn-ghost eu-btn-sm"
                    onClick={() => tabs.open({ kind: "settings" })}
                  >
                    {get("dashboard.schedule", "Emploi du temps")}
                  </button>
                }
              />
            ) : (
              <div className="eu-divide">
                {classes.map((c, i) => (
                  <ScheduleRow
                    key={c.id ?? i}
                    entry={c}
                    now={nowTick}
                    isFocus={focus?.entry === c}
                    onOpen={() => void openFromSchedule(c)}
                  />
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title={get("dashboard.quickLinks", "Liens rapides")}
            icon={<LinkIcon className="w-3.5 h-3.5" />}
            action={
              <button className="eu-btn-quiet eu-btn-sm" onClick={() => tabs.open({ kind: "tools" })}>
                {get("common.manage", "Gérer")}
                <ChevronRightIcon className="w-3 h-3" />
              </button>
            }
          >
            {links.length === 0 ? (
              <EmptyState
                title={get("dashboard.noLinksTitle", "Aucun lien rapide")}
                hint={get(
                  "dashboard.noLinksHint",
                  "Ajoutez depuis Outils les adresses que vous ouvrez tous les jours."
                )}
                action={
                  <button
                    className="eu-btn-ghost eu-btn-sm"
                    onClick={() => tabs.open({ kind: "tools" })}
                  >
                    {get("common.add", "Ajouter")}
                  </button>
                }
              />
            ) : (
              <div className="flex flex-wrap gap-1.5 p-[14px]">
                {links.slice(0, 8).map((l) => (
                  <button
                    key={l.id}
                    onClick={() => api.openUrl(l.url)}
                    className="eu-btn-ghost eu-btn-sm"
                    title={l.url}
                  >
                    <Favicon url={l.url} className="w-4 h-4 text-[9px]" remote={remoteIcons} />
                    <span className="truncate max-w-[18ch]">{l.label}</span>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <Panel
            title={t.nav?.reminders || "Rappels"}
            icon={<BellIcon className="w-3.5 h-3.5" />}
            action={
              <button
                className="eu-btn-quiet eu-btn-sm"
                onClick={() => tabs.open({ kind: "reminders" })}
                aria-label={get("common.add", "Ajouter")}
              >
                <PlusIcon className="w-3.5 h-3.5" />
              </button>
            }
          >
            {pending.length === 0 ? (
              <EmptyState
                title={get("dashboard.noRemindersTitle", "Rien à retenir")}
                hint={t.dashboard?.noReminders || "Aucun rappel en attente."}
                action={
                  <button
                    className="eu-btn-ghost eu-btn-sm"
                    onClick={() => tabs.open({ kind: "reminders" })}
                  >
                    {t.common?.newReminder || "Nouveau rappel"}
                  </button>
                }
              />
            ) : (
              <div className="eu-divide">
                {pending.slice(0, 6).map((r) => {
                  const due = formatDueLabel(r.due_at);
                  const course = courses.find((c) => c.id === r.course_id);
                  return (
                    <div key={r.id} className="eu-row-hover group">
                      <button
                        onClick={() => toggle(r)}
                        aria-label={`${get("reminders.markDone", "Marquer fait")} — ${r.title}`}
                        title={get("reminders.markDone", "Marquer fait")}
                        className="w-4 h-4 shrink-0 rounded-sm border border-line-strong hover:border-ok hover:bg-ok-soft transition-colors duration-fast"
                      />
                      <span className="eu-t-body text-ink truncate flex-1">{r.title}</span>
                      {course && (
                        <span
                          className="w-2 h-2 rounded-sm shrink-0"
                          style={{ background: courseVisual(course.color, resolved === "dark").fg }}
                          title={course.name}
                        />
                      )}
                      {due.text && (
                        <span
                          className={
                            due.tone === "over"
                              ? "eu-chip-danger"
                              : due.tone === "soon"
                              ? "eu-chip-warn"
                              : "eu-chip"
                          }
                        >
                          {due.text}
                        </span>
                      )}
                      <button
                        onClick={(e) => deleteReminder(r.id, e)}
                        aria-label={`${get("common.delete", "Supprimer")} — ${r.title}`}
                        title={get("common.delete", "Supprimer")}
                        className="eu-row-actions eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel
            title={get("dashboard.resumeTitle", "Reprendre")}
            icon={<ClockIcon className="w-3.5 h-3.5" />}
            action={
              <button
                className="eu-btn-quiet eu-btn-sm"
                onClick={() => tabs.open({ kind: "documents" })}
              >
                {t.nav?.documents || "Documents"}
                <ChevronRightIcon className="w-3 h-3" />
              </button>
            }
          >
            {recentFiles.length === 0 ? (
              <EmptyState
                title={get("dashboard.noRecentTitle", "Rien d'ouvert récemment")}
                hint={get(
                  "dashboard.noRecentHint",
                  "Importez des PDF, des images ou créez un tableau : ils apparaîtront ici."
                )}
                action={
                  <button className="eu-btn-ghost eu-btn-sm" onClick={importDocs}>
                    {t.common?.importFiles || "Importer"}
                  </button>
                }
              />
            ) : (
              <div className="eu-divide">
                {recentFiles.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => openFile(f)}
                    className="eu-row-hover w-full text-left"
                    title={f.name}
                  >
                    <FileKindIcon kind={f.kind} className="w-4 h-4 text-ink-faint shrink-0" />
                    <span className="eu-t-body text-ink truncate flex-1">{f.name}</span>
                    <span className="eu-t-label normal-case tracking-normal shrink-0">
                      {relativeTime(f.added_at)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <StatStrip>
        <StatTile
          icon={<BookIcon className="w-4 h-4" />}
          value={courses.length}
          label={t.nav?.courses || "Cours"}
          onClick={() => tabs.open({ kind: "courses" })}
        />
        <StatTile
          icon={<DescriptionIcon className="w-4 h-4" />}
          value={docCount}
          label={t.nav?.documents || "Documents"}
          onClick={() => tabs.open({ kind: "documents" })}
        />
        <StatTile
          icon={<NoteIcon className="w-4 h-4" />}
          value={notes.length}
          label={get("nav.notes", "Notes")}
          onClick={() => tabs.open({ kind: "documents", params: { filter: "note" } })}
        />
        <StatTile
          icon={<ClockIcon className="w-4 h-4" />}
          value={
            <span className="flex items-baseline gap-0.5">
              {Math.floor((recap?.active_minutes ?? 0) / 60)}
              <span className="text-[16px] text-ink-faint font-normal">h</span>
              {String((recap?.active_minutes ?? 0) % 60).padStart(2, "0")}
            </span>
          }
          label={get("dashboard.activeToday", "Aujourd'hui")}
          hint={`${get("nav.recap", "Bilan")} →`}
          onClick={() => tabs.open({ kind: "recap", title: get("nav.recap", "Bilan") })}
        />
      </StatStrip>
    </>
  );
}

// ---------------------------------------------------------------------------
// « Maintenant » — the class in progress (or the next one), and the two actions
// that matter at that moment: resume the document, open the cahier de textes.
// ---------------------------------------------------------------------------

function NowCard({
  entry,
  state,
  now,
  course,
  courseClass,
  dark,
  onOpenContent,
  onResume,
  onOpenBoard,
}: {
  entry: ScheduleEntry;
  state: "current" | "next";
  now: Date;
  course?: Course;
  courseClass?: CourseClass;
  dark: boolean;
  onOpenContent: () => void;
  onResume: (f: { id: number; name: string; kind: string; course_id?: number | null }) => void;
  onOpenBoard: () => void;
}) {
  const visual = courseVisual(course?.color, dark);
  const remaining = state === "current" ? minutesRemaining(entry, now) : null;
  const until = state === "next" ? minutesUntil(entry.start_time, now) : null;
  const progress = state === "current" ? classProgress(entry, now) : 0;
  const resumeFile =
    courseClass?.last_file_id != null
      ? {
          id: courseClass.last_file_id,
          name: courseClass.last_file_name || get("common.document", "Document"),
          kind: courseClass.last_file_kind || "file",
          course_id: course?.id ?? null,
        }
      : null;
  const Icon = COURSE_ICONS.find((i) => i.key === (course?.emoji || "book"))?.Icon ?? BookIcon;

  return (
    <section className="eu-panel flex overflow-hidden">
      <span aria-hidden className="w-1 shrink-0" style={{ background: visual.fg }} />
      <div className="flex-1 min-w-0 p-[18px]">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="eu-t-label">
            {state === "current"
              ? get("dashboard.nowLabel", "En cours")
              : get("dashboard.nextLabel", "Prochain cours")}
          </span>
          <span className={state === "current" ? "eu-chip-warn" : "eu-chip"}>
            {entry.start_time}–{entry.end_time}
          </span>
          {state === "current" && remaining != null && (
            <span className="eu-t-label normal-case tracking-normal text-warn">
              {fmt(get("status.remaining", "reste {time}"), { time: humanMinutes(remaining) })}
            </span>
          )}
          {state === "next" && until != null && (
            <span className="eu-t-label normal-case tracking-normal">
              {fmt(get("status.inTime", "dans {time}"), { time: humanMinutes(until) })}
            </span>
          )}
        </div>

        <h2 className="mt-2 flex items-center gap-2.5 min-w-0">
          <span
            className="w-7 h-7 shrink-0 grid place-items-center rounded border"
            style={{ background: visual.tint, borderColor: visual.border, color: visual.fg }}
          >
            <Icon className="w-4 h-4" strokeWidth={1.8} />
          </span>
          <span className="text-[20px] font-semibold tracking-[-0.018em] text-ink truncate">
            {entry.subject}
          </span>
          {entry.room && <span className="eu-chip shrink-0">{entry.room}</span>}
        </h2>

        {state === "current" && (
          <div className="eu-gauge mt-3.5">
            <i style={{ width: `${progress}%`, background: visual.fg }} />
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap mt-3.5">
          {resumeFile ? (
            <button className="eu-btn-primary eu-btn-sm" onClick={() => onResume(resumeFile)}>
              <PlayIcon className="w-3.5 h-3.5" />
              <span className="truncate max-w-[26ch]">
                {fmt(get("dashboard.resumeFile", "Reprendre · {name}"), { name: resumeFile.name })}
              </span>
            </button>
          ) : (
            course && (
              <button className="eu-btn-ghost eu-btn-sm" onClick={onOpenContent}>
                <LayersIcon className="w-3.5 h-3.5" />
                {get("dashboard.setProgress", "Définir la progression")}
              </button>
            )
          )}
          <button className="eu-btn-ghost eu-btn-sm" onClick={onOpenContent}>
            <BookIcon className="w-3.5 h-3.5" />
            {course
              ? get("dashboard.openContent", "Cahier de textes")
              : get("dashboard.linkCourse", "Associer un cours")}
          </button>
          <button className="eu-btn-ghost eu-btn-sm" onClick={onOpenBoard}>
            <PenIcon className="w-3.5 h-3.5" />
            {get("nav.whiteboard", "Tableau blanc")}
          </button>
          {courseClass?.last_item_title && (
            <span className="eu-t-meta ml-auto truncate max-w-[34ch]">
              {courseClass.last_sequence_title
                ? `${courseClass.last_sequence_title} — ${courseClass.last_item_title}`
                : courseClass.last_item_title}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// One line of today's schedule.
// ---------------------------------------------------------------------------

function ScheduleRow({
  entry,
  now,
  isFocus,
  onOpen,
}: {
  entry: ScheduleEntry;
  now: Date;
  isFocus: boolean;
  onOpen: () => void;
}) {
  const status = getClassStatus(entry, now);
  const isCurrent = status === "current";
  const mins = status === "upcoming" ? minutesUntil(entry.start_time, now) : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`eu-row-hover w-full text-left ${status === "past" ? "opacity-55" : ""} ${
        isCurrent ? "bg-warn-soft hover:bg-warn-soft" : ""
      }`}
    >
      <span
        aria-hidden
        className={`w-0.5 self-stretch rounded-sm shrink-0 ${
          isCurrent ? "bg-warn-solid" : isFocus ? "bg-line-strong" : "bg-line"
        }`}
      />
      <span className="eu-t-num text-[11.5px] text-ink-faint w-[86px] shrink-0">
        {entry.start_time}–{entry.end_time}
      </span>
      <span className="eu-t-body text-ink font-medium truncate flex-1">{entry.subject}</span>
      {entry.room && <span className="eu-chip shrink-0 hidden sm:inline-flex">{entry.room}</span>}
      <span className="eu-t-label normal-case tracking-normal shrink-0 w-[78px] text-right">
        {isCurrent
          ? get("dashboard.inProgress", "en cours")
          : status === "past"
          ? get("dashboard.past", "passé")
          : mins != null
          ? fmt(get("status.inTime", "dans {time}"), { time: humanMinutes(mins) })
          : ""}
      </span>
    </button>
  );
}
