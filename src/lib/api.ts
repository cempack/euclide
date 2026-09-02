import { invoke as tauriInvoke } from "@tauri-apps/api/core";

// Simple in-memory cache for snappy UX (avoids repeated SQLite roundtrips on re-renders / tab switches).
// TTL short because data can change via side effects; events invalidate.
const apiCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL_MS = 30_000; // 30s is plenty for local DB + feels instant

function getCached<T>(key: string): T | null {
  const hit = apiCache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data as T;
  return null;
}
function setCached(key: string, data: any) {
  apiCache.set(key, { data, ts: Date.now() });
}
export function invalidateCache(keyPrefix?: string) {
  if (!keyPrefix) {
    apiCache.clear();
    return;
  }
  for (const k of apiCache.keys()) {
    if (k.startsWith(keyPrefix)) apiCache.delete(k);
  }
}

// Listen once for global invalidations (dispatched by screens on mutations)
if (typeof window !== "undefined") {
  const onChange = (e: Event) => {
    const type = (e as CustomEvent).type;
    if (type.includes("course")) {
      invalidateCache("listCourses");
      invalidateCache("listCourseClasses");
    }
    if (type.includes("library") || type.includes("file") || type.includes("note")) {
      invalidateCache("listFiles");
      invalidateCache("recentFiles");
      invalidateCache("allNotes");
      invalidateCache("listNotes");
    }
    if (type.includes("reminder")) {
      invalidateCache("listReminders");
    }
    if (type.includes("schedule")) {
      invalidateCache("listSchedule");
      invalidateCache("getTodayClasses");
    }
    if (type.includes("link")) {
      invalidateCache("listLinks");
    }
    if (type.includes("demo")) {
      invalidateCache("listDemos");
    }
    // Fallback: if unknown or "library" broad, full clear for safety on some events
    if (type.includes("library-changed") || type.includes("full-invalidate")) {
      invalidateCache();
    }
  };
  window.addEventListener("eu:library-changed", onChange);
  window.addEventListener("eu:course-changed", onChange);
  window.addEventListener("eu:reminders-changed", onChange);
  window.addEventListener("eu:schedule-changed", onChange);
  window.addEventListener("eu:quicklinks-changed", onChange);
}

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Thin wrapper around Tauri's invoke. When running in a plain browser (e.g.
 * `vite` without the Tauri shell) it resolves to a sensible empty value so the
 * UI still renders for design work instead of crashing.
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    console.warn(`[euclide] invoke("${cmd}") called outside Tauri - returning fallback.`);
    return fallback<T>(cmd, args);
  }
  return tauriInvoke<T>(cmd, args);
}

function fallback<T>(cmd: string, args?: Record<string, unknown>): T {
  const listCmds = new Set([
    "all_notes",
    "recent_files",
    "get_today_classes",
    "get_file_versions",
    "python_complete",
    "pronote_classes",
    "pronote_contents",
    "import_files",
    "import_paths",
  ]);
  if (cmd.startsWith("list_") || cmd.endsWith("_search") || listCmds.has(cmd)) {
    return [] as unknown as T;
  }
  if (cmd === "get_app_info") {
    return {
      teacher_name: "Monsieur Madrias",
      author: "Elliot Moreau",
      version: "0.1.0",
      data_dir: "(navigateur — hors Tauri)",
      windows_portable: false,
    } as unknown as T;
  }
  if (cmd === "get_recap") {
    return {
      files_opened: 0,
      notes_written: 0,
      demos_run: 0,
      reminders_done: 0,
      active_minutes: 0,
      top_courses: [],
      top_documents: [],
      top_tools: [],
      time_by_area: [],
    } as unknown as T;
  }
  if (cmd === "pronote_status") {
    return { connected: false, account_name: null, last_sync: null } as unknown as T;
  }
  if (cmd === "keep_awake_status") return true as unknown as T;
  if (cmd === "set_keep_awake") return Boolean(args?.on) as unknown as T;
  if (cmd === "reindex_documents") return 0 as unknown as T;
  if (cmd === "run_python_code" || cmd === "run_python_demo") {
    return {
      ok: false,
      stdout: "",
      stderr: "Sidecar Python indisponible hors application.",
    } as unknown as T;
  }
  return null as unknown as T;
}

// Data model (mirrors Rust structs)

export interface AppInfo {
  teacher_name: string;
  author: string;
  version: string;
  data_dir: string;
  windows_portable: boolean;
}

export interface Course {
  id: number;
  name: string;
  emoji: string;
  color: string;
  description: string;
  matiere: string; // "Mathématiques" | "NSI" | "Maths expertes" — used to filter Pronote cahier contents by subject (see subjectForPronote)
  created_at: string;
}

