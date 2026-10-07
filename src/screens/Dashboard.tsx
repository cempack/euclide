import { useEffect, useState, useMemo, useCallback } from "react";
import { tabs } from "../stores/tabs";
import { useImportFiles } from "../shell/useImportFiles";
import { openFile } from "../lib/files";
import { api, type Reminder, type ScheduleEntry } from "../lib/api";
import { appReady } from "../lib/perf";
import { tr } from "../lib/i18n";
import { errorMessage } from "../lib/errors";
import { logged, reportError } from "../lib/report";
import {
  focusClass,
  formatDueLabel,
  getClassStatus,
  humanMinutes,
  longDate,
  minutesUntil,
  relativeTime,
  greeting,
  cheer,
} from "../lib/format";
import { courseVisual } from "../lib/color";
import { useAppearance } from "../lib/theme";
import { EmptyState, useToast, useConfirm } from "../components/ui";
import { MetaDot, PageHeader, Panel, StatStrip, StatTile } from "../components/layout";
import {
  BellIcon,
  BookIcon,
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  DescriptionIcon,
  FileKindIcon,
  LinkIcon,
  NoteIcon,
  PenIcon,
  PlusIcon,
  TrashIcon,
} from "../components/icons";
import { Favicon, remoteFaviconsEnabled } from "../components/Favicon";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { q } from "../api/queries";
import { NowCard, type NowCardActions } from "../features/classroom/NowCard";
import { placeEntry, stepAfter, teachingOrder } from "../features/classroom/lesson";

