import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Minus, Pause, Play, Plus, RotateCcw, Square, X } from "lucide-react";
import { q } from "../../api/queries";
import { isTauri, type ScheduleEntry } from "../../lib/api";
import { focusClass, humanMinutes, minutesRemaining, minutesUntil } from "../../lib/format";
import { tr } from "../../lib/i18n";
import { logged } from "../../lib/report";
import { formatTimer, timer, useTimerRunning, useTimerSec, useTimerTotal } from "../../stores/timer";
import { Icon } from "../../ui/Icon";

const PRESETS = [1, 2, 3, 5, 10, 15, 20, 30];
const NONE: ScheduleEntry[] = [];

async function fullscreen(on: boolean, el: HTMLElement) {
  if (isTauri()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setFullscreen(on);
  } else if (on) {
    await el.requestFullscreen?.();
  } else if (document.fullscreenElement) {
    await document.exitFullscreen();
  }
}

/** The countdown's ring: full when the timer starts, empty when it ends. */
function Ring({ fraction, done }: { fraction: number; done: boolean }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="eu-scene-ring" aria-hidden>
      <circle cx="50" cy="50" r={r} className="eu-scene-ring-track" />
      <circle
        cx="50"
        cy="50"
        r={r}
        className={`eu-scene-ring-bar ${done ? "eu-scene-ring-done" : ""}`}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, fraction)))}
        transform="rotate(-90 50 50)"
      />
    </svg>
  );
}

/**
 * The classroom screen, full screen for the projector: the time, the class
 * in progress, and the countdown on a ring. Keys: Espace pause/reprendre,
 * R recommencer, + / − une minute, 1…9 (0 = 10) minutes, Échap to leave.
 */
export default function ClassroomScene({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sec = useTimerSec();
  const total = useTimerTotal();
  const running = useTimerRunning();
  const classes = useQuery(q.todayClasses()).data ?? NONE;
  const [now, setNow] = useState(() => new Date());
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    // The keys are the scene's, not the first button's.
    dialog.focus();
    void fullscreen(true, dialog).catch(logged("scene.fullscreen"));
    const tick = window.setInterval(() => setNow(new Date()), 1000);
    return () => {
      window.clearInterval(tick);
      void fullscreen(false, dialog).catch(logged("scene.fullscreen"));
    };
  }, []);

  useEffect(() => {
    if (idle) return;
    const t = window.setTimeout(() => setIdle(true), 3000);
    return () => window.clearTimeout(t);
  }, [idle]);

  const focus = useMemo(() => focusClass(classes, now), [classes, now]);
  const clock = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const timing = sec != null;
  const done = sec === 0;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === " ") {
      if (timing) timer.toggle();
    } else if (k === "r" || k === "R") timer.restart();
    else if (k === "+" || k === "=") {
      if (timing) timer.add(1);
      else timer.start(1);
    } else if (k === "-" || k === "_") {
      if (timing) timer.add(-1);
    } else if (/^[0-9]$/.test(k)) timer.start(k === "0" ? 10 : Number(k));
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  let banner = "";
  if (focus?.state === "current") {
    const left = minutesRemaining(focus.entry, now);
    banner = `${focus.entry.subject}${focus.entry.room ? ` · ${focus.entry.room}` : ""}${
      left != null ? ` · ${tr("status.remaining", { time: humanMinutes(left) })}` : ""
    }`;
  } else if (focus?.state === "next") {
    const until = minutesUntil(focus.entry.start_time, now);
    banner = `${tr("scene.next")} : ${focus.entry.subject}${
      until != null ? ` · ${tr("status.inTime", { time: humanMinutes(until) })}` : ""
    }`;
  }

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      className={`eu-scene ${idle ? "cursor-none" : ""}`}
      aria-label={tr("scene.label")}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={onKeyDown}
      onMouseMove={() => setIdle(false)}
    >
      <div className="eu-scene-top">
        <span className="eu-scene-banner">{banner}</span>
        {timing && <span className="eu-scene-clock-small">{clock}</span>}
      </div>

      <div className="eu-scene-center">
        {timing ? (
          <div className={`eu-scene-timer ${done ? "eu-scene-timer-done" : ""}`}>
            <Ring fraction={total ? (sec ?? 0) / total : 0} done={done} />
            <span className="eu-scene-digits" role="timer" aria-live="off">
              {formatTimer(sec ?? 0)}
            </span>
            {!running && !done && <span className="eu-scene-paused">{tr("scene.paused")}</span>}
          </div>
        ) : (
          <span className="eu-scene-clock" role="timer">
            {clock}
          </span>
        )}
      </div>

      <div className={`eu-scene-controls ${idle ? "opacity-0" : ""}`}>
        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          {PRESETS.map((m) => (
            <button key={m} type="button" className="eu-scene-btn" onClick={() => timer.start(m)}>
              {tr("tools.timerMinutes", { count: m })}
            </button>
          ))}
        </div>
        {timing && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="eu-scene-btn"
              onClick={() => timer.add(-1)}
              aria-label={tr("scene.minus")}
            >
              <Icon icon={Minus} size={16} />
            </button>
            <button type="button" className="eu-scene-btn" onClick={() => timer.toggle()}>
              <Icon icon={running ? Pause : Play} size={16} />
              {running ? tr("timer.pause") : tr("timer.resume")}
            </button>
            <button
              type="button"
              className="eu-scene-btn"
              onClick={() => timer.add(1)}
              aria-label={tr("scene.plus")}
            >
              <Icon icon={Plus} size={16} />
            </button>
            <button type="button" className="eu-scene-btn" onClick={() => timer.restart()}>
              <Icon icon={RotateCcw} size={16} />
              {tr("scene.restart")}
            </button>
            <button type="button" className="eu-scene-btn" onClick={() => timer.stop()}>
              <Icon icon={Square} size={16} />
              {tr("timer.stop")}
            </button>
          </div>
        )}
        <p className="eu-scene-keys">{tr("scene.keys")}</p>
      </div>

      <button type="button" className="eu-scene-close" onClick={onClose} aria-label={tr("scene.close")}>
        <Icon icon={X} size={20} />
      </button>
    </dialog>
  );
}
