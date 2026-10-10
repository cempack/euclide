// Numbers, sizes, durations and dates, the French way, in Paris time.

const TZ = "Europe/Paris";
const int = new Intl.NumberFormat("fr-FR");

export const number = (n) => int.format(n);

export function size(bytes) {
  if (bytes >= 1e6)
    return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(bytes / 1e6)} Mo`;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(bytes / 1e3)} ko`;
}

/** 95 → « 1 h 35 », 40 → « 40 min ». */
export function duration(minutes) {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${number(h)} h ${String(rest).padStart(2, "0")}` : `${number(h)} h`;
}

export function date(iso, opts = { day: "numeric", month: "long", year: "numeric" }) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, ...opts }).format(new Date(iso));
}

export const shortDay = (day) => date(`${day}T12:00:00Z`, { day: "numeric", month: "short" });

/** « il y a 3 h », « il y a 2 jours », or the date beyond a week. */
export function ago(iso, now = Date.now()) {
  if (!iso) return "jamais";
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 90) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86_400) return `il y a ${Math.round(s / 3600)} h`;
  if (s < 7 * 86_400) {
    const d = Math.round(s / 86_400);
    return `il y a ${d} jour${d > 1 ? "s" : ""}`;
  }
  return date(iso, { day: "numeric", month: "short", year: "numeric" });
}
