import { useEffect, useRef, useState, type ReactNode } from "react";
import { changed } from "../../api/client";
import { Check, CornerDownLeft, Download, Eraser, X } from "lucide-react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { tr, trn } from "../../lib/i18n";
import { keysOf } from "../../lib/keymap";
import { reportError } from "../../lib/report";
import { useToast } from "../../components/ui";
import { Icon } from "../../ui/Icon";
import { Kbd } from "../../ui/Kbd";
import { tip } from "../../ui/Tooltip";
import { canvasPng, TurtleCanvas } from "./TurtleCanvas";
import type { ConsoleLine, CheckResult, RunStatus } from "./useRun";
import type { TurtleOp } from "../../lib/api";

export type OutputTab = "console" | "drawing" | "checks";

/**
 * The script's output, under the editor: console, drawing, checks. A desk
 * surface of the app's theme (light in light, dark in dark), the drawings
 * on paper in both.
 */
export function OutputPanel({
  tab,
  onTab,
  lines,
  status,
  turtle,
  plots,
  checks,
  scriptName,
  onAnswer,
  onClear,
}: {
  tab: OutputTab;
  onTab: (tab: OutputTab) => void;
  lines: ConsoleLine[];
  status: RunStatus;
  turtle: TurtleOp[];
  plots: string[];
  checks: CheckResult[] | null;
  scriptName: string;
  onAnswer: (text: string) => void;
  onClear: () => void;
}) {
  const hasDrawing = turtle.length > 0 || plots.length > 0;
  const passed = checks?.filter((c) => c.ok).length ?? 0;
  const tabs: { id: OutputTab; label: string; badge?: ReactNode }[] = [
    { id: "console", label: tr("python.console") },
    ...(hasDrawing ? [{ id: "drawing" as const, label: tr("python.drawing") }] : []),
    ...(checks
      ? [
          {
            id: "checks" as const,
            label: tr("python.checks"),
            badge: checks.length ? (
              <span className={passed === checks.length ? "eu-chip-ok" : "eu-chip-danger"}>
                {passed}/{checks.length}
              </span>
            ) : undefined,
          },
        ]
      : []),
  ];
  const shown = tabs.some((t) => t.id === tab) ? tab : "console";
  const running = status.state === "running" || status.state === "input";
  const clearLabel = tr("python.clearConsole");

  return (
    <div className="eu-output">
      <div className="eu-output-bar">
        <div className="eu-output-tabs" role="tablist" aria-label={tr("python.output")}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={shown === t.id}
              onClick={() => onTab(t.id)}
              className="eu-output-tab"
            >
              {t.label}
              {t.badge}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <StatusChip status={status} />
        {shown === "console" && lines.length > 0 && !running && (
          <button
            type="button"
            onClick={onClear}
            aria-label={clearLabel}
            {...tip(clearLabel)}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
          >
            <Icon icon={Eraser} size={14} />
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {shown === "console" && <Console lines={lines} status={status} onAnswer={onAnswer} />}
        {shown === "drawing" && <Drawing turtle={turtle} plots={plots} scriptName={scriptName} />}
        {shown === "checks" && checks && <Checks checks={checks} status={status} />}
      </div>
    </div>
  );
}

/** Where the run is: a dot in the state's colour, and the time it took. */
function StatusChip({ status }: { status: RunStatus }) {
  const [now, setNow] = useState(() => performance.now());
  const live = status.state === "running";
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(performance.now()), 500);
    return () => window.clearInterval(id);
  }, [live]);
  if (status.state === "idle") return null;
  const [text, tone] = statusLine(status, now);
  return (
    <span className="eu-output-status" data-tone={tone} role="status">
      <span className="eu-output-status-dot" aria-hidden />
      {text}
    </span>
  );
}

type Tone = "run" | "ask" | "ok" | "fail" | "off";

/** The run's state in words, and its colour. */
function statusLine(status: Exclude<RunStatus, { state: "idle" }>, now: number): [string, Tone] {
  if (status.state === "running")
    return [tr("python.running", { s: seconds((now - status.startedAt) / 1000) }), "run"];
  if (status.state === "input") return [tr("python.waitingInput"), "ask"];
  if (status.reason === "stopped") return [tr("python.stopped"), "off"];
  if (status.reason === "timeout") return [tr("python.timedOut"), "fail"];
  if (status.reason === "output") return [tr("python.tooMuchOutput"), "fail"];
  const s = seconds(status.seconds);
  return status.ok ? [tr("python.finished", { s }), "ok"] : [tr("python.failedIn", { s }), "fail"];
}

const seconds = (s: number) => (s < 10 ? s.toFixed(1) : Math.round(s).toString()).replace(".", ",");

/** A sentence with its shortcut drawn as keys where « {keys} » stands. */
function WithKeys({ text, keys }: { text: string; keys: string }) {
  const [before, after = ""] = text.split("{keys}");
  return (
    <>
      {before}
      <Kbd keys={keys} className="align-middle" />
      {after}
    </>
  );
}

