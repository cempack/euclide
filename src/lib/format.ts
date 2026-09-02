import { t, get, fmt } from "./i18n";

export function greeting(date = new Date(), name?: string | null): string {
  // Anonymous greetings until Pronote is connected; named pool once we have an account.
  const named = !!(name && name.trim());
  const key = named ? "greetingsNamed" : "greetings";
  const fallback = named ? ["Bonjour {name}"] : ["Bonjour"];
  const raw = t && t[key];
  const pool: string[] = Array.isArray(raw) && raw.length > 0 ? raw : (get(key, fallback) as string[]);
  if (pool.length === 0) return named ? fmt("Bonjour {name}", { name: name!.trim() }) : "Bonjour";
  const seed = date.getDate() + date.getMonth() * 31 + (date.getFullYear() % 100) * 400;
  const line = pool[seed % pool.length];
  return named ? fmt(line, { name: name!.trim() }) : line;
}

const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export function longDate(date = new Date()): string {
  return `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export const DAY_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

/** JS getDay() (0=Sun) -> our schema (1=Mon..7=Sun) */
export function isoDayOfWeek(date = new Date()): number {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function relativeTime(iso: string): string {
  if (!iso) return "";
  // SQLite datetime('now') returns 'YYYY-MM-DD HH:MM:SS' in UTC.
  // JS `new Date('2025-01-01 12:00')` treats as LOCAL => off-by-hours bug.
  // Normalize to ISO with Z (UTC).
  const normalized = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const then = new Date(normalized).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `il y a ${d} j`;
  return new Date(normalized).toLocaleDateString("fr-FR");
}

// Text label (e.g. "PDF", "TAB") – fine for meta text; not used as visual icon glyph.
export function fileKindLabel(kind: string): string {
  switch (kind) {
    case "pdf":
      return "PDF";
    case "image":
      return "IMG";
    case "board":
    case "whiteboard":
      return "TAB";
    case "doc":
      return "DOC";
    case "sheet":
      return "XLS";
    case "slides":
      return "PPT";
    default:
      return "FILE";
  }
}

function parseMinutes(hm: string): number {
  const [h, m] = (hm || "00:00").split(":").map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
}

/** Status for a schedule entry relative to now. */
export type ClassStatus = "past" | "current" | "next" | "upcoming";

export function getClassStatus(
  entry: { start_time: string; end_time: string },
  now: Date = new Date()
): ClassStatus {
  const cur = now.getHours() * 60 + now.getMinutes();
  const s = parseMinutes(entry.start_time);
  const e = parseMinutes(entry.end_time);
  if (cur >= s && cur < e) return "current";
  if (cur < s) return "upcoming";
  return "past";
}

/** Returns the first upcoming (or current) class index, for highlighting "next". */
export function findNextClassIndex(classes: Array<{ start_time: string; end_time: string }>): number {
  const now = new Date();
  let nextIdx = -1;
  let soonest = Infinity;
  classes.forEach((c, i) => {
    const s = parseMinutes(c.start_time);
    const cur = now.getHours() * 60 + now.getMinutes();
    if (cur < s && s < soonest) {
      soonest = s;
      nextIdx = i;
    }
  });
  // if no upcoming, perhaps the current one as "active"
  if (nextIdx === -1) {
    const curIdx = classes.findIndex((c) => getClassStatus(c, now) === "current");
    if (curIdx >= 0) nextIdx = curIdx;
  }
  return nextIdx;
}

/** Human label for how far a class is (for upcoming). */
export function minutesUntil(start_time: string, now: Date = new Date()): number | null {
  const cur = now.getHours() * 60 + now.getMinutes();
  const s = parseMinutes(start_time);
  const d = s - cur;
  return d > 0 ? d : null;
}

/** Minutes left before a class ends (null once it is over). */
export function minutesRemaining(
  entry: { start_time: string; end_time: string },
  now: Date = new Date()
): number | null {
  const cur = now.getHours() * 60 + now.getMinutes();
  const end = parseMinutes(entry.end_time);
  const d = end - cur;
  return d > 0 ? d : null;
}

/** How far through a class we are, 0..100. */
export function classProgress(
  entry: { start_time: string; end_time: string },
  now: Date = new Date()
): number {
  const s = parseMinutes(entry.start_time);
  const e = parseMinutes(entry.end_time);
  if (e <= s) return 0;
  const cur = now.getHours() * 60 + now.getMinutes();
  return Math.max(0, Math.min(100, ((cur - s) / (e - s)) * 100));
}

/**
 * The class to put in front of the teacher right now: the one in progress, or
 * else the next one today. Drives the dashboard « maintenant » card and the
 * window status bar.
 */
export function focusClass<T extends { start_time: string; end_time: string }>(
  classes: T[],
  now: Date = new Date()
): { entry: T; state: "current" | "next" } | null {
  const sorted = [...classes].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const current = sorted.find((c) => getClassStatus(c, now) === "current");
  if (current) return { entry: current, state: "current" };
  const cur = now.getHours() * 60 + now.getMinutes();
  const upcoming = sorted.find((c) => parseMinutes(c.start_time) > cur);
  return upcoming ? { entry: upcoming, state: "next" } : null;
}

/** "1 h 05" / "22 min" — compact French duration for meta lines. */
export function humanMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${String(rest).padStart(2, "0")}`;
}

/** Local YYYY-MM-DD for <input type="date"> (not UTC, unlike toISOString().slice(0,10)). */
export function localYmd(date: Date = new Date(), offsetDays = 0): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Store a date-only picker value as end-of-local-day ISO so "today" stays today until midnight. */
export function localYmdToIso(yyyyMmDd: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const mo = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(y, mo - 1, d, 23, 59, 59, 999);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function calendarDayDiff(due: Date, now: Date): number {
  const a = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86_400_000);
}

export function formatDueLabel(dueIso: string | null | undefined): { text: string; tone: "default" | "soon" | "over" } {
  if (!dueIso) return { text: "", tone: "default" };
  const normalized = dueIso.includes("T") ? dueIso : dueIso.replace(" ", "T") + (dueIso.includes("Z") ? "" : "Z");
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return { text: "", tone: "default" };
  const now = new Date();
  const dayDiff = calendarDayDiff(d, now);
  if (dayDiff < 0) return { text: "en retard", tone: "over" };
  if (dayDiff === 0) return { text: "aujourd'hui", tone: "soon" };
  if (dayDiff === 1) return { text: "demain", tone: "soon" };
  if (dayDiff < 7) return { text: `dans ${dayDiff}j`, tone: "default" };
  return { text: d.toLocaleDateString("fr-FR", { month: "short", day: "numeric" }), tone: "default" };
}

export function getFaviconUrl(url: string): string | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    // Google's public favicon service (works for most domains, cached, no CORS issues for <img>)
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
  } catch {
    return null;
  }
}
