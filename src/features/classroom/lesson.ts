import {
  api,
  type Course,
  type CourseClass,
  type ScheduleEntry,
  type Sequence,
  type SequenceItem,
  type StepResource,
} from "../../lib/api";
import { openFile } from "../../lib/files";
import { logged } from "../../lib/report";
import { tabs } from "../../stores/tabs";

/** Lowercase, without accents: Pronote's « MATHEMATIQUES » meets « Mathématiques ». */
export const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** A class name as a key: « 2NDE 7 », « 2nde7 » and « 2NDE7 » are one class. */
const classKey = (s: string) => fold(s).replace(/[^a-z0-9]/g, "");

/**
 * Whether a timetable subject (« MATHEMATIQUES · 2NDE7 ») is taught to a
 * class. Words are joined by twos and threes so « 2NDE 7 » matches too; a
 * half group (« 2NDE7 GR1 ») counts, « 2NDE10 » is not « 2NDE1 ».
 */
export function subjectHasClass(subject: string, className: string): boolean {
  const key = classKey(className);
  if (!key) return false;
  const words = fold(subject)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    let joined = "";
    for (let j = i; j < Math.min(words.length, i + 3); j++) {
      joined += words[j];
      if (joined === key) return true;
      if (joined.startsWith(key) && !/[0-9]/.test(joined[key.length])) return true;
    }
  }
  return false;
}

/** Whether a course's subject (Course.matiere) is the timetable's. */
export function matiereMatches(matiere: string, subject: string): boolean {
  const m = fold(matiere).trim();
  const s = fold(subject);
  if (!m) return false;
  if (m.includes("expert")) return s.includes("expert");
  if (m.includes("math")) return s.includes("math") && !s.includes("expert");
  if (m.includes("nsi") || m.includes("informatique") || m.includes("numerique"))
    return /(^|[^a-z])nsi([^a-z]|$)/.test(s) || s.includes("inform") || s.includes("numerique");
  return s.includes(m.split(/\s+/)[0]);
}

export interface Placement {
  course: Course;
  /** The class as attached to the course, when it is. */
  courseClass?: CourseClass;
}

/**
 * The course (and class) a timetable entry is about. Pronote rewrites the
 * timetable at each sync, so the link is worked out each time: the class
 * attached to a course weighs most, then the subject, then the course name.
 * A subject that contradicts the course's rules it out.
 */
export function placeEntry(
  entry: ScheduleEntry,
  courses: Course[],
  classes: CourseClass[],
): Placement | undefined {
  const classIn = (course: Course) =>
    classes.find((cc) => cc.course_id === course.id && subjectHasClass(entry.subject, cc.class_name));
  if (entry.course_id != null) {
    const course = courses.find((c) => c.id === entry.course_id);
    if (course) return { course, courseClass: classIn(course) };
  }
  let best: Placement | undefined;
  let bestScore = 1;
  for (const course of courses) {
    const courseClass = classIn(course);
    let score = courseClass ? 4 : 0;
    if (course.matiere) score += matiereMatches(course.matiere, entry.subject) ? 2 : -3;
    if (course.name && fold(entry.subject).includes(fold(course.name))) score += 1;
    if (score > bestScore) {
      best = { course, courseClass };
      bestScore = score;
    }
  }
  return best;
}

/** The class part of a timetable subject (« MATHEMATIQUES · 2NDE7 » → « 2NDE7 »). */
export function groupOf(subject: string): string | null {
  const parts = subject.split("·").map((p) => p.trim());
  return parts.length > 1 ? parts[parts.length - 1] || null : null;
}

/** Steps in teaching order: chapter by chapter, step by step. */
export function teachingOrder(sequences: Sequence[], items: SequenceItem[]): SequenceItem[] {
  const rank = new Map(
    sequences
      .slice()
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .map((sq, i) => [sq.id, i]),
  );
  return items
    .slice()
    .sort(
      (a, b) =>
        (rank.get(a.sequence_id) ?? Infinity) - (rank.get(b.sequence_id) ?? Infinity) ||
        a.position - b.position ||
        a.id - b.id,
    );
}

/** Where a class is in the progression: its marked step, else the first. */
export function currentStep(items: SequenceItem[], courseClass?: CourseClass): SequenceItem | undefined {
  return items.find((i) => i.id === courseClass?.last_item_id) ?? items[0];
}

/** The step after `id` in teaching order (across chapters). */
export function stepAfter(items: SequenceItem[], id: number): SequenceItem | undefined {
  const at = items.findIndex((i) => i.id === id);
  return at >= 0 ? items[at + 1] : undefined;
}

/** Opens one resource where it belongs: viewer, note, Python, browser. */
export function openResource(r: StepResource, courseId: number | null) {
  switch (r.kind) {
    case "file":
      if (r.ref_id != null) openFile({ id: r.ref_id, name: r.name, kind: r.file_kind || "file", courseId });
      break;
    case "note":
      if (r.ref_id != null) tabs.open({ kind: "note", title: r.name, params: { noteId: r.ref_id } });
      break;
    case "script":
      tabs.open({ kind: "python", params: { script: r.ref_name, scriptAt: Date.now() } });
      break;
    case "link":
      if (r.url) api.openUrl(r.url).catch(logged("lesson.openUrl"));
      break;
  }
}

/**
 * Opens a lesson: every resource of the step, links in the browser, the
 * first document in front.
 */
export function openLesson(step: SequenceItem, courseId: number | null) {
  const inApp = step.resources.filter((r) => r.kind !== "link");
  const links = step.resources.filter((r) => r.kind === "link");
  links.forEach((r) => openResource(r, courseId));
  // The last tab opened is in front: open the first resource last.
  inApp
    .slice()
    .reverse()
    .forEach((r) => openResource(r, courseId));
}