function Console({
  lines,
  status,
  onAnswer,
}: {
  lines: ConsoleLine[];
  status: RunStatus;
  onAnswer: (text: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const asking = status.state === "input";

  // Follow the output, unless the teacher scrolled up to read.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80 || asking) el.scrollTop = el.scrollHeight;
  }, [lines, asking]);
  useEffect(() => {
    if (asking) inputRef.current?.focus();
  }, [asking]);

  const empty = lines.length === 0 && status.state === "idle";
  return (
    <div ref={scrollRef} className="eu-console selectable">
      {empty && (
        <div className="eu-console-hint">
          <p>
            <WithKeys text={tr("tools.runHint")} keys={keysOf("runPython")} />
          </p>
          <p>
            <WithKeys text={tr("python.checkHint")} keys={keysOf("checkPython")} />
          </p>
        </div>
      )}
      <pre className="whitespace-pre-wrap break-words m-0">
        {lines.map((line, i) => (
          <span key={i} data-kind={line.kind}>
            {line.text}
          </span>
        ))}
        {status.state === "done" && lines.length === 0 && (
          <span className="text-ink-faint">{tr("tools.noOutput")}</span>
        )}
      </pre>
      {asking && (
        <form
          className="eu-console-ask"
          onSubmit={(e) => {
            e.preventDefault();
            onAnswer(value);
            setValue("");
          }}
        >
          <span className="text-accent whitespace-pre">{status.prompt}</span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={status.prompt || tr("python.inputLabel")}
            className="eu-input eu-field-sm flex-1 min-w-0 font-mono"
          />
          <button type="submit" className="eu-btn-ghost eu-btn-sm">
            <Icon icon={CornerDownLeft} size={14} />
            {tr("python.send")}
          </button>
        </form>
      )}
    </div>
  );
}

function Drawing({ turtle, plots, scriptName }: { turtle: TurtleOp[]; plots: string[]; scriptName: string }) {
  const toast = useToast();
  const turtleBox = useRef<HTMLDivElement>(null);
  const base = scriptName.replace(/\.py$/i, "") || "dessin";

  const saveBlob = async (blob: Blob | null, name: string) => {
    try {
      if (!blob) throw new Error("L'image n'a pas pu être créée.");
      await api.createFileBytes(name, await blob.arrayBuffer());
      changed("library");
      toast(tr("python.savedToLibrary", { name }), "success");
    } catch (err) {
      reportError("python.saveDrawing", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    }
  };

  const saveTurtle = async () => {
    const canvas = turtleBox.current?.querySelector("canvas");
    if (canvas) await saveBlob(await canvasPng(canvas), `${base} — dessin.png`);
  };

  const savePlot = async (svg: string, i: number) => {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth * 2;
    canvas.height = img.naturalHeight * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0);
    await saveBlob(await canvasPng(canvas), `${base} — graphique ${i + 1}.png`);
  };

  return (
    // Each drawing is a sheet on the desk; several scroll sideways.
    <div className="eu-drawings">
      {turtle.length > 0 && (
        // The turtle's sheet takes the room left; its drawing scales to fit.
        <figure className="m-0 h-full flex-1 min-w-64 flex flex-col gap-1.5">
          <div ref={turtleBox} className="eu-sheet flex-1 min-h-0">
            <TurtleCanvas ops={turtle} label={tr("python.turtleLabel")} />
          </div>
          <SaveButton onClick={saveTurtle} />
        </figure>
      )}
      {plots.map((svg, i) => (
        <figure key={i} className="m-0 h-full shrink-0 flex flex-col gap-1.5">
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
            alt={tr("python.plotLabel", { n: i + 1 })}
            className="eu-sheet flex-1 min-h-0 w-auto object-contain"
          />
          <SaveButton onClick={() => void savePlot(svg, i)} />
        </figure>
      ))}
    </div>
  );
}

function SaveButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="eu-btn-quiet eu-btn-sm self-start">
      <Icon icon={Download} size={14} />
      {tr("python.saveImage")}
    </button>
  );
}

function Checks({ checks, status }: { checks: CheckResult[]; status: RunStatus }) {
  if (!checks.length) {
    return (
      <p className="p-3 text-small text-ink-muted">
        {status.state === "done" ? tr("python.checksNotRun") : tr("python.checksWaiting")}
      </p>
    );
  }
  const passed = checks.filter((c) => c.ok).length;
  const all = passed === checks.length;
  return (
    <div className="h-full overflow-auto selectable">
      <div className="eu-checks-summary">
        <span className={`text-small font-medium ${all ? "text-ok" : "text-ink"}`}>
          {all ? tr("python.allPassed") : trn("python.checksPassed", passed, { total: checks.length })}
        </span>
        <span className="eu-checks-meter" aria-hidden>
          <span style={{ width: `${(passed / checks.length) * 100}%` }} />
        </span>
      </div>
      <ul className="m-0 p-1.5 list-none">
        {checks.map((c, i) => (
          <li key={i} className="eu-check" data-ok={c.ok || undefined}>
            <span className="eu-check-mark">
              <Icon icon={c.ok ? Check : X} size={14} />
            </span>
            <span className="min-w-0">
              <span className="block font-mono text-small text-ink">{c.name}</span>
              {c.message && (
                <span className="block font-mono text-caption text-ink-muted whitespace-pre-wrap mt-0.5">
                  {c.message}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
