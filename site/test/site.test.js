// node --test: the pieces the site relies on, without network.

import { test } from "node:test";
import assert from "node:assert/strict";

import { inline, releases, render } from "../lib/markdown.js";
import { parseReport } from "../lib/usage.js";
import { openDb, saveReport, countView, stats } from "../lib/db.js";
import { downloadsOf, systemOf, landing, dashboard } from "../lib/pages.js";
import { platformOf } from "../lib/github.js";

const NOW = new Date("2026-10-10T12:00:00Z");
const INSTALL = "3f2b8c1e-9a4d-4c2b-8e1f-0a1b2c3d4e5f";

test("markdown escapes text and keeps only http(s) links", () => {
  assert.equal(inline("<b>« A » & co</b>"), "&lt;b&gt;« A » &amp; co&lt;/b&gt;");
  assert.equal(inline("[x](javascript:void0)"), "x");
  assert.equal(inline("[x](//evil.example/a)"), "x");
  assert.equal(inline("**Gras** et `code`"), "<strong>Gras</strong> et <code>code</code>");
  assert.match(
    inline("![Une capture](docs/a.jpg)", (p) => `https://raw.example/${p}`),
    /<img src="https:\/\/raw\.example\/docs\/a\.jpg" alt="Une capture"/,
  );
  // A relative picture with nothing to resolve it is dropped, its words kept.
  assert.equal(inline("![Une capture](docs/a.jpg)"), "Une capture");
});

test("markdown renders a changelog section", () => {
  const html = render(
    "### PDF\n\n- **Annoter** : stylo\n- Imprimer\n\n![Capture](docs/x.jpg)\n\nUn paragraphe.",
    (p) => `https://r/${p}`,
  );
  assert.match(html, /^<h3>PDF<\/h3>/);
  assert.match(html, /<ul><li><strong>Annoter<\/strong> : stylo<\/li><li>Imprimer<\/li><\/ul>/);
  assert.match(html, /<figure><img src="https:\/\/r\/docs\/x\.jpg"/);
  assert.match(html, /<p>Un paragraphe\.<\/p>/);
});

test("the changelog splits into versions, newest first", () => {
  const list = releases("# Journal\n\nIntro.\n\n## 0.6.1\n\n- Un\n\n## 0.6.0\n\n### PDF\n\n- Deux\n");
  assert.deepEqual(
    list.map((r) => r.version),
    ["0.6.1", "0.6.0"],
  );
  assert.equal(list[0].body, "- Un");
});

const goodReport = (over = {}) => ({
  v: 1,
  install: INSTALL,
  app: "0.6.1",
  os: "windows",
  arch: "x86_64",
  portable: true,
  days: [{ day: "2026-10-09", minutes: 95, areas: { pdf: 60, board: 35 }, events: { note_write: 4 } }],
  ...over,
});

test("a report is kept as sent, and what is not Euclide's shape is refused", () => {
  const { report } = parseReport(goodReport(), NOW);
  assert.equal(report.days[0].minutes, 95);
  assert.deepEqual(report.days[0].areas, { pdf: 60, board: 35 });

  for (const bad of [
    goodReport({ v: 2 }),
    goodReport({ install: "not-a-uuid" }),
    goodReport({ app: "<script>" }),
    goodReport({ portable: "yes" }),
    goodReport({ days: [{ day: "2026-10-09", minutes: 5000 }] }),
    goodReport({ days: [{ day: "2025-01-01", minutes: 5 }] }),
    goodReport({ days: [{ day: "2026-10-09", minutes: 5, areas: { "Élève Martin": 5 } }] }),
    goodReport({ days: [{ day: "2026-10-09", minutes: 5, events: { note_write: -1 } }] }),
  ]) {
    assert.ok(parseReport(bad, NOW).error, JSON.stringify(bad).slice(0, 80));
  }
  // An unknown system is kept as « other », not refused.
  assert.equal(parseReport(goodReport({ os: "haiku" }), NOW).report.os, "other");
});

test("a day sent again replaces the first, and the dashboard adds it all up", () => {
  const db = openDb(":memory:");
  saveReport(db, parseReport(goodReport(), NOW).report, NOW.toISOString());
  // Later the same day: today grew, yesterday is sent again whole.
  const again = goodReport({
    days: [
      { day: "2026-10-09", minutes: 95, areas: { pdf: 60, board: 35 }, events: { note_write: 4 } },
      { day: "2026-10-10", minutes: 20, areas: { python: 20 }, events: { demo_run: 7 } },
    ],
  });
  saveReport(db, parseReport(again, NOW).report, NOW.toISOString());
  countView(db, "2026-10-10", "/");
  countView(db, "2026-10-10", "/");

  const s = stats(db, { span: 7, now: NOW });
  assert.equal(s.totalInstalls, 1);
  assert.equal(s.activeInstalls, 1);
  assert.equal(s.minutes, 115);
  assert.equal(s.activeDays, 2);
  assert.deepEqual(Object.fromEntries(s.areas), { pdf: 60, board: 35, python: 20 });
  assert.deepEqual(Object.fromEntries(s.events), { note_write: 4, demo_run: 7 });
  assert.equal(s.days.length, 7);
  assert.equal(s.days.at(-1).minutes, 20);
  assert.equal(s.viewsTotal, 2);

  const html = dashboard({ stats: s, releases: [], now: NOW.getTime() });
  assert.match(html, /1 h 55/);
  assert.match(html, /Scripts Python lancés/);
});

test("downloads: the right file for each system, the USB zip first on Windows", () => {
  const release = {
    version: "0.6.0",
    tag: "v0.6.0",
    publishedAt: "2026-10-10T09:39:22Z",
    assets: [
      "Euclide-linux-portable.AppImage",
      "Euclide-macos-aarch64-portable.zip",
      "Euclide-windows-portable.zip",
      "Euclide_0.6.0_aarch64.app.tar.gz",
      "Euclide_0.6.0_amd64.AppImage",
      "Euclide_0.6.0_amd64.AppImage.sig",
      "Euclide_0.6.0_x64-setup.exe",
      "latest.json",
    ].map((name) => ({
      name,
      size: 28_000_000,
      downloads: 3,
      url: `https://x/${name}`,
      platform: platformOf(name),
    })),
  };
  assert.deepEqual(
    downloadsOf(release).map((d) => `${d.id}:${d.asset.name}`),
    [
      "windows-portable:Euclide-windows-portable.zip",
      "windows-installer:Euclide_0.6.0_x64-setup.exe",
      "linux:Euclide-linux-portable.AppImage",
      "macos:Euclide-macos-aarch64-portable.zip",
    ],
  );
  assert.equal(systemOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "windows");
  assert.equal(systemOf("Mozilla/5.0 (X11; Linux x86_64)"), "linux");
  assert.equal(systemOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)"), "macos");
  assert.equal(systemOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), "mobile");

  const page = landing({ release, latestNotes: "- **Annoter** : stylo", system: "linux" });
  assert.match(
    page,
    /href="https:\/\/x\/Euclide-linux-portable\.AppImage"[^>]*>[\s\S]*Télécharger pour Linux/,
  );
  assert.match(page, /<strong>Annoter<\/strong>/);
});
