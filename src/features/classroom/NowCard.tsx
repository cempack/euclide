import { Check, MapPin, Play, Plus } from "lucide-react";
import type { Course, CourseClass, ScheduleEntry, Sequence, SequenceItem } from "../../lib/api";
import { courseVisual } from "../../lib/color";
import { classProgress, humanMinutes, minutesRemaining, minutesUntil } from "../../lib/format";
import { tr } from "../../lib/i18n";
import { BookOpen, Layers, PenLine, Play as PlayGlyph } from "lucide-react";
import { COURSE_ICONS } from "../../components/ui";
import { Icon } from "../../ui/Icon";
import { MenuButton } from "../../ui/Menu";
import { tip } from "../../ui/Tooltip";
import { currentStep, groupOf, openLesson, openResource } from "./lesson";
import { ResourceIcon } from "./ResourcePicker";

export interface NowCardActions {
  /** The cahier de textes (Pronote) of the class, or its course. */
  openContent: () => void;
  openBoard: () => void;
  /** Opens the course page, to prepare the progression or the lesson. */
  openCourse: (course: Course) => void;
  /** Follows the class (the subject's group) in a course. */
  attachClass: (course: Course, className: string) => void;
  /** « Séance faite »: the class moves on to the step after `step`. */
  markDone: (course: Course, courseClass: CourseClass, step: SequenceItem) => void;
  resumeFile: (f: { id: number; name: string; kind: string; course_id?: number | null }) => void;
}

/**
 * « Maintenant » — the class in progress (or the next one) and its lesson:
 * the step the class is on, what it opens, and « Séance faite » to move on.
 * Without a course or a progression yet, the card says what to set up.
 */
