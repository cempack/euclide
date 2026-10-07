/**
 * Uncaught errors, rejected promises, render crashes and anything the content
 * security policy blocks are written to `Euclide-Data/logs/euclide.log` by
 * the backend, so a problem on the school PC leaves a trace. Repeats are
 * dropped and a session logs at most 100 lines: a render loop must not flood
 * the USB key. Nothing is sent anywhere else.
 */

const MAX_LINES = 100;

const seen = new Set<string>();
let pending: string[] = [];
let flushTimer = 0;
let started = false;

function flush() {
  flushTimer = 0;
  const lines = pending;
  pending = [];
  // Imported lazily: lib/api is a large module and this one loads first.
  void import("./api").then(({ api, isTauri }) => {
    if (isTauri()) api.logErrors(lines).catch(() => {});
    else if (import.meta.env.DEV) console.debug("[report]", lines.join("\n"));
  });
}

/** Add one line to euclide.log (deduplicated, batched, capped per session). */
export function reportLine(line: string) {
  if (seen.has(line) || seen.size >= MAX_LINES) return;
  seen.add(line);
  pending.push(line);
  if (!flushTimer) flushTimer = window.setTimeout(flush, 2000);
}

/** One line for any thrown value: name, message and the first stack frame. */
export function describeError(err: unknown): string {
  if (err instanceof Error) {
    const frame = err.stack
      ?.split("\n")
      .slice(1)
      .find((l) => l.trim())
      ?.trim();
    return frame ? `${err.name}: ${err.message} (${frame})` : `${err.name}: ${err.message}`;
  }
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}

/** Listen for errors the app did not handle. Idempotent. */
export function startReporting() {
  if (started) return;
  started = true;
  window.addEventListener("error", (e) => {
    // Failed <img>/<script> loads also fire "error", with no message.
    if (!e.error && !e.message) return;
    reportLine(`error ${e.error ? describeError(e.error) : e.message} at ${e.filename}:${e.lineno}`);
  });
  window.addEventListener("unhandledrejection", (e) => reportLine(`rejection ${describeError(e.reason)}`));
  document.addEventListener("securitypolicyviolation", (e) => {
    reportLine(
      `csp ${e.effectiveDirective} blocked ${e.blockedURI || "inline"} in ${e.sourceFile || "?"}:${e.lineNumber}`,
    );
  });
}
