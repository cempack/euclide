import { invoke as tauriInvoke } from "@tauri-apps/api/core";

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
    return fallback<T>(cmd);
  }
  return tauriInvoke<T>(cmd, args);
}

function fallback<T>(cmd: string): T {
  if (cmd.startsWith("list_") || cmd.endsWith("_search") || cmd === "get_today_classes")
    return [] as unknown as T;
  return null as unknown as T;
}

// ---------------------------------------------------------------------------
// Data model (mirrors the Rust structs)
// ---------------------------------------------------------------------------

export interface AppInfo {
  teacher_name: string;
  author: string;
  version: string;
  data_dir: string;
}

export interface Course {
  id: number;
  name: string;
  emoji: string;
  color: string;
  description: string;
  created_at: string;
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

export interface SearchHit {
  doc_id: number;
  name: string;
  rel_path: string;
  course_id: number | null;
  snippet: string;
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

export interface RecapData {
  period_label: string;
  files_opened: number;
  notes_written: number;
  demos_run: number;
  reminders_done: number;
  active_minutes: number;
  top_courses: { name: string; emoji: string; count: number }[];
  highlights: string[];
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export const api = {
  appInfo: () => invoke<AppInfo>("get_app_info"),

  // Courses
  listCourses: () => invoke<Course[]>("list_courses"),
  createCourse: (name: string, emoji: string, color: string, description: string) =>
    invoke<Course>("create_course", { name, emoji, color, description }),
  updateCourse: (course: Course) => invoke<void>("update_course", { course }),
  deleteCourse: (id: number) => invoke<void>("delete_course", { id }),

  // Notes
  listNotes: (courseId: number | null) => invoke<Note[]>("list_notes", { courseId }),
  allNotes: () => invoke<Note[]>("all_notes"),
  saveNote: (note: Partial<Note>) => invoke<Note>("save_note", { note }),
  deleteNote: (id: number) => invoke<void>("delete_note", { id }),

  // Files & documents
  listFiles: (courseId: number | null) => invoke<FileItem[]>("list_files", { courseId }),
  recentFiles: (limit: number) => invoke<FileItem[]>("recent_files", { limit }),
  importFiles: (courseId: number | null) => invoke<FileItem[]>("import_files", { courseId }),
  importPaths: (paths: string[], courseId: number | null) =>
    invoke<FileItem[]>("import_paths", { paths, courseId }),
  openFile: (id: number) => invoke<void>("open_file", { id }),
  filePath: (id: number) => invoke<string>("file_path", { id }),
  deleteFile: (id: number) => invoke<void>("delete_file", { id }),
  searchDocuments: (query: string) => invoke<SearchHit[]>("search_documents", { query }),
  globalSearch: (query: string) => invoke<SearchResult[]>("global_search", { query }),
  reindexDocuments: () => invoke<number>("reindex_documents"),

  // Reminders
  listReminders: () => invoke<Reminder[]>("list_reminders"),
  createReminder: (title: string, dueAt: string | null) =>
    invoke<Reminder>("create_reminder", { title, dueAt }),
  toggleReminder: (id: number, done: boolean) => invoke<void>("toggle_reminder", { id, done }),
  deleteReminder: (id: number) => invoke<void>("delete_reminder", { id }),

  // Quick links
  listLinks: () => invoke<QuickLink[]>("list_links"),
  createLink: (label: string, url: string, icon: string) =>
    invoke<QuickLink>("create_link", { label, url, icon }),
  deleteLink: (id: number) => invoke<void>("delete_link", { id }),
  openUrl: (url: string) => invoke<void>("open_url", { url }),

  // Schedule
  listSchedule: () => invoke<ScheduleEntry[]>("list_schedule"),
  getTodayClasses: () => invoke<ScheduleEntry[]>("get_today_classes"),
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

  // PDF annotations
  saveAnnotations: (fileId: number, json: string) =>
    invoke<void>("save_annotations", { fileId, json }),
  readAnnotations: (fileId: number) => invoke<string | null>("read_annotations", { fileId }),

  // Python scripts
  listDemos: () => invoke<PythonDemo[]>("list_python_demos"),
  runDemo: (path: string) => invoke<PythonResult>("run_python_demo", { path }),
  runCode: (code: string) => invoke<PythonResult>("run_python_code", { code }),
  createScript: (name: string, code: string) =>
    invoke<PythonDemo>("create_python_script", { name, code }),
  saveScript: (path: string, code: string) => invoke<void>("save_python_script", { path, code }),
  deleteScript: (path: string) => invoke<void>("delete_python_script", { path }),
  importScript: () => invoke<PythonDemo | null>("import_python_script"),

  // Keep awake
  setKeepAwake: (on: boolean) => invoke<boolean>("set_keep_awake", { on }),
  keepAwakeStatus: () => invoke<boolean>("keep_awake_status"),

  // Pronote
  pronoteStatus: () => invoke<PronoteStatus>("pronote_status"),
  pronoteQrLogin: (qrJson: string, pin: string) =>
    invoke<PronoteStatus>("pronote_qr_login", { qrJson, pin }),
  pronotePasswordLogin: (url: string, username: string, password: string) =>
    invoke<PronoteStatus>("pronote_password_login", { url, username, password }),
  pronoteSync: () => invoke<number>("pronote_sync"),
  pronoteLogout: () => invoke<void>("pronote_logout"),
  // pronote_contents: returns sidecar response {ok, contents: [...], username?, password?}
  // subject + className are optional filters; pass null/undefined for no filter.
  pronoteContents: (subject?: string | null, className?: string | null) =>
    invoke<any>("pronote_contents", { subject, className }),

  // Usage & recap
  logEvent: (kind: string, label: string, courseId: number | null) =>
    invoke<void>("log_event", { kind, label, courseId }),
  getRecap: (period: string) => invoke<RecapData>("get_recap", { period }),

  // Settings
  getSetting: (key: string) => invoke<string | null>("get_setting", { key }),
  setSetting: (key: string, value: string) => invoke<void>("set_setting", { key, value }),
};