export function NowCard({
  entry,
  state,
  now,
  course,
  courseClass,
  courses,
  sequences,
  steps,
  dark,
  actions,
}: {
  entry: ScheduleEntry;
  state: "current" | "next";
  now: Date;
  course?: Course;
  courseClass?: CourseClass;
  courses: Course[];
  /** The course's progression: its chapters, and its steps in teaching order. */
  sequences: Sequence[];
  steps: SequenceItem[];
  dark: boolean;
  actions: NowCardActions;
}) {
  const visual = courseVisual(course?.color, dark);
  const remaining = state === "current" ? minutesRemaining(entry, now) : null;
  const until = state === "next" ? minutesUntil(entry.start_time, now) : null;
  const progress = state === "current" ? classProgress(entry, now) : 0;
  const CourseGlyph = COURSE_ICONS.find((i) => i.key === (course?.emoji || "book"))?.Icon ?? BookOpen;
  const group = groupOf(entry.subject);

  const step = course && courseClass ? currentStep(steps, courseClass) : undefined;
  const sequenceSteps = step ? steps.filter((s) => s.sequence_id === step.sequence_id) : [];
  const stepNumber = step ? sequenceSteps.findIndex((s) => s.id === step.id) + 1 : 0;
  const resumeFile =
    courseClass?.last_file_id != null
      ? {
          id: courseClass.last_file_id,
          name: courseClass.last_file_name || tr("common.document"),
          kind: courseClass.last_file_kind || "file",
          course_id: course?.id ?? null,
        }
      : null;

  let primary: React.ReactNode;
  if (!course) {
    primary = group ? (
      <MenuButton
        label={tr("lesson.chooseCourse", { name: group })}
        className="eu-btn-primary eu-btn-sm"
        items={courses.map((c) => ({ label: c.name, onSelect: () => actions.attachClass(c, group) }))}
      >
        <Icon icon={Layers} size={14} />
        {tr("dashboard.linkCourse")}
      </MenuButton>
    ) : (
      <button className="eu-btn-ghost eu-btn-sm" onClick={actions.openContent}>
        <Icon icon={Layers} size={14} />
        {tr("dashboard.linkCourse")}
      </button>
    );
  } else if (!courseClass && group) {
    primary = (
      <button className="eu-btn-primary eu-btn-sm" onClick={() => actions.attachClass(course, group)}>
        <Icon icon={Plus} size={14} />
        {tr("lesson.attachClass", { name: group })}
      </button>
    );
  } else if (step && step.resources.length > 0) {
    primary = (
      <button
        className="eu-btn-primary eu-btn-sm"
        onClick={() => openLesson(step, course.id)}
        {...tip(tr("lesson.openTitle", { name: step.title }))}
      >
        <Icon icon={Play} size={14} />
        {tr("lesson.open")}
      </button>
    );
  } else if (resumeFile) {
    primary = (
      <button className="eu-btn-primary eu-btn-sm" onClick={() => actions.resumeFile(resumeFile)}>
        <Icon icon={PlayGlyph} size={14} />
        <span className="truncate max-w-[26ch]">{tr("dashboard.resumeFile", { name: resumeFile.name })}</span>
      </button>
    );
  } else {
    primary = (
      <button className="eu-btn-ghost eu-btn-sm" onClick={() => actions.openCourse(course)}>
        <Icon icon={Layers} size={14} />
        {step ? tr("lesson.prepare") : tr("lesson.prepareProgression")}
      </button>
    );
  }

  return (
    <section className="eu-panel flex overflow-hidden" aria-label={entry.subject}>
      <span aria-hidden className="w-1 shrink-0" style={{ background: visual.fg }} />
      <div className="flex-1 min-w-0 p-[18px]">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="eu-t-label">
            {state === "current" ? tr("dashboard.nowLabel") : tr("dashboard.nextLabel")}
          </span>
          <span className={state === "current" ? "eu-chip-warn" : "eu-chip"}>
            {entry.start_time}–{entry.end_time}
          </span>
          {state === "current" && remaining != null && (
            <span className="eu-t-caption text-warn">
              {tr("status.remaining", { time: humanMinutes(remaining) })}
            </span>
          )}
          {state === "next" && until != null && (
            <span className="eu-t-caption">{tr("status.inTime", { time: humanMinutes(until) })}</span>
          )}
        </div>

        <h2 className="mt-2 flex items-center gap-2.5 min-w-0">
          <span
            className="w-7 h-7 shrink-0 grid place-items-center rounded border"
            style={{ background: visual.tint, borderColor: visual.border, color: visual.fg }}
          >
            <CourseGlyph className="w-4 h-4" strokeWidth={1.8} />
          </span>
          <span className="eu-now-title truncate">{entry.subject}</span>
          {entry.room && <span className="eu-chip shrink-0">{entry.room}</span>}
        </h2>

        {state === "current" && (
          <div className="eu-gauge mt-3.5">
            <i style={{ width: `${progress}%`, background: visual.fg }} />
          </div>
        )}

        {step && (
          <div className="eu-now-lesson">
            <p className="eu-t-meta flex items-center gap-1.5 min-w-0">
              <Icon icon={MapPin} size={14} className="shrink-0 text-ink-faint" />
              <span className="truncate">
                {tr("lesson.stepOf", {
                  sequence: sequences.find((sq) => sq.id === step.sequence_id)?.title ?? "",
                  n: stepNumber,
                  total: sequenceSteps.length,
                })}
              </span>
              <span className="text-ink font-medium truncate">{step.title}</span>
            </p>
            {step.resources.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {step.resources.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="eu-resource eu-resource-open"
                    onClick={() => openResource(r, course?.id ?? null)}
                    {...tip(r.kind === "link" && r.url ? r.url : r.name)}
                  >
                    <ResourceIcon r={r} className="w-3.5 h-3.5 shrink-0 text-ink-faint" />
                    <span className="truncate">{r.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap mt-3.5">
          {primary}
          {course && courseClass && step && (
            <button
              className="eu-btn-ghost eu-btn-sm"
              onClick={() => actions.markDone(course, courseClass, step)}
              {...tip(tr("lesson.doneTitle", { name: courseClass.class_name }))}
            >
              <Icon icon={Check} size={14} />
              {tr("lesson.done")}
            </button>
          )}
          {course && (
            <button className="eu-btn-ghost eu-btn-sm" onClick={actions.openContent}>
              <Icon icon={BookOpen} size={14} />
              {tr("dashboard.openContent")}
            </button>
          )}
          <button className="eu-btn-ghost eu-btn-sm" onClick={actions.openBoard}>
            <Icon icon={PenLine} size={14} />
            {tr("nav.whiteboard")}
          </button>
        </div>
      </div>
    </section>
  );
}
