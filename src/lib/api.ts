import { Channel, convertFileSrc, invoke as tauriInvoke } from "@tauri-apps/api/core";
import { recordIpc } from "./perf";
import { bootSetting, forgetBootSetting, takeBootPronote } from "./boot";

export const isTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Prefix https:// when the teacher typed a bare host (google.com). */
function normalizeExternalUrl(url: string): string {
  const u = url.trim();
  if (!u) return "";
  const lower = u.toLowerCase();
  if (
    lower.startsWith("https://") ||
    lower.startsWith("http://") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:")
  ) {
    return u;
  }
  return `https://${u}`;
}

/** Open a quick link in the system browser. Throws if nothing could launch. */
async function openExternalUrl(url: string): Promise<void> {
  const href = normalizeExternalUrl(url);
  if (!href) throw new Error("Adresse vide.");
  if (!isTauri()) {
    const opened = window.open(href, "_blank", "noopener,noreferrer");
    if (!opened) throw new Error("L'ouverture du lien a été bloquée.");
    return;
  }
  await invoke<void>("open_url", { url: href });
}

/**
 * Thin wrapper around Tauri's invoke. When running in a plain browser (e.g.
 * `vite` without the Tauri shell) it resolves to a sensible empty value so the
 * UI still renders for design work instead of crashing.
 */
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    // The dev server runs against an in-memory backend with realistic data;
    // production builds leave it out, unless built with VITE_MOCK=1 to
    // measure the production bundle in a browser.
    if (import.meta.env.DEV || import.meta.env.VITE_MOCK === "1") {
      const { mockInvoke } = await import("../dev/mock-backend");
      return mockInvoke<T>(cmd, args);
    }
    console.warn(`[euclide] invoke("${cmd}") called outside Tauri - returning fallback.`);
    return fallback<T>(cmd, args);
  }
  const t0 = performance.now();
  try {
    return await tauriInvoke<T>(cmd, args);
  } finally {
    if (cmd !== "log_perf") recordIpc(cmd, performance.now() - t0);
  }
}

/** Send file bytes as the raw request body (no base64 in JSON); the other
 *  arguments travel as `x-eu-*` headers. */
async function invokeBytes<T>(
  cmd: string,
  bytes: ArrayBuffer | Uint8Array,
  headers: Record<string, string>,
): Promise<T> {
  if (!isTauri()) return invoke<T>(cmd, { headers, size: bytes.byteLength, bytes });
  const t0 = performance.now();
  try {
    return await tauriInvoke<T>(cmd, bytes, { headers });
  } finally {
    recordIpc(cmd, performance.now() - t0);
  }
}

/** Browser mode (development): the mock backend says where a file's bytes are. */
type DevKind = "file" | "version" | "thumb";
let devFiles: ((kind: DevKind, id: number) => string) | null = null;
export function serveDevFiles(resolve: (kind: DevKind, id: number) => string) {
  devFiles = resolve;
}

/** URL of a library document for the webview (`<img>`, `fetch`, PDF.js). */
export const fileUrl = (id: number) => devFiles?.("file", id) ?? convertFileSrc(`file/${id}`, "eufile");
/** URL of a saved version of a document. */
export const versionUrl = (versionId: number) =>
  devFiles?.("version", versionId) ?? convertFileSrc(`version/${versionId}`, "eufile");
/** URL of a document's preview (thumbs.rs); a 404 until it is drawn. */
export const thumbUrl = (id: number) => devFiles?.("thumb", id) ?? convertFileSrc(`thumb/${id}`, "eufile");

