import { t, get } from "./i18n";

export function greeting(date = new Date()): string {
  // All messages live in ONE place: src/locales/strings.json (edit the "greetings" array there).
  // Picks a stable greeting for the day (different days get different ones from the pool).
  const pool: string[] = (t && t.greetings && Array.isArray(t.greetings) && t.greetings.length > 0)
    ? t.greetings
    : (get("greetings", ["Bonjour Monsieur Madrias"]) as string[]);
  if (pool.length === 0) return "Bonjour";
  // Deterministic index based on date so it doesn't change on re-renders or within the day.
  const seed = date.getDate() + (date.getMonth() * 31) + (date.getFullYear() % 100 * 400);
  const idx = seed % pool.length;
  return pool[idx];
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

// Returns a kind key for compatibility. Visual icons are now provided by
// the FileKindIcon component in components/icons.tsx (proper SVGs, no emojis).
export function fileKindIcon(kind: string): string {
  return kind || "file";
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
