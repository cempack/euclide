/**
 * Timings for diagnosing slowness on the teacher's machine.
 *
 * Collected in memory and written to `Euclide-Data/logs/perf.log` by the
 * backend: once when the dashboard has its data, then a summary every ten
 * minutes and when the window is hidden. Nothing is sent anywhere else.
 */

type Stat = { n: number; total: number; max: number; samples: number[] };

const stats = new Map<string, Stat>();
let longTasks = { n: 0, total: 0 };
let tabSwitchStart: number | null = null;
let readyLogged = false;
let started = false;

function record(name: string, ms: number) {
  let s = stats.get(name);
  if (!s) {
    s = { n: 0, total: 0, max: 0, samples: [] };
    stats.set(name, s);
  }
  s.n++;
  s.total += ms;
  s.max = Math.max(s.max, ms);
  // Keep a bounded window for the 95th percentile.
  if (s.samples.length < 200) s.samples.push(ms);
  else s.samples[s.n % 200] = ms;
}

const round = (ms: number) => Math.round(ms);

/** Duration of one IPC call (recorded by `invoke` in lib/api.ts). */
export function recordIpc(cmd: string, ms: number) {
  record(`ipc.${cmd}`, ms);
}

/** The active tab is about to change. */
export function tabSwitchBegin() {
  tabSwitchStart = performance.now();
}

/** The new tab has been rendered and painted. */
export function tabSwitchEnd() {
  if (tabSwitchStart == null) return;
  const t0 = tabSwitchStart;
  tabSwitchStart = null;
  requestAnimationFrame(() => record("tab.switch", performance.now() - t0));
}

function send(lines: string[]) {
  if (!lines.length) return;
  // Imported lazily: lib/api imports this module for `recordIpc`.
  void import("./api").then(({ api, isTauri }) => {
    if (isTauri()) api.logPerf(lines).catch(() => {});
    else if (import.meta.env.DEV) console.debug("[perf]", lines.join("\n"));
  });
}

/**
 * The first screen is usable, logged once: the dashboard once its data is in,
 * any other screen restored at launch once it has rendered.
 */
export function appReady(firstScreen = "dashboard") {
  if (readyLogged) return;
  readyLogged = true;
  const lines = [`app.ready_ms=${round(performance.now())}`, `app.ready_screen=${firstScreen}`];
  const fcp = performance.getEntriesByName("first-contentful-paint")[0];
  if (fcp) lines.push(`app.first_paint_ms=${round(fcp.startTime)}`);
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  if (memory) lines.push(`app.js_heap_mb=${Math.round(memory.usedJSHeapSize / 1048576)}`);
  lines.push(`app.screen=${screen.width}x${screen.height}@${window.devicePixelRatio}`);
  send(lines);
}

function summary(): string[] {
  const lines: string[] = [];
  for (const [name, s] of [...stats.entries()].sort()) {
    const sorted = [...s.samples].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
    lines.push(`${name} n=${s.n} avg=${round(s.total / s.n)} p95=${round(p95)} max=${round(s.max)}`);
  }
  if (longTasks.n) lines.push(`longtask n=${longTasks.n} total_ms=${round(longTasks.total)}`);
  stats.clear();
  longTasks = { n: 0, total: 0 };
  return lines;
}

/** Start the long-task observer and the periodic summary. Idempotent. */
export function startPerf() {
  if (started) return;
  started = true;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks.n++;
        longTasks.total += entry.duration;
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {
    // WebKit has no long-task timing; IPC and tab timings still work.
  }
  window.setInterval(() => send(summary()), 10 * 60_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") send(summary());
  });
}
