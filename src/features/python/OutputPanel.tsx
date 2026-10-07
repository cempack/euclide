import { useEffect, useRef, useState } from "react";
import { Check, CornerDownLeft, Download, X } from "lucide-react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { tr } from "../../lib/i18n";
import { keysOf } from "../../lib/keymap";
import { shortcutText } from "../../lib/shortcuts";
import { reportError } from "../../lib/report";
import { useToast } from "../../components/ui";
import { Icon } from "../../ui/Icon";
import { canvasPng, TurtleCanvas } from "./TurtleCanvas";
import type { ConsoleLine, CheckResult, RunStatus } from "./useRun";
import type { TurtleOp } from "../../lib/api";

export type OutputTab = "console" | "drawing" | "checks";

/** The script's output, under the editor: console, drawing, checks. */
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
}) {
  const hasDrawing = turtle.length > 0 || plots.length > 0;
  const passed = checks?.filter((c) => c.ok).length ?? 0;
  const tabs: { id: OutputTab; label: string; badge?: string }[] = [
    { id: "console", label: tr("python.console") },
    ...(hasDrawing ? [{ id: "drawing" as const, label: tr("python.drawing") }] : []),
    ...(checks
      ? [
          {
            id: "checks" as const,
            label: tr("python.checks"),
            badge: checks.length ? `${passed}/${checks.length}` : undefined,
          },
        ]
      : []),
  ];
  const shown = tabs.some((t) => t.id === tab) ? tab : "console";

  return (
    <div className="h-full min-h-0 flex flex-col bg-stage text-stage-ink">
      <div
        className="shrink-0 flex items-stretch gap-0.5 px-1.5 h-8 border-b border-stage-line"
        role="tablist"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={shown === t.id}
            onClick={() => onTab(t.id)}
            className={`px-2.5 text-small border-b-2 transition-colors duration-fast ${
              shown === t.id
                ? "border-stage-accent text-stage-ink font-medium"
                : "border-transparent text-stage-muted hover:text-stage-ink"
            }`}
          >
            {t.label}
            {t.badge && (
              <span
                className={`ml-1.5 font-mono text-caption ${passed === checks?.length ? "text-ok-solid" : "text-stage-danger"}`}
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
        <span className="flex-1" />
        <StatusText status={status} />
      </div>
      <div className="flex-1 min-h-0">
        {shown === "console" && <Console lines={lines} status={status} onAnswer={onAnswer} />}
        {shown === "drawing" && <Drawing turtle={turtle} plots={plots} scriptName={scriptName} />}
        {shown === "checks" && checks && <Checks checks={checks} status={status} />}
      </div>
    </div>
  );
}

function StatusText({ status }: { status: RunStatus }) {
  const [now, setNow] = useState(() => performance.now());
  const live = status.state === "running";
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(performance.now()), 500);
    return () => window.clearInterval(id);
  }, [live]);
  let text = "";
  let tone = "text-stage-muted";
  if (status.state === "running")
    text = tr("python.running", { s: seconds((now - status.startedAt) / 1000) });
  else if (status.state === "input") text = tr("python.waitingInput");
  else if (status.state === "done") {
    const s = seconds(status.seconds);
    if (status.reason === "stopped") text = tr("python.stopped");
    else if (status.reason === "timeout") {
      text = tr("python.timedOut");
      tone = "text-stage-danger";
    } else if (status.reason === "output") {
      text = tr("python.tooMuchOutput");
      tone = "text-stage-danger";
    } else if (status.ok) {
      text = tr("python.finished", { s });
      tone = "text-ok-solid";
    } else {
      text = tr("python.failedIn", { s });
      tone = "text-stage-danger";
    }
  }
  return <span className={`self-center pr-1.5 font-mono text-caption ${tone}`}>{text}</span>;
}

const seconds = (s: number) => (s < 10 ? s.toFixed(1) : Math.round(s).toString()).replace(".", ",");

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
    <div ref={scrollRef} className="h-full overflow-auto px-3 py-2 font-mono text-code selectable">
      {empty && (
        <p className="text-stage-muted">{tr("tools.runHint", { keys: shortcutText(keysOf("runPython")) })}</p>
      )}
      <pre className="whitespace-pre-wrap break-words m-0">
        {lines.map((line, i) => (
          <span
            key={i}
            className={
              line.kind === "err"
                ? "text-stage-danger"
                : line.kind === "echo"
                  ? "text-stage-accent"
                  : undefined
            }
          >
            {line.text}
          </span>
        ))}
        {status.state === "done" && lines.length === 0 && (
          <span className="text-stage-muted">{tr("tools.noOutput")}</span>
        )}
      </pre>
      {asking && (
        <form
          className="flex items-center gap-2 mt-0.5"
          onSubmit={(e) => {
            e.preventDefault();
            onAnswer(value);
            setValue("");
          }}
        >
          <span className="text-stage-accent whitespace-pre">{status.prompt}</span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label={status.prompt || tr("python.inputLabel")}
            className="flex-1 min-w-0 bg-stage-alt border border-stage-line rounded px-2 py-0.5 outline-hidden focus:border-stage-accent text-stage-ink"
          />
          <button
            type="submit"
            className="flex items-center gap-1 text-caption text-stage-muted hover:text-stage-ink"
          >
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
      window.dispatchEvent(new CustomEvent("eu:library-changed"));
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
    // Each drawing takes the pane's height; several scroll sideways.
    <div className="h-full overflow-x-auto overflow-y-hidden p-3 flex gap-3 bg-stage-alt">
      {turtle.length > 0 && (
        <figure className="m-0 h-full shrink-0 flex flex-col gap-1.5">
          <div
            ref={turtleBox}
            className="flex-1 min-h-0 aspect-[4/3] rounded border border-stage-line overflow-hidden"
          >
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
            className="flex-1 min-h-0 w-auto object-contain rounded border border-stage-line bg-paper"
          />
          <SaveButton onClick={() => void savePlot(svg, i)} />
        </figure>
      ))}
    </div>
  );
}

function SaveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start flex items-center gap-1.5 text-caption text-stage-muted hover:text-stage-ink"
    >
      <Icon icon={Download} size={14} />
      {tr("python.saveImage")}
    </button>
  );
}

function Checks({ checks, status }: { checks: CheckResult[]; status: RunStatus }) {
  if (!checks.length) {
    return (
      <p className="p-3 text-small text-stage-muted">
        {status.state === "done" ? tr("python.checksNotRun") : tr("python.checksWaiting")}
      </p>
    );
  }
  return (
    <ul className="h-full overflow-auto m-0 p-1.5 list-none selectable">
      {checks.map((c, i) => (
        <li key={i} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-stage-hover">
          <span className={`mt-0.5 shrink-0 ${c.ok ? "text-ok-solid" : "text-stage-danger"}`}>
            <Icon icon={c.ok ? Check : X} size={16} />
          </span>
          <span className="min-w-0">
            <span className="block text-body">{c.name}</span>
            {c.message && (
              <span className="block font-mono text-caption text-stage-muted whitespace-pre-wrap">
                {c.message}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