/** One empty list for every query still loading: stable, so memos hold. */
const NONE: never[] = [];

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
export default function Dashboard({ visible = true }: { visible?: boolean }) {
  const toast = useToast();
  const { pick: pickFiles } = useImportFiles();
  const importDocs = () => void pickFiles();
  const confirm = useConfirm();
  const { resolved } = useAppearance();

  // Data. Each query is shared with the other screens and refreshed when
  // something changes it; a hidden dashboard stops listening and catches up
  // when shown again.
  const queryClient = useQueryClient();
  const live = { subscribed: visible };
  const classesQ = useQuery({ ...q.todayClasses(), ...live });
  const remindersQ = useQuery({ ...q.reminders(), ...live });
  const coursesQ = useQuery({ ...q.courses(), ...live });
  const statsQ = useQuery({ ...q.libraryStats(), ...live });
  const linksQ = useQuery({ ...q.links(), ...live });
  const recentQ = useQuery({ ...q.recentFiles(6), ...live });
  const pronoteQ = useQuery({ ...q.pronoteStatus(), ...live });
  const recapQ = useQuery({ ...q.recap("today"), ...live });
  const faviconsQ = useQuery({ ...q.setting("remote_favicons"), ...live });
  const allClassesQ = useQuery({ ...q.allCourseClasses(), ...live });
  const allClasses = allClassesQ.data ?? NONE;
  const classes = classesQ.data ?? NONE;
  const reminders = remindersQ.data ?? NONE;
  const courses = coursesQ.data ?? NONE;
  const links = linksQ.data ?? NONE;
  const recentFiles = recentQ.data ?? NONE;
  const pronoteStatus = pronoteQ.data ?? null;
  const recap = recapQ.data ?? null;
  const remoteIcons = remoteFaviconsEnabled(faviconsQ.data ?? null);
  const docCount = statsQ.data?.files ?? 0;
  const noteCount = statsQ.data?.notes ?? 0;

  // Live tick so "in progress", countdowns and the gauge move without a refetch.
  const [nowTick, setNowTick] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // The dashboard is the first screen: once its data is in, the app is usable.
  const loaded = [classesQ, remindersQ, coursesQ, statsQ, linksQ, recentQ, pronoteQ, recapQ].every(
    (r) => !r.isPending,
  );
  useEffect(() => {
    if (loaded) appReady();
  }, [loaded]);

  // ---- reminders -----------------------------------------------------------

  const toggle = async (r: Reminder) => {
    const markingDone = !r.done;
    const key = q.reminders().queryKey;
    const setDone = (done: boolean) =>
      queryClient.setQueryData(key, (prev) => prev?.map((x) => (x.id === r.id ? { ...x, done } : x)));
    setDone(markingDone);
    try {
      await api.toggleReminder(r.id, markingDone);
      if (markingDone) {
        api.logEvent("reminder_done", r.title, r.course_id);
        toast(cheer(), "success");
      }
      window.dispatchEvent(new CustomEvent("eu:reminders-changed"));
    } catch (err) {
      reportError("dashboard.toggleReminder", err);
      setDone(!markingDone);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    }
  };

  const deleteReminder = async (id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const ok = await confirm.ask({
      title: tr("dashboard.confirmDeleteReminder"),
      message: tr("dashboard.confirmDeleteReminder"),
      confirmLabel: tr("common.delete"),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteReminder(id);
      window.dispatchEvent(new CustomEvent("eu:reminders-changed"));
    } catch (err) {
      reportError("dashboard.deleteReminder", err);
      toast(errorMessage(err, tr("dashboard.errorDeleteReminder")), "error");
    }
  };

  const pending = reminders.filter((r) => !r.done);

  // ---- opening things ------------------------------------------------------

  /** The course and class a timetable entry is about (lesson.ts). */
  const place = useCallback(
    (entry: ScheduleEntry) => placeEntry(entry, courses, allClasses),
    [courses, allClasses],
  );

  const openFromSchedule = useCallback(
    (entry: ScheduleEntry) => {
      const placed = place(entry);
      if (!placed) {
        tabs.open({ kind: "courses" });
      } else if (placed.courseClass) {
        tabs.open({
          kind: "class-content",
          title: placed.courseClass.class_name,
          params: {
            courseId: placed.course.id,
            className: placed.courseClass.class_name,
            matiere: placed.course.matiere,
          },
        });
      } else {
        tabs.open({ kind: "course", title: placed.course.name, params: { courseId: placed.course.id } });
      }
    },
    [place],
  );

  // ---- « maintenant » -------------------------------------------------------

  const focus = useMemo(() => focusClass(classes, nowTick), [classes, nowTick]);
  const focusPlace = focus ? place(focus.entry) : undefined;
  const focusCourse = focusPlace?.course;
  // The lesson of the class in front of us: its course's progression.
  const progressionQ = useQuery({
    ...q.progression(focusCourse?.id ?? -1),
    enabled: focusCourse != null,
    ...live,
  });
  const sequences = progressionQ.data?.sequences ?? NONE;
  const steps = useMemo(
    () => teachingOrder(progressionQ.data?.sequences ?? NONE, progressionQ.data?.items ?? NONE),
    [progressionQ.data],
  );

  const refreshClasses = () => queryClient.invalidateQueries({ queryKey: ["courses"] });
  const nowActions: NowCardActions = {
    openContent: () => focus && openFromSchedule(focus.entry),
    openBoard: () =>
      tabs.open({
        kind: "whiteboard",
        title: tr("app.tabWhiteboard"),
        params: { isNew: true, courseId: focusCourse?.id },
      }),
    openCourse: (course) =>
      tabs.open({ kind: "course", title: course.name, params: { courseId: course.id } }),
    attachClass: (course, className) =>
      void api
        .attachClassToCourse(course.id, className)
        .then(() => refreshClasses())
        .then(() => toast(tr("lesson.attached", { name: className, course: course.name }), "success"))
        .catch((err) => {
          reportError("dashboard.attachClass", err);
          toast(errorMessage(err, tr("messages.genericError")), "error");
        }),
    markDone: (course, cc, step) => {
      const next = stepAfter(steps, step.id);
      if (!next) {
        toast(tr("lesson.lastStep", { name: cc.class_name }), "info");
        return;
      }
      const back = cc.last_item_id;
      const move = (itemId: number | null) =>
        api.setCourseClassItem(course.id, cc.class_name, itemId).then(() => refreshClasses());
      move(next.id)
        .then(() =>
          toast(tr("lesson.advanced", { name: cc.class_name, step: next.title }), "success", {
            action: {
              label: tr("common.undo"),
              run: () => void move(back).catch(logged("dashboard.undoDone")),
            },
          }),
        )
        .catch((err) => {
          reportError("dashboard.markDone", err);
          toast(errorMessage(err, tr("messages.genericError")), "error");
        });
    },
    resumeFile: openFile,
  };

  return (
    <>
      <PageHeader
        title={greeting(nowTick, pronoteStatus?.connected ? pronoteStatus.account_name : null)}
        meta={
          <>
            <span>{longDate(nowTick)}</span>
            <MetaDot />
            <span>
              {classes.length === 0
                ? tr("dashboard.metaNoClass")
                : tr("dashboard.metaClasses", { count: classes.length })}
            </span>
            <MetaDot />
            <span>{tr("dashboard.metaReminders", { count: pending.length })}</span>
            {pronoteStatus && (
              <>
                <MetaDot />
                <span className={pronoteStatus.connected ? "text-ok" : ""}>
                  {pronoteStatus.connected ? tr("status.pronoteOn") : tr("status.pronoteOff")}
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
                  title: tr("common.newNote"),
                  params: { isNew: true },
                })
              }
            >
              <NoteIcon className="w-3.5 h-3.5" />
              {tr("dashboard.newNote")}
            </button>
            <button
              className="eu-btn-ghost eu-btn-sm"
              onClick={() =>
                tabs.open({
                  kind: "whiteboard",
                  title: tr("app.tabWhiteboard"),
                  params: { isNew: true },
                })
              }
            >
              <PenIcon className="w-3.5 h-3.5" />
              {tr("dashboard.newBoard")}
            </button>
            <button className="eu-btn-primary eu-btn-sm" onClick={importDocs}>
              <PlusIcon className="w-3.5 h-3.5" />
              {tr("common.importFiles")}
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
          courseClass={focusPlace?.courseClass}
          courses={courses}
          sequences={sequences}
          steps={steps}
          dark={resolved === "dark"}
          actions={nowActions}
        />
      )}

      <div className="grid grid-cols-1 @3xl:grid-cols-[1.3fr_1fr] gap-4 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <Panel
            title={tr("dashboard.todayTitle")}
            icon={<CalendarIcon className="w-3.5 h-3.5" />}
            action={
              <button className="eu-btn-quiet eu-btn-sm" onClick={() => tabs.open({ kind: "settings" })}>
                {tr("dashboard.schedule")}
                <ChevronRightIcon className="w-3 h-3" />
              </button>
            }
          >
            {classes.length === 0 ? (
              <EmptyState
                icon={<CalendarIcon className="w-4 h-4" />}
                title={tr("dashboard.noClassTitle")}
                hint={tr("dashboard.noClassesToday")}
                action={
                  <button className="eu-btn-ghost eu-btn-sm" onClick={() => tabs.open({ kind: "settings" })}>
                    {tr("dashboard.schedule")}
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
            title={tr("dashboard.quickLinks")}
            icon={<LinkIcon className="w-3.5 h-3.5" />}
            action={
              <button className="eu-btn-quiet eu-btn-sm" onClick={() => tabs.open({ kind: "tools" })}>
                {tr("common.manage")}
                <ChevronRightIcon className="w-3 h-3" />
              </button>
            }
          >
            {links.length === 0 ? (
              <EmptyState
                title={tr("dashboard.noLinksTitle")}
                hint={tr("dashboard.noLinksHint")}
                action={
                  <button className="eu-btn-ghost eu-btn-sm" onClick={() => tabs.open({ kind: "tools" })}>
                    {tr("common.add")}
                  </button>
                }
              />
            ) : (
              <div className="flex flex-wrap gap-1.5 p-[14px]">
                {links.slice(0, 8).map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      void api.openUrl(l.url).catch((err) => {
                        reportError("dashboard.openUrl", err);
                        toast(errorMessage(err, tr("messages.openUrlError")), "error");
                      });
                    }}
                    className="eu-btn-ghost eu-btn-sm"
                    data-tip={l.url}
                  >
                    <Favicon url={l.url} className="w-4 h-4 text-[0.5625rem]" remote={remoteIcons} />
                    <span className="truncate max-w-[18ch]">{l.label}</span>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <Panel
            title={tr("nav.reminders")}
            icon={<BellIcon className="w-3.5 h-3.5" />}
            action={
              <button
                className="eu-btn-quiet eu-btn-sm"
                onClick={() => tabs.open({ kind: "reminders" })}
                aria-label={tr("common.add")}
              >
                <PlusIcon className="w-3.5 h-3.5" />
              </button>
            }
          >
            {pending.length === 0 ? (
              <EmptyState
                title={tr("dashboard.noRemindersTitle")}
                hint={tr("dashboard.noReminders")}
                action={
                  <button className="eu-btn-ghost eu-btn-sm" onClick={() => tabs.open({ kind: "reminders" })}>
                    {tr("common.newReminder")}
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
                        aria-label={`${tr("reminders.markDone")} — ${r.title}`}
                        data-tip={tr("reminders.markDone")}
                        className="w-4 h-4 shrink-0 rounded-sm border border-line-strong hover:border-ok hover:bg-ok-soft transition-colors duration-fast"
                      />
                      <span className="eu-t-body text-ink truncate flex-1">{r.title}</span>
                      {course && (
                        <span
                          className="w-2 h-2 rounded-sm shrink-0"
                          style={{ background: courseVisual(course.color, resolved === "dark").fg }}
                          data-tip={course.name}
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
                        aria-label={`${tr("common.delete")} — ${r.title}`}
                        data-tip={tr("common.delete")}
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
            title={tr("dashboard.resumeTitle")}
            icon={<ClockIcon className="w-3.5 h-3.5" />}
            action={
              <button className="eu-btn-quiet eu-btn-sm" onClick={() => tabs.open({ kind: "documents" })}>
                {tr("nav.documents")}
                <ChevronRightIcon className="w-3 h-3" />
              </button>
            }
          >
            {recentFiles.length === 0 ? (
              <EmptyState
                title={tr("dashboard.noRecentTitle")}
                hint={tr("dashboard.noRecentHint")}
                action={
                  <button className="eu-btn-ghost eu-btn-sm" onClick={importDocs}>
                    {tr("common.importFiles")}
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
                    data-tip={f.name}
                    aria-label={f.name}
                  >
                    <FileKindIcon kind={f.kind} className="w-4 h-4 text-ink-faint shrink-0" />
                    <span className="eu-t-body text-ink truncate flex-1">{f.name}</span>
                    <span className="eu-t-caption shrink-0">{relativeTime(f.added_at)}</span>
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
          label={tr("nav.courses")}
          onClick={() => tabs.open({ kind: "courses" })}
        />
        <StatTile
          icon={<DescriptionIcon className="w-4 h-4" />}
          value={docCount}
          label={tr("nav.documents")}
          onClick={() => tabs.open({ kind: "documents" })}
        />
        <StatTile
          icon={<NoteIcon className="w-4 h-4" />}
          value={noteCount}
          label={tr("nav.notes")}
          onClick={() => tabs.open({ kind: "documents", params: { filter: "note" } })}
        />
        <StatTile
          icon={<ClockIcon className="w-4 h-4" />}
          value={
            <span className="flex items-baseline gap-0.5">
              {Math.floor((recap?.active_minutes ?? 0) / 60)}
              <span className="text-[1rem] text-ink-faint font-normal">h</span>
              {String((recap?.active_minutes ?? 0) % 60).padStart(2, "0")}
            </span>
          }
          label={tr("dashboard.activeToday")}
          hint={`${tr("nav.recap")} →`}
          onClick={() => tabs.open({ kind: "recap", title: tr("nav.recap") })}
        />
      </StatStrip>
    </>
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
      <span className="eu-t-caption w-[86px] shrink-0">
        {entry.start_time}–{entry.end_time}
      </span>
      <span className="eu-t-body text-ink font-medium truncate flex-1">{entry.subject}</span>
      {entry.room && <span className="eu-chip shrink-0 hidden @xl:inline-flex">{entry.room}</span>}
      <span className="eu-t-caption shrink-0 w-[78px] text-right">
        {isCurrent
          ? tr("dashboard.inProgress")
          : status === "past"
            ? tr("dashboard.past")
            : mins != null
              ? tr("status.inTime", { time: humanMinutes(mins) })
              : ""}
      </span>
    </button>
  );
}
