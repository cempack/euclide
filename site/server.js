// euclide.elliotmoreau.fr: the landing page, the downloads, the changelog
// (all from GitHub), the endpoint the app sends its statistics to, and a
// dashboard behind a password at /admin. Node alone, no dependency.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import * as auth from "./lib/auth.js";
import { countView, openDb, saveReport, stats } from "./lib/db.js";
import { changelog as fetchChangelog, releases as fetchReleases } from "./lib/github.js";
import { releases as changelogReleases } from "./lib/markdown.js";
import * as pages from "./lib/pages.js";
import { MAX_BODY, parseReport } from "./lib/usage.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC = join(ROOT, "public");
const PORT = Number(process.env.PORT) || 3000;
const db = openDb(process.env.DATA_DIR || join(ROOT, "data"));

const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};

const SECURITY = {
  "Content-Security-Policy":
    "default-src 'none'; style-src 'self'; img-src 'self' https://raw.githubusercontent.com data:; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY, ...headers });
  res.end(body);
}

const html = (res, body, status = 200, extra = {}) =>
  send(res, status, body, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
    ...extra,
  });

/** The visitor's address, behind Railway's proxy: only for rate limits, never kept. */
const clientIp = (req) =>
  String(req.headers["x-forwarded-for"] ?? "")
    .split(",")[0]
    .trim() ||
  req.socket.remoteAddress ||
  "?";

const secure = (req) => req.headers["x-forwarded-proto"] === "https";

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("too large"), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function cookie(req, name) {
  for (const part of String(req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|curl|wget|python|monitor/i;
const today = () => new Date().toISOString().slice(0, 10);

function countVisit(req, path) {
  if (BOT.test(String(req.headers["user-agent"] ?? ""))) return;
  try {
    countView(db, today(), path);
  } catch (err) {
    console.error("[views]", err.message);
  }
}

// The app's reports: a few an hour per address at most.
const reportsByIp = new Map();
function reportAllowed(ip) {
  const now = Date.now();
  const r = reportsByIp.get(ip);
  if (!r || now - r.since > 3_600_000) {
    reportsByIp.set(ip, { since: now, count: 1 });
    return true;
  }
  r.count += 1;
  return r.count <= 30;
}

async function staticFile(res, path) {
  const rel = normalize(path.replace(/^\/assets\//, "")).replace(/^(\.\.[/\\])+/, "");
  const file = join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) return send(res, 404, "Not found");
  try {
    const body = await readFile(file);
    const long = file.endsWith(".woff2") || file.endsWith(".svg");
    send(res, 200, body, {
      "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      "Cache-Control": long ? "public, max-age=31536000, immutable" : "public, max-age=3600",
    });
  } catch {
    send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
  }
}

async function latest() {
  try {
    return await fetchReleases();
  } catch (err) {
    console.error("[github]", err.message);
    return [];
  }
}

async function route(req, res) {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method ?? "GET";

  if (path === "/healthz") return send(res, 200, "ok", { "Content-Type": "text/plain" });
  if (path === "/robots.txt") {
    return send(res, 200, "User-agent: *\nDisallow: /admin\nDisallow: /api\n", {
      "Content-Type": "text/plain; charset=utf-8",
    });
  }
  if (path.startsWith("/assets/") && (method === "GET" || method === "HEAD")) return staticFile(res, path);

  // The app's statistics.
  if (path === "/api/usage") {
    if (method !== "POST") return send(res, 405, "", { Allow: "POST" });
    if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) return send(res, 415, "");
    const ip = clientIp(req);
    if (!reportAllowed(ip)) return send(res, 429, "", { "Retry-After": "3600" });
    let body;
    try {
      body = JSON.parse(await readBody(req, MAX_BODY));
    } catch (err) {
      return send(res, err.status ?? 400, "");
    }
    const { report, error } = parseReport(body);
    if (!report) return send(res, 400, error, { "Content-Type": "text/plain" });
    saveReport(db, report, new Date().toISOString());
    return send(res, 204, "");
  }

  // The dashboard.
  if (path === "/admin/login" && method === "POST") {
    if (!auth.adminEnabled()) return html(res, pages.login({ disabled: true }), 503);
    const ip = clientIp(req);
    if (auth.lockedOut(ip)) {
      return html(res, pages.login({ error: "Trop d'essais : réessayez dans un quart d'heure." }), 429);
    }
    const form = new URLSearchParams(await readBody(req, 4096).catch(() => ""));
    if (!auth.passwordMatches(form.get("password"))) {
      auth.recordFailure(ip);
      return html(res, pages.login({ error: "Mot de passe incorrect." }), 401);
    }
    auth.clearFailures(ip);
    return send(res, 303, "", {
      Location: "/admin",
      "Set-Cookie": auth.sessionCookie(auth.newSession(), secure(req)),
    });
  }
  if (path === "/admin/logout" && method === "POST") {
    return send(res, 303, "", { Location: "/admin", "Set-Cookie": auth.clearedCookie(secure(req)) });
  }
  if (path === "/admin") {
    if (!auth.adminEnabled()) return html(res, pages.login({ disabled: true }), 503);
    if (!auth.validSession(cookie(req, auth.COOKIE))) return html(res, pages.login({}));
    const span = [7, 30, 90].includes(Number(url.searchParams.get("jours")))
      ? Number(url.searchParams.get("jours"))
      : 30;
    return html(res, pages.dashboard({ stats: stats(db, { span }), releases: await latest() }), 200, {
      "Cache-Control": "no-store",
    });
  }

  if (method !== "GET" && method !== "HEAD") return send(res, 405, "", { Allow: "GET" });
  const system = pages.systemOf(String(req.headers["user-agent"] ?? ""));

  if (path === "/") {
    countVisit(req, "/");
    const list = await latest();
    let latestNotes = null;
    if (list[0]) {
      try {
        latestNotes = changelogReleases(await fetchChangelog(list[0].tag)).find(
          (r) => r.version === list[0].version,
        )?.body;
      } catch (err) {
        console.error("[github]", err.message);
      }
    }
    return html(res, pages.landing({ release: list[0], latestNotes, system }));
  }
  if (path === "/telecharger") {
    countVisit(req, "/telecharger");
    return html(res, pages.downloads({ releases: await latest(), system }));
  }
  if (path === "/nouveautes") {
    countVisit(req, "/nouveautes");
    const list = await latest();
    if (!list[0]) return html(res, pages.unavailable(), 503);
    let entries = [];
    try {
      entries = changelogReleases(await fetchChangelog(list[0].tag));
    } catch (err) {
      console.error("[github]", err.message);
    }
    return html(res, pages.changelog({ entries, releases: list, tag: list[0].tag }));
  }
  if (path === "/confidentialite") {
    countVisit(req, "/confidentialite");
    return html(res, pages.privacy());
  }
  // Old habits and English: the same pages.
  const aliases = {
    "/download": "/telecharger",
    "/changelog": "/nouveautes",
    "/telechargement": "/telecharger",
    "/privacy": "/confidentialite",
  };
  if (aliases[path]) return send(res, 301, "", { Location: aliases[path] });
  return html(res, pages.notFound(), 404);
}

const server = createServer((req, res) => {
  route(req, res).catch((err) => {
    console.error("[server]", err);
    if (!res.headersSent) send(res, 500, "Erreur", { "Content-Type": "text/plain; charset=utf-8" });
    else res.end();
  });
});

server.listen(PORT, () => console.log(`euclide-site on :${PORT}`));

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