function asList<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]).filter((x) => x != null) : [];
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
  if (cmd === "pronote_status" || cmd === "pronote_qr_login" || cmd === "pronote_password_login") {
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
  if (cmd === "read_board") return "{}" as unknown as T;
  if (cmd === "file_path" || cmd === "choose_data_dir") return "" as unknown as T;
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
  /** Step of a sequence this class has reached (course progression). */
  last_item_id: number | null;
  last_item_title?: string | null;
  last_sequence_title?: string | null;
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

/** Library counters (library_stats): no list needed for a number. */
export interface LibraryStats {
  files: number;
  notes: number;
  bytes: number;
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

interface TopCourse {
  name: string;
  emoji: string;
  count: number;
}

interface TopItem {
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

export type RepeatRule = "none" | "daily" | "weekly" | "monthly";

/** A chapter of a course's teaching progression. */
export interface Sequence {
  id: number;
  course_id: number;
  title: string;
  position: number;
  created_at: string;
}

/** A step inside a sequence, optionally bound to a document of the locker. */
export interface SequenceItem {
  id: number;
  sequence_id: number;
  title: string;
  position: number;
  file_id: number | null;
  file_name: string | null;
  file_kind: string | null;
}

export interface Reminder {
  id: number;
  title: string;
  due_at: string | null;
  done: boolean;
  created_at: string;
  course_id: number | null;
  repeat_rule: RepeatRule;
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

/** One drawing operation of the turtle shim (sidecar/euclide_sidecar/shims/turtle.py). */
export type TurtleOp = { op: string; [field: string]: unknown };

/** What a running script reports (sidecar/euclide_sidecar/runner.py). */
export type RunEvent =
  | { t: "out" | "err"; s: string }
  | { t: "input"; prompt: string }
  | { t: "turtle"; ops: TurtleOp[] }
  | { t: "plot"; svg: string }
  | { t: "check"; name: string; ok: boolean; message: string }
  | {
      t: "done";
      ok: boolean;
      code: number | null;
      /** Set when Euclide ended the run. */
      reason?: "stopped" | "timeout" | "output" | "crash";
    };

/** A document waiting for its preview (src-tauri/src/thumbs.rs). */
export type ThumbJob = { id: number; kind: string; name: string };

export type RunRequest = { name: string; code: string; checks: boolean; timeoutS: number };

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
  backupDataDir: () => invoke<string>("backup_data_dir"),
  getBackupStatus: () => invoke<BackupStatus>("get_backup_status"),
  backupNow: () => invoke<BackupStatus>("backup_now"),
  chooseBackupFolder: () => invoke<string | null>("choose_backup_folder"),
  clearBackupFolder: () => invoke<void>("clear_backup_folder"),
  /** Applied at the next launch, before the database opens. */
  restoreSnapshot: (name: string) => invoke<void>("restore_snapshot", { name }),

  // Courses
  listCourses: () => invoke<Course[]>("list_courses").then(asList<Course>),
  createCourse: (name: string, emoji: string, color: string, description: string, matiere: string) =>
    invoke<Course>("create_course", { name, emoji, color, description, matiere }),
  updateCourse: (course: Course) => invoke<void>("update_course", { course }),
  deleteCourse: (id: number) => invoke<void>("delete_course", { id }),

  // Course classes: casier is the course's files; per attached class (exact Pronote name) we track progress + prof notes
  listCourseClasses: (courseId: number) =>
    invoke<CourseClass[]>("list_course_classes", { courseId }).then(asList<CourseClass>),
  attachClassToCourse: (courseId: number, className: string) =>
    invoke<CourseClass>("attach_class_to_course", { courseId, className }),
  detachCourseClass: (id: number) => invoke<void>("detach_course_class", { id }),
  setCourseClassProgress: (courseId: number, className: string, fileId: number | null) =>
    invoke<void>("set_course_class_progress", { courseId, className, fileId }),
  setCourseClassItem: (courseId: number, className: string, itemId: number | null) =>
    invoke<void>("set_course_class_item", { courseId, className, itemId }),

  // Sequences: the course progression (chapters -> steps -> documents)
  listSequences: (courseId: number) =>
    invoke<Sequence[]>("list_sequences", { courseId }).then(asList<Sequence>),
  listSequenceItems: (courseId: number) =>
    invoke<SequenceItem[]>("list_sequence_items", { courseId }).then(asList<SequenceItem>),
  createSequence: (courseId: number, title: string) =>
    invoke<Sequence>("create_sequence", { courseId, title }),
  renameSequence: (id: number, title: string) => invoke<void>("rename_sequence", { id, title }),
  deleteSequence: (id: number) => invoke<void>("delete_sequence", { id }),
  moveSequence: (courseId: number, id: number, delta: number) =>
    invoke<void>("move_sequence", { courseId, id, delta }),
  createSequenceItem: (sequenceId: number, title: string, fileId: number | null) =>
    invoke<SequenceItem>("create_sequence_item", { sequenceId, title, fileId }),
  updateSequenceItem: (id: number, title: string, fileId: number | null) =>
    invoke<void>("update_sequence_item", { id, title, fileId }),
  deleteSequenceItem: (id: number) => invoke<void>("delete_sequence_item", { id }),
  moveSequenceItem: (sequenceId: number, id: number, delta: number) =>
    invoke<void>("move_sequence_item", { sequenceId, id, delta }),
  updateCourseClassNotes: (courseId: number, className: string, notes: string) =>
    invoke<void>("update_course_class_notes", { courseId, className, notes }),

  // Notes
  listNotes: (courseId: number | null) => invoke<Note[]>("list_notes", { courseId }).then(asList<Note>),
  allNotes: () => invoke<Note[]>("all_notes").then(asList<Note>),
  getNote: (id: number) => invoke<Note>("get_note", { id }),
  saveNote: (note: Partial<Note>) => invoke<Note>("save_note", { note }),
  deleteNote: (id: number) => invoke<void>("delete_note", { id }),
  renameNote: (id: number, title: string) => invoke<Note>("rename_note", { id, newTitle: title }),

  // Files & documents
  listFiles: (courseId: number | null) =>
    invoke<FileItem[]>("list_files", { courseId }).then(asList<FileItem>),
  libraryStats: () => invoke<LibraryStats>("library_stats"),
  recentFiles: (limit: number) => invoke<FileItem[]>("recent_files", { limit }).then(asList<FileItem>),
  importFiles: (courseId: number | null) => invoke<FileItem[]>("import_files", { courseId }),
  importPaths: (paths: string[], courseId: number | null) =>
    invoke<FileItem[]>("import_paths", { paths, courseId }),
  openFile: (id: number) => invoke<void>("open_file", { id }),
  revealFile: (id: number) => invoke<void>("reveal_file", { id }),
  listOpeners: (id: number) => invoke<Opener[]>("list_openers", { id }),
  filePath: (id: number) => invoke<string>("file_path", { id }),
  /** Copy library documents into a course locker. */
  attachFilesToCourse: (courseId: number, fileIds: number[]) =>
    invoke<FileItem[]>("attach_files_to_course", { courseId, fileIds }),
  deleteFile: (id: number) => invoke<void>("delete_file", { id }),
  renameFile: (id: number, name: string) => invoke<FileItem>("rename_file", { id, newName: name }),
  globalSearch: (query: string) => invoke<SearchResult[]>("global_search", { query }),
  reindexDocuments: () => invoke<number>("reindex_documents"),

  // Reminders
  listReminders: () => invoke<Reminder[]>("list_reminders").then(asList<Reminder>),
  createReminder: (
    title: string,
    dueAt: string | null,
    courseId: number | null = null,
    repeatRule: RepeatRule = "none",
  ) => invoke<Reminder>("create_reminder", { title, dueAt, courseId, repeatRule }),
  updateReminder: (
    id: number,
    title: string,
    dueAt: string | null,
    courseId: number | null,
    repeatRule: RepeatRule,
  ) => invoke<Reminder>("update_reminder", { id, title, dueAt, courseId, repeatRule }),
  toggleReminder: (id: number, done: boolean) => invoke<void>("toggle_reminder", { id, done }),
  deleteReminder: (id: number) => invoke<void>("delete_reminder", { id }),

  // Quick links
  listLinks: () => invoke<QuickLink[]>("list_links").then(asList<QuickLink>),
  createLink: (label: string, url: string, icon: string) =>
    invoke<QuickLink>("create_link", { label, url, icon }),
  deleteLink: (id: number) => invoke<void>("delete_link", { id }),
  openUrl: (url: string) => openExternalUrl(url),

  // Schedule
  listSchedule: () => invoke<ScheduleEntry[]>("list_schedule").then(asList<ScheduleEntry>),
  getTodayClasses: () => invoke<ScheduleEntry[]>("get_today_classes").then(asList<ScheduleEntry>),
  saveScheduleEntry: (entry: Partial<ScheduleEntry>) =>
    invoke<ScheduleEntry>("save_schedule_entry", { entry }),
  deleteScheduleEntry: (id: number) => invoke<void>("delete_schedule_entry", { id }),

  // Whiteboard (editable .euboard vector format)
  saveBoard: (save: { file_id?: number | null; course_id?: number | null; name?: string; json: string }) =>
    invoke<FileItem>("save_board", { save }),
  readBoard: (id: number) => invoke<string>("read_board", { id }),
  /** Replace a document's content; the previous content becomes a version. */
  writeFileBytes: (fileId: number, bytes: ArrayBuffer | Uint8Array) =>
    invokeBytes<FileItem>("write_file_bytes", bytes, { "x-eu-file-id": String(fileId) }),
  /** Add a new document (exports, saved copies) to the library or a course. */
  createFileBytes: (
    name: string,
    bytes: ArrayBuffer | Uint8Array,
    opts: { courseId?: number | null; folder?: "documents" | "whiteboards" } = {},
  ) =>
    invokeBytes<FileItem>("create_file_bytes", bytes, {
      "x-eu-name": encodeURIComponent(name),
      ...(opts.courseId != null ? { "x-eu-course-id": String(opts.courseId) } : {}),
      ...(opts.folder ? { "x-eu-folder": opts.folder } : {}),
    }),
  /**
   * Print the page (its `@media print` layout) into `title.pdf` in the
   * library, without a dialog. Fails with code `print_unsupported` where the
   * webview cannot, `print_failed` when printing did not finish.
   */
  printToPdf: (title: string, courseId: number | null) =>
    invoke<FileItem>("print_to_pdf", { title, courseId }),
  /** Documents waiting for a preview (a few at a time). */
  missingThumbnails: () => invoke<ThumbJob[]>("missing_thumbnails").then(asList<ThumbJob>),
  saveThumbnail: (fileId: number, jpeg: ArrayBuffer) =>
    invokeBytes<void>("save_thumbnail", jpeg, { "x-eu-file-id": String(fileId) }),
  getFileVersions: (fileId: number) => invoke<FileVersion[]>("get_file_versions", { fileId }),

  // PDF annotations
  saveAnnotations: (fileId: number, json: string) => invoke<void>("save_annotations", { fileId, json }),
  readAnnotations: (fileId: number) => invoke<string | null>("read_annotations", { fileId }),

  // Python scripts
  listDemos: () => invoke<PythonDemo[]>("list_python_demos").then(asList<PythonDemo>),
  /** Runs a script in its own process; its events arrive in batches. */
  pythonRun: async (req: RunRequest, onEvents: (events: RunEvent[]) => void): Promise<number> => {
    if (!isTauri()) return invoke<number>("python_run", { ...req, onEvent: onEvents });
    const channel = new Channel<RunEvent[]>();
    channel.onmessage = onEvents;
    return invoke<number>("python_run", { ...req, onEvent: channel });
  },
  pythonInput: (runId: number, text: string) => invoke<void>("python_input", { runId, text }),
  pythonStop: (runId: number) => invoke<void>("python_stop", { runId }),
  /** The Python screen opened: have a process ready for the first run. */
  pythonPrewarm: () => invoke<void>("python_prewarm"),
  pythonComplete: (code: string, line: number, column: number, filename?: string) =>
    invoke<PythonCompletion[]>("python_complete", { code, line, column, filename }),
  createScript: (name: string, code: string) => invoke<PythonDemo>("create_python_script", { name, code }),
  saveScript: (path: string, code: string) => invoke<void>("save_python_script", { path, code }),
  deleteScript: (path: string) => invoke<void>("delete_python_script", { path }),
  renameScript: (path: string, newName: string) =>
    invoke<PythonDemo>("rename_python_script", { path, newName }),
  importScript: () => invoke<PythonDemo | null>("import_python_script"),

  // Keep awake
  setKeepAwake: (on: boolean) => invoke<boolean>("set_keep_awake", { on }),
  /** « auto » (during classes), « on » or « off »; returns whether it is on now. */
  setKeepAwakeMode: (mode: "auto" | "on" | "off") => invoke<boolean>("set_keep_awake_mode", { mode }),
  keepAwakeStatus: () => invoke<boolean>("keep_awake_status"),

  // Pronote
  pronoteStatus: () => {
    // The status at launch came with the page (lib/boot.ts): the first read costs no round trip.
    const atLaunch = takeBootPronote();
    return atLaunch ? Promise.resolve(atLaunch) : invoke<PronoteStatus>("pronote_status");
  },
  pronoteQrLogin: (qrJson: string, pin: string) => invoke<PronoteStatus>("pronote_qr_login", { qrJson, pin }),
  pronotePasswordLogin: (url: string, username: string, password: string, pin?: string) =>
    invoke<PronoteStatus>("pronote_password_login", { url, username, password, pin: pin || null }),
  pronoteSync: () => invoke<number>("pronote_sync"),
  pronoteLogout: () => invoke<void>("pronote_logout"),
  // pronote_contents: returns sidecar response {ok, contents: [...], matieres: [...], ...}
  // Matches the "Contenu de mes cours" / "Vision élève" style data (chronological lesson contents).
  // All filters optional. className supports class names like "3A". fromDate supports "YYYY-MM-DD" or "DD/MM/YYYY".
  pronoteContents: (subject?: string | null, className?: string | null, fromDate?: string | null) =>
    invoke<any>("pronote_contents", { subject, className, fromDate }),
  // Returns prof's available classes from Pronote (for dropdowns when attaching to courses)
  pronoteClasses: () => invoke<any>("pronote_classes"),

  // Usage events (for various stats / history)
  logEvent: (kind: string, label: string, courseId: number | null) =>
    invoke<void>("log_event", { kind, label, courseId }),

  // Recap / Bilan (activity summary)
  getRecap: (period: string = "today") => invoke<RecapData>("get_recap", { period }),

  // Settings
  logPerf: (lines: string[]) => invoke<void>("log_perf", { lines }),
  logErrors: (lines: string[]) => invoke<void>("log_errors", { lines }),
  /** The page has the window's close request in hand (src-tauri/src/exit.rs). */
  closeAck: (request: number) => invoke<void>("close_ack", { request }),
  /** Quit, once the open work is saved or abandoned on purpose. */
  appExit: () => invoke<void>("app_exit"),
  getSetting: (key: string): Promise<string | null> => {
    // Settings saved at launch arrive with the page (lib/boot.ts): the first
    // read of each costs no round trip.
    const saved = bootSetting(key);
    if (saved !== undefined) {
      forgetBootSetting(key);
      return Promise.resolve(saved);
    }
    return invoke<string | null>("get_setting", { key });
  },
  setSetting: (key: string, value: string) => {
    forgetBootSetting(key);
    return invoke<void>("set_setting", { key, value });
  },
};

/** Automatic backups (Euclide-Sauvegardes/ and the optional external mirror). */
export interface BackupStatus {
  snapshots: Array<{ name: string; day: string; size: number }>;
  folder: string;
  external_dir: string | null;
  external_reachable: boolean;
  last_mirror: string | null;
  /** "ok", the integrity problem found at startup, or null before the check ran. */
  integrity: string | null;
  restore_pending: boolean;
}

/** A saved version of a document, served at `versionUrl(id)`. */
export interface FileVersion {
  id: number;
  version: number;
  /** "original", or the save time "YYYYMMDD_HHMMSS". */
  timestamp: string;
  label: string;
  created_at: string;
  size: number;
}

export interface Opener {
  name: string;
  app?: string;
  is_reveal?: boolean;
}

export async function openWith(fileId: number, opt: Opener) {
  if (opt.is_reveal) {
    await api.revealFile(fileId);
  } else {
    await api.openFile(fileId);
  }
}