export interface CourseClass {
  id: number;
  course_id: number;
  class_name: string;
  last_file_id: number | null;
  last_file_name?: string | null;
  last_file_kind?: string | null;
  progress_updated_at: string;
  notes: string;
}

export interface Note {
  id: number;
  course_id: number | null;
  title: string;
  body: string;
  updated_at: string;
}

export interface FileItem {
  id: number;
  course_id: number | null;
  name: string;
  rel_path: string;
  kind: string;
  size: number;
  added_at: string;
}

export interface TopCourse {
  name: string;
  emoji: string;
  count: number;
}

export interface TopItem {
  name: string;
  count: number;
}

export interface RecapData {
  period_label?: string;
  files_opened: number;
  notes_written: number;
  demos_run: number;
  reminders_done: number;
  active_minutes: number;
  top_courses: TopCourse[];
  top_documents: TopItem[];
  top_tools: TopItem[];
  time_by_area: TopItem[];
}

export interface Reminder {
  id: number;
  title: string;
  due_at: string | null;
  done: boolean;
  created_at: string;
}

export interface QuickLink {
  id: number;
  label: string;
  url: string;
  icon: string;
}

export interface ScheduleEntry {
  id: number;
  day_of_week: number; // 1 = Monday .. 7 = Sunday
  start_time: string; // "08:00"
  end_time: string; // "09:00"
  subject: string;
  room: string;
  course_id: number | null;
  source: string; // "manual" | "pronote"
}

export interface PronoteStatus {
  connected: boolean;
  account_name: string | null;
  last_sync: string | null;
}

export interface PythonDemo {
  name: string;
  path: string;
  code: string;
}

export interface SearchResult {
  kind: "note" | "file" | "course";
  id: number;
  title: string;
  subtitle: string;
  snippet: string;
  course_id: number | null;
  file_kind: string;
}

export interface PythonResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export interface PythonCompletion {
  name: string;
  complete?: string;
  type?: string;
  signature?: string;
  doc?: string;
}

// Commands

