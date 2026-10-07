import { useCallback, useRef, useState } from "react";
import { api, type RunEvent, type TurtleOp } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { logged, reportError } from "../../lib/report";

export type ConsoleLine = { kind: "out" | "err" | "echo"; text: string };
export type CheckResult = { name: string; ok: boolean; message: string };
export type RunStatus =
  | { state: "idle" }
  | { state: "running"; startedAt: number }
  | { state: "input"; startedAt: number; prompt: string }
  | {
      state: "done";
      ok: boolean;
      seconds: number;
      reason?: "stopped" | "timeout" | "output" | "crash";
      code: number | null;
    };

/** More than this is kept off screen (the run itself caps output at 2 MB). */
const CONSOLE_KEEP = 400_000;

/**
 * One script run at a time: its console, drawings, figures and checks, fed
 * by the runner's events (src-tauri/src/runner.rs). Output is appended in
 * the batches the runner sends, so a print loop costs a render per batch,
 * not per line.
 */
export function useRun() {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [status, setStatus] = useState<RunStatus>({ state: "idle" });
  const [turtle, setTurtle] = useState<TurtleOp[]>([]);
  const [plots, setPlots] = useState<string[]>([]);
  const [checks, setChecks] = useState<CheckResult[] | null>(null);
  const runId = useRef<number | null>(null);
  const startedAt = useRef(0);

  const onEvents = useCallback((events: RunEvent[]) => {
    const out: ConsoleLine[] = [];
    const ops: TurtleOp[] = [];
    const figures: string[] = [];
    const results: CheckResult[] = [];
    let next: RunStatus | null = null;
    for (const e of events) {
      if (e.t === "out" || e.t === "err") {
        const last = out[out.length - 1];
        if (last && last.kind === e.t) last.text += e.s;
        else out.push({ kind: e.t, text: e.s });
      } else if (e.t === "input") next = { state: "input", startedAt: startedAt.current, prompt: e.prompt };
      else if (e.t === "turtle") ops.push(...e.ops);
      else if (e.t === "plot") figures.push(e.svg);
      else if (e.t === "check") results.push({ name: e.name, ok: e.ok, message: e.message });
      else if (e.t === "done") {
        runId.current = null;
        next = {
          state: "done",
          ok: e.ok,
          code: e.code,
          reason: e.reason,
          seconds: (performance.now() - startedAt.current) / 1000,
        };
      }
    }
    if (out.length) setLines((prev) => append(prev, out));
    if (ops.length) setTurtle((prev) => prev.concat(ops));
    if (figures.length) setPlots((prev) => prev.concat(figures));
    if (results.length) setChecks((prev) => (prev ?? []).concat(results));
    if (next) setStatus(next);
  }, []);

  const start = useCallback(
    async (req: { name: string; code: string; checks: boolean; timeoutS: number }) => {
      if (runId.current != null) api.pythonStop(runId.current).catch(logged("python.stopPrevious"));
      setLines([]);
      setTurtle([]);
      setPlots([]);
      setChecks(req.checks ? [] : null);
      startedAt.current = performance.now();
      setStatus({ state: "running", startedAt: startedAt.current });
      try {
        runId.current = await api.pythonRun(req, onEvents);
      } catch (err) {
        reportError("python.run", err);
        setLines([{ kind: "err", text: errorMessage(err, "Python n'a pas démarré.") + "\n" }]);
        setStatus({ state: "done", ok: false, code: null, reason: "crash", seconds: 0 });
      }
    },
    [onEvents],
  );

  const answer = useCallback(
    (text: string) => {
      const id = runId.current;
      if (id == null || status.state !== "input") return;
      setLines((prev) => append(prev, [{ kind: "echo", text: `${status.prompt}${text}\n` }]));
      setStatus({ state: "running", startedAt: status.startedAt });
      api.pythonInput(id, text).catch(logged("python.input"));
    },
    [status],
  );

  const stop = useCallback(() => {
    if (runId.current != null) api.pythonStop(runId.current).catch(logged("python.stop"));
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setTurtle([]);
    setPlots([]);
    setChecks(null);
    setStatus((s) => (s.state === "done" ? { state: "idle" } : s));
  }, []);

  return { lines, status, turtle, plots, checks, start, answer, stop, clear };
}

function append(prev: ConsoleLine[], more: ConsoleLine[]): ConsoleLine[] {
  const next = prev.slice();
  for (const line of more) {
    const last = next[next.length - 1];
    if (last && last.kind === line.kind)
      next[next.length - 1] = { kind: last.kind, text: last.text + line.text };
    else next.push(line);
  }
  // Keep the end: what was printed last is what the teacher reads.
  let size = next.reduce((n, l) => n + l.text.length, 0);
  while (size > CONSOLE_KEEP && next.length > 1) size -= next.shift()!.text.length;
  if (size > CONSOLE_KEEP) next[0] = { ...next[0], text: next[0].text.slice(size - CONSOLE_KEEP) };
  return next;
}
