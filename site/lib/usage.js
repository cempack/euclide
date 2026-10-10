// A report from the app, checked field by field: anyone can post to the
// address, so only what Euclide sends is kept, within sane bounds. Names
// are keys of a fixed form (a screen, a kind of action), never free text.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,4}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const AREA = /^[a-z][a-z-]{1,23}$/;
const EVENT = /^[a-z][a-z_]{1,31}$/;
const SYSTEMS = new Set(["windows", "linux", "macos", "other"]);
const ARCHES = new Set(["x86_64", "aarch64", "x86", "other"]);

export const MAX_BODY = 16 * 1024;

const int = (v, max) => Number.isInteger(v) && v >= 0 && v <= max;

function counts(value, key, max) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > 40) return null;
  const out = {};
  for (const [k, v] of entries) {
    if (!key.test(k) || !int(v, max)) return null;
    if (v > 0) out[k] = v;
  }
  return out;
}

/** The report, or `{ error }`. `now` bounds the days it may cover. */
export function parseReport(body, now = new Date()) {
  if (!body || typeof body !== "object") return { error: "not an object" };
  if (body.v !== 1) return { error: "unknown version" };
  if (typeof body.install !== "string" || !UUID.test(body.install)) return { error: "install" };
  if (typeof body.app !== "string" || !VERSION.test(body.app)) return { error: "app" };
  const os = SYSTEMS.has(body.os) ? body.os : "other";
  const arch = ARCHES.has(body.arch) ? body.arch : "other";
  if (typeof body.portable !== "boolean") return { error: "portable" };
  if (!Array.isArray(body.days) || body.days.length > 62) return { error: "days" };

  // The app's days are its own (local) dates: a day ahead is allowed.
  const earliest = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
  const latest = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  const days = [];
  const seen = new Set();
  for (const d of body.days) {
    if (!d || typeof d !== "object") return { error: "day" };
    if (typeof d.day !== "string" || !DAY.test(d.day) || Number.isNaN(Date.parse(d.day))) {
      return { error: "day" };
    }
    if (d.day < earliest || d.day > latest || seen.has(d.day)) return { error: "day range" };
    seen.add(d.day);
    if (!int(d.minutes, 1440)) return { error: "minutes" };
    const areas = counts(d.areas, AREA, 1440);
    const events = counts(d.events, EVENT, 100_000);
    if (!areas || !events) return { error: "counts" };
    days.push({ day: d.day, minutes: d.minutes, areas, events });
  }
  return { report: { install: body.install, app: body.app, os, arch, portable: body.portable, days } };
}
