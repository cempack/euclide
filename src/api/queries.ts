import { queryOptions } from "@tanstack/react-query";
import { api, invalidateCache } from "../lib/api";

/**
 * Every query the screens use: one key factory, one place that says what
 * each key fetches. Keys start with their scope ("library", "courses"…), the
 * unit that mutations and backend events invalidate.
 *
 * lib/api.ts still caches some calls for the screens not moved here yet; a
 * query drops that copy first, so it never refetches stale data.
 */
function fresh<T>(legacyKey: string, load: () => Promise<T>): () => Promise<T> {
  return () => {
    invalidateCache(legacyKey);
    return load();
  };
}

const list = <T>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);

export const q = {
  courses: () =>
    queryOptions({
      queryKey: ["courses"],
      queryFn: fresh("listCourses", () => api.listCourses().then(list)),
    }),
  courseClasses: (courseId: number) =>
    queryOptions({
      queryKey: ["courses", courseId, "classes"],
      queryFn: fresh(`listCourseClasses:${courseId}`, () => api.listCourseClasses(courseId).then(list)),
    }),
  libraryStats: () => queryOptions({ queryKey: ["library", "stats"], queryFn: () => api.libraryStats() }),
  recentFiles: (limit: number) =>
    queryOptions({
      queryKey: ["library", "recent", limit],
      queryFn: fresh(`recentFiles:${limit}`, () => api.recentFiles(limit).then(list)),
    }),
  reminders: () =>
    queryOptions({
      queryKey: ["reminders"],
      queryFn: fresh("listReminders", () => api.listReminders().then(list)),
    }),
  todayClasses: () =>
    queryOptions({
      // The day is part of the key: a session left open overnight shows the new day.
      queryKey: ["schedule", "today", new Date().toDateString()],
      queryFn: fresh("getTodayClasses", () => api.getTodayClasses().then(list)),
    }),
  links: () =>
    queryOptions({ queryKey: ["links"], queryFn: fresh("listLinks", () => api.listLinks().then(list)) }),
  pronoteStatus: () =>
    queryOptions({
      queryKey: ["pronote", "status"],
      queryFn: fresh("pronoteStatus", () => api.pronoteStatus()),
    }),
  recap: (period: "today" | "week" | "month") =>
    queryOptions({ queryKey: ["recap", period], queryFn: () => api.getRecap(period), staleTime: 60_000 }),
  setting: (key: string) => queryOptions({ queryKey: ["settings", key], queryFn: () => api.getSetting(key) }),
  keepAwake: () => queryOptions({ queryKey: ["keepAwake"], queryFn: () => api.keepAwakeStatus() }),
};
