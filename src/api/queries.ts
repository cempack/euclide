import { queryOptions } from "@tanstack/react-query";
import { api } from "../lib/api";
import { bootSetting } from "../lib/boot";

/** One lesson's contents as the Pronote sidecar returns them. */
export type PronoteContent = {
  date?: string;
  [field: string]: unknown;
};

/**
 * Every query the screens use: one key factory, one place that says what
 * each key fetches. Keys start with their scope ("library", "courses"…), the
 * unit that mutations and backend events invalidate.
 */
export const q = {
  courses: () =>
    queryOptions({
      queryKey: ["courses"],
      queryFn: () => api.listCourses(),
    }),
  courseClasses: (courseId: number) =>
    queryOptions({
      queryKey: ["courses", courseId, "classes"],
      queryFn: () => api.listCourseClasses(courseId),
    }),
  /** Every course's classes: how a timetable entry finds its course and class. */
  allCourseClasses: () =>
    queryOptions({
      queryKey: ["courses", "all-classes"],
      queryFn: () => api.listAllCourseClasses(),
    }),
  /** A course's progression: its sequences (chapters) and their steps. */
  progression: (courseId: number) =>
    queryOptions({
      queryKey: ["courses", courseId, "progression"],
      queryFn: async () => {
        const [sequences, items] = await Promise.all([
          api.listSequences(courseId),
          api.listSequenceItems(courseId),
        ]);
        return { sequences, items };
      },
    }),
  /** A course's files, or with null the library (the files of no course). */
  files: (courseId: number | null) =>
    queryOptions({
      queryKey: ["library", "files", courseId],
      queryFn: () => api.listFiles(courseId),
    }),
  notes: () =>
    queryOptions({
      queryKey: ["library", "notes"],
      queryFn: () => api.allNotes(),
    }),
  courseNotes: (courseId: number) =>
    queryOptions({
      queryKey: ["library", "notes", "course", courseId],
      queryFn: () => api.listNotes(courseId),
    }),
  /** Pronote's class list goes through the Python sidecar: kept 10 minutes, one retry. */
  pronoteClasses: () =>
    queryOptions({
      queryKey: ["pronote", "classes"],
      queryFn: async () => {
        const r = (await api.pronoteClasses()) as { ok?: boolean; classes?: { name: string }[] } | null;
        return r?.ok && Array.isArray(r.classes) ? r.classes : [];
      },
      staleTime: 10 * 60_000,
      retry: 1,
    }),
  /** A class's lesson contents from Pronote (sidecar): kept 10 minutes, one retry. */
  /** A class's cahier de textes over a period: four weeks, three months or the year. */
  pronoteContents: (subject: string, className: string, since: "month" | "term" | "year" = "month") =>
    queryOptions({
      queryKey: ["pronote", "contents", subject, className, since],
      queryFn: async () => {
        const days = since === "month" ? 28 : since === "term" ? 92 : null;
        const from =
          days == null ? null : new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
        const res = await api.pronoteContents(subject, className, from);
        if (!res?.ok) throw new Error(res?.error || "Erreur Pronote");
        const items: PronoteContent[] = Array.isArray(res.contents) ? res.contents : [];
        // Newest first (the sidecar already sorts; cheap to be sure).
        return [...items].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      },
      staleTime: 10 * 60_000,
      retry: 1,
    }),
  /** The teacher's Python scripts (python/ folder). */
  scripts: () => queryOptions({ queryKey: ["python", "scripts"], queryFn: () => api.listDemos() }),
  libraryStats: () => queryOptions({ queryKey: ["library", "stats"], queryFn: () => api.libraryStats() }),
  recentFiles: (limit: number) =>
    queryOptions({
      queryKey: ["library", "recent", limit],
      queryFn: () => api.recentFiles(limit),
    }),
  reminders: () =>
    queryOptions({
      queryKey: ["reminders"],
      queryFn: () => api.listReminders(),
    }),
  todayClasses: () =>
    queryOptions({
      // The day is part of the key: a session left open overnight shows the new day.
      queryKey: ["schedule", "today", new Date().toDateString()],
      queryFn: () => api.getTodayClasses(),
    }),
  schedule: () =>
    queryOptions({
      queryKey: ["schedule", "all"],
      queryFn: () => api.listSchedule(),
    }),
  links: () => queryOptions({ queryKey: ["links"], queryFn: () => api.listLinks() }),
  /** Automatic backups: copies, the external folder, the integrity check. */
  backups: () => queryOptions({ queryKey: ["backups"], queryFn: () => api.getBackupStatus() }),
  pronoteStatus: () =>
    queryOptions({
      queryKey: ["pronote", "status"],
      queryFn: () => api.pronoteStatus(),
    }),
  recap: (period: "today" | "week" | "month") =>
    queryOptions({ queryKey: ["recap", period], queryFn: () => api.getRecap(period), staleTime: 60_000 }),
  /** Settings saved at launch are there from the first render: no flash of the default. */
  setting: (key: string) =>
    queryOptions({
      queryKey: ["settings", key],
      queryFn: () => api.getSetting(key),
      initialData: () => bootSetting(key),
    }),
  keepAwake: () => queryOptions({ queryKey: ["keepAwake"], queryFn: () => api.keepAwakeStatus() }),
};
