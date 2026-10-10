// What the site keeps, in one SQLite file: each copy of Euclide that sends
// its statistics (a random id, its version and system), one line per copy
// and day of use, and how many times each page of the site was seen. No IP
// address, no cookie but the admin's.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS installs (
  id         TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen  TEXT NOT NULL,
  version    TEXT NOT NULL,
  os         TEXT NOT NULL,
  arch       TEXT NOT NULL,
  portable   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS usage_days (
  install_id  TEXT NOT NULL,
  day         TEXT NOT NULL,
  version     TEXT NOT NULL,
  minutes     INTEGER NOT NULL,
  areas       TEXT NOT NULL,
  events      TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (install_id, day)
);
CREATE INDEX IF NOT EXISTS usage_days_day ON usage_days(day);
CREATE TABLE IF NOT EXISTS page_views (
  day   TEXT NOT NULL,
  path  TEXT NOT NULL,
  views INTEGER NOT NULL,
  PRIMARY KEY (day, path)
);
`;

export function openDb(dir) {
  let file = ":memory:";
  if (dir !== ":memory:") {
    mkdirSync(dir, { recursive: true });
    file = join(dir, "euclide-site.db");
  }
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 2000;");
  db.exec(SCHEMA);
  return db;
}

/**
 * A report from the app: its copy, then each day it covers. A day sent
 * again replaces the one before: the app sends a day's whole totals, so
 * today's grows through the day.
 */
export function saveReport(db, report, nowIso) {
  db.prepare(
    `INSERT INTO installs (id, first_seen, last_seen, version, os, arch, portable)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen, version = excluded.version,
       os = excluded.os, arch = excluded.arch, portable = excluded.portable`,
  ).run(report.install, nowIso, nowIso, report.app, report.os, report.arch, report.portable ? 1 : 0);
  const day = db.prepare(
    `INSERT INTO usage_days (install_id, day, version, minutes, areas, events, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(install_id, day) DO UPDATE SET version = excluded.version, minutes = excluded.minutes,
       areas = excluded.areas, events = excluded.events, received_at = excluded.received_at`,
  );
  db.exec("BEGIN");
  try {
    for (const d of report.days) {
      day.run(
        report.install,
        d.day,
        report.app,
        d.minutes,
        JSON.stringify(d.areas),
        JSON.stringify(d.events),
        nowIso,
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function countView(db, day, path) {
  db.prepare(
    `INSERT INTO page_views (day, path, views) VALUES (?, ?, 1)
     ON CONFLICT(day, path) DO UPDATE SET views = views + 1`,
  ).run(day, path);
}

const isoDay = (date) => date.toISOString().slice(0, 10);

/** The days from `from` to `to` (YYYY-MM-DD), both included. */
export function daysBetween(from, to) {
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); isoDay(d) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(isoDay(d));
  }
  return out;
}

const add = (into, from) => {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
  return into;
};

/** Everything the dashboard shows, over the last `span` days. */
export function stats(db, { span, now = new Date() }) {
  const today = isoDay(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (span - 1));
  const from = isoDay(start);

  const installs = db.prepare("SELECT * FROM installs ORDER BY last_seen DESC").all();
  const rows = db
    .prepare("SELECT install_id, day, minutes, areas, events FROM usage_days WHERE day >= ? AND day <= ?")
    .all(from, today);

  const perDay = new Map(
    daysBetween(from, today).map((d) => [d, { day: d, minutes: 0, installs: new Set() }]),
  );
  const perInstall = new Map();
  const areas = {};
  const events = {};
  let minutes = 0;
  let activeDays = 0;
  for (const r of rows) {
    const day = perDay.get(r.day);
    minutes += r.minutes;
    if (r.minutes > 0) activeDays += 1;
    if (day) {
      day.minutes += r.minutes;
      if (r.minutes > 0) day.installs.add(r.install_id);
    }
    const mine = perInstall.get(r.install_id) ?? { minutes: 0, days: 0 };
    mine.minutes += r.minutes;
    if (r.minutes > 0) mine.days += 1;
    perInstall.set(r.install_id, mine);
    add(areas, JSON.parse(r.areas));
    add(events, JSON.parse(r.events));
  }

  const active = [...perInstall.entries()].filter(([, v]) => v.minutes > 0).length;
  const tally = (key) =>
    Object.entries(
      installs.reduce((acc, i) => {
        acc[i[key]] = (acc[i[key]] ?? 0) + 1;
        return acc;
      }, {}),
    ).sort((a, b) => b[1] - a[1]);

  const views = db
    .prepare("SELECT day, path, SUM(views) AS views FROM page_views WHERE day >= ? GROUP BY day, path")
    .all(from);
  const viewsByPath = {};
  const viewsByDay = new Map(daysBetween(from, today).map((d) => [d, 0]));
  for (const v of views) {
    viewsByPath[v.path] = (viewsByPath[v.path] ?? 0) + v.views;
    if (viewsByDay.has(v.day)) viewsByDay.set(v.day, viewsByDay.get(v.day) + v.views);
  }

  return {
    span,
    from,
    today,
    totalInstalls: installs.length,
    activeInstalls: active,
    minutes,
    activeDays,
    lastSeen: installs[0]?.last_seen ?? null,
    days: [...perDay.values()].map((d) => ({ day: d.day, minutes: d.minutes, installs: d.installs.size })),
    areas: Object.entries(areas).sort((a, b) => b[1] - a[1]),
    events: Object.entries(events).sort((a, b) => b[1] - a[1]),
    versions: tally("version"),
    systems: tally("os"),
    portable: installs.filter((i) => i.portable).length,
    installs: installs.map((i) => ({ ...i, period: perInstall.get(i.id) ?? { minutes: 0, days: 0 } })),
    views: Object.entries(viewsByPath).sort((a, b) => b[1] - a[1]),
    viewsTotal: Object.values(viewsByPath).reduce((a, b) => a + b, 0),
    viewsByDay: [...viewsByDay.entries()].map(([day, n]) => ({ day, views: n })),
  };
}