export const api = {
  appInfo: () => invoke<AppInfo>("get_app_info"),

  // Storage / data root (USB portable)
  chooseDataDir: () => invoke<string | null>("choose_data_dir"),
  resetDataDir: () => invoke<void>("reset_data_dir"),

  // Courses
  listCourses: () => {
    const key = "listCourses";
    const cached = getCached<Course[]>(key);
    if (cached) return Promise.resolve(cached);
    return invoke<Course[]>("list_courses").then((data) => { setCached(key, data); return data; });
  },
  createCourse: (name: string, emoji: string, color: string, description: string, matiere: string) =>
    invoke<Course>("create_course", { name, emoji, color, description, matiere }).then((c) => {
      // optimistic patch for list cache
      const key = "listCourses";
      const cached = getCached<Course[]>(key);
      if (cached) setCached(key, [...cached, c]);
      return c;
    }),
  updateCourse: (course: Course) => invoke<void>("update_course", { course }).then(() => {
    // optimistic patch
    const key = "listCourses";
    const cached = getCached<Course[]>(key);
    if (cached) {
      setCached(key, cached.map((c) => (c.id === course.id ? { ...c, ...course } : c)));
    }
    return;
  }),
  deleteCourse: (id: number) => invoke<void>("delete_course", { id }).then(() => {
    invalidateCache("listCourses");
    invalidateCache("listCourseClasses");
  }),

  // Course classes: casier is the course's files; per attached class (exact Pronote name) we track progress + prof notes
  listCourseClasses: (courseId: number) => {
    const key = `listCourseClasses:${courseId}`;
    const cached = getCached<CourseClass[]>(key);
    if (cached) return Promise.resolve(cached);
    return invoke<CourseClass[]>("list_course_classes", { courseId }).then((data) => { setCached(key, data); return data; });
  },
  attachClassToCourse: (courseId: number, className: string) =>
    invoke<CourseClass>("attach_class_to_course", { courseId, className }).then((data) => {
      invalidateCache("listCourseClasses");
      return data;
    }),
  detachCourseClass: (id: number) =>
    invoke<void>("detach_course_class", { id }).then((data) => {
      invalidateCache("listCourseClasses");
      return data;
    }),
  setCourseClassProgress: (courseId: number, className: string, fileId: number | null) =>
    invoke<void>("set_course_class_progress", { courseId, className, fileId }).then((data) => {
      invalidateCache("listCourseClasses");
      return data;
    }),
  updateCourseClassNotes: (courseId: number, className: string, notes: string) =>
    invoke<void>("update_course_class_notes", { courseId, className, notes }).then((data) => {
      invalidateCache("listCourseClasses");
      return data;
    }),

  // Notes
  listNotes: (courseId: number | null) => {
    const key = `listNotes:${courseId ?? "all"}`;
    const cached = getCached<Note[]>(key);
    if (cached) return Promise.resolve(cached);
    return invoke<Note[]>("list_notes", { courseId }).then((data) => { setCached(key, data); return data; });
  },
  allNotes: () => {
    const key = "allNotes";
    const cached = getCached<Note[]>(key);
    if (cached) return Promise.resolve(cached);
    return invoke<Note[]>("all_notes").then((data) => { setCached(key, data); return data; });
  },
  saveNote: (note: Partial<Note>) => invoke<Note>("save_note", { note }),
  deleteNote: (id: number) => invoke<void>("delete_note", { id }),
  renameNote: (id: number, title: string) => invoke<Note>("rename_note", { id, newTitle: title }),

  // Files & documents
  listFiles: (courseId: number | null) => {
    const key = `listFiles:${courseId ?? "all"}`;
    const cached = getCached<FileItem[]>(key);
    if (cached) return Promise.resolve(cached);
    return invoke<FileItem[]>("list_files", { courseId }).then((data) => { setCached(key, data); return data; });
  },
  recentFiles: (limit: number) => {
    const key = `recentFiles:${limit}`;
    const cached = getCached<FileItem[]>(key);
    if (cached) return Promise.resolve(cached);
    return invoke<FileItem[]>("recent_files", { limit }).then((data) => { setCached(key, data); return data; });
  },
  importFiles: (courseId: number | null) => invoke<FileItem[]>("import_files", { courseId }),
  importPaths: (paths: string[], courseId: number | null) =>
    invoke<FileItem[]>("import_paths", { paths, courseId }),
  openFile: (id: number, withApp?: string) => invoke<void>("open_file", { id, with_app: withApp }),
  revealFile: (id: number) => invoke<void>("reveal_file", { id }),
  listOpeners: (id: number) => invoke<Opener[]>("list_openers", { id }),
  filePath: (id: number) => invoke<string>("file_path", { id }),
  deleteFile: (id: number) => invoke<void>("delete_file", { id }),
  renameFile: (id: number, name: string) => invoke<FileItem>("rename_file", { id, newName: name }),
  globalSearch: (query: string) => invoke<SearchResult[]>("global_search", { query }),
  reindexDocuments: () => invoke<number>("reindex_documents"),

  // Reminders
  listReminders: () => {
    const key = "listReminders";
    const cached = getCached<Reminder[]>(key);
    if (cached) return Promise.resolve(cached);
    return invoke<Reminder[]>("list_reminders").then((data) => { setCached(key, data); return data; });
  },
  createReminder: (title: string, dueAt: string | null) =>
    invoke<Reminder>("create_reminder", { title, dueAt }),
  toggleReminder: (id: number, done: boolean) => invoke<void>("toggle_reminder", { id, done }),
  deleteReminder: (id: number) => invoke<void>("delete_reminder", { id }),

  // Quick links
  listLinks: () => {
    const key = "listLinks";
    const cached = getCached<QuickLink[]>(key);
    if (cached) return Promise.resolve(cached);
    return invoke<QuickLink[]>("list_links").then((data) => { setCached(key, data); return data; });
  },
  createLink: (label: string, url: string, icon: string) =>
    invoke<QuickLink>("create_link", { label, url, icon }),
  deleteLink: (id: number) => invoke<void>("delete_link", { id }),
  openUrl: (url: string) => invoke<void>("open_url", { url }),

  // Schedule
  listSchedule: () => {
    const key = "listSchedule";
    const cached = getCached<ScheduleEntry[]>(key);
    if (cached) return Promise.resolve(cached);
    return invoke<ScheduleEntry[]>("list_schedule").then((data) => { setCached(key, data); return data; });
  },
  getTodayClasses: () => {
    const key = "getTodayClasses";
    const cached = getCached<ScheduleEntry[]>(key);
    if (cached) return Promise.resolve(cached);
    return invoke<ScheduleEntry[]>("get_today_classes").then((data) => { setCached(key, data); return data; });
  },
  saveScheduleEntry: (entry: Partial<ScheduleEntry>) =>
    invoke<ScheduleEntry>("save_schedule_entry", { entry }),
  deleteScheduleEntry: (id: number) => invoke<void>("delete_schedule_entry", { id }),

  // Whiteboard (editable .euboard vector format)
  saveBoard: (save: {
    file_id?: number | null;
    course_id?: number | null;
    name?: string;
    json: string;
  }) => invoke<FileItem>("save_board", { save }),
  readBoard: (id: number) => invoke<string>("read_board", { id }),
  exportBoardPng: (courseId: number | null, name: string, dataUrl: string) =>
    invoke<FileItem>("export_board_png", { courseId, name, dataUrl }),
  saveExport: (name: string, dataUrl: string) => invoke<FileItem>("save_export", { name, dataUrl }),
  updateFile: (fileId: number, dataUrl: string) => invoke<FileItem>("update_file", { fileId, dataUrl }),
  getFileVersions: (fileId: number) => invoke<any[]>("get_file_versions", { fileId }),
  readVersionData: (name: string) => invoke<string>("read_version_data", { name }),
  ensureOriginalVersion: (fileId: number) => invoke<void>("ensure_original_version", { fileId }),

  // PDF annotations
  saveAnnotations: (fileId: number, json: string) =>
    invoke<void>("save_annotations", { fileId, json }),
  readAnnotations: (fileId: number) => invoke<string | null>("read_annotations", { fileId }),

  // Python scripts
  listDemos: () => {
    const key = "listDemos";
    const cached = getCached<PythonDemo[]>(key);
    if (cached) return Promise.resolve(cached);
    return invoke<PythonDemo[]>("list_python_demos").then((data) => { setCached(key, data); return data; });
  },
  runDemo: (path: string) => invoke<PythonResult>("run_python_demo", { path }),
  runCode: (code: string) => invoke<PythonResult>("run_python_code", { code }),
  pythonComplete: (code: string, line: number, column: number, filename?: string) =>
    invoke<PythonCompletion[]>("python_complete", { code, line, column, filename }),
  createScript: (name: string, code: string) =>
    invoke<PythonDemo>("create_python_script", { name, code }),
  saveScript: (path: string, code: string) => invoke<void>("save_python_script", { path, code }),
  deleteScript: (path: string) => invoke<void>("delete_python_script", { path }),
  renameScript: (path: string, newName: string) => invoke<PythonDemo>("rename_python_script", { path, newName }),
  importScript: () => invoke<PythonDemo | null>("import_python_script"),

  // Keep awake
  setKeepAwake: (on: boolean) => invoke<boolean>("set_keep_awake", { on }),
  keepAwakeStatus: () => invoke<boolean>("keep_awake_status"),

  // Pronote
  pronoteStatus: () => {
    const key = "pronoteStatus";
    const cached = getCached<PronoteStatus>(key);
    if (cached) return Promise.resolve(cached);
    // 30s TTL is fine; status changes only on login/logout/sync
    return invoke<PronoteStatus>("pronote_status").then((data) => { setCached(key, data); return data; });
  },
  pronoteQrLogin: (qrJson: string, pin: string) =>
    invoke<PronoteStatus>("pronote_qr_login", { qrJson, pin }).then((data) => {
      setCached("pronoteStatus", data);
      return data;
    }),
  pronotePasswordLogin: (url: string, username: string, password: string, pin?: string) =>
    invoke<PronoteStatus>("pronote_password_login", { url, username, password, pin: pin || null }).then((data) => {
      setCached("pronoteStatus", data);
      return data;
    }),
  pronoteSync: () =>
    invoke<number>("pronote_sync").then((data) => {
      invalidateCache("pronoteStatus");
      return data;
    }),
  pronoteLogout: () =>
    invoke<void>("pronote_logout").then((data) => {
      invalidateCache("pronoteStatus");
      return data;
    }),
  // pronote_contents: returns sidecar response {ok, contents: [...], matieres: [...], ...}
  // Matches the "Contenu de mes cours" / "Vision élève" style data (chronological lesson contents).
  // All filters optional. className supports class names like "3A". fromDate supports "YYYY-MM-DD" or "DD/MM/YYYY".
  pronoteContents: (
    subject?: string | null,
    className?: string | null,
    fromDate?: string | null
  ) =>
    invoke<any>("pronote_contents", { subject, className, fromDate }),
  // Returns prof's available classes from Pronote (for dropdowns when attaching to courses)
  pronoteClasses: () => invoke<any>("pronote_classes"),

  // Usage events (for various stats / history)
  logEvent: (kind: string, label: string, courseId: number | null) =>
    invoke<void>("log_event", { kind, label, courseId }),

  // Recap / Bilan (activity summary)
  getRecap: (period: string = "today") => invoke<RecapData>("get_recap", { period }),

  // Settings
  getSetting: (key: string) => invoke<string | null>("get_setting", { key }),
  setSetting: (key: string, value: string) => invoke<void>("set_setting", { key, value }),
};

export interface Opener {
  name: string;
  app?: string;
  is_reveal?: boolean;
}

export async function openWith(fileId: number, opt: Opener) {
  if (opt.is_reveal) {
    await api.revealFile(fileId);
  } else {
    await api.openFile(fileId, opt.app);
  }
}
