import { Clock, Pause, Play, X } from "lucide-react";
import { get } from "../lib/i18n";
import { formatTimer, useTimerControls, useTimerSec } from "../lib/timer";
import { Icon } from "../ui/Icon";
import { tip } from "../ui/Tooltip";

/** The class timer in the tab strip, while one runs. */
export function TimerSlot() {
  const sec = useTimerSec();
  if (sec == null) return null;
  return <TimerControl sec={sec} />;
}

function TimerControl({ sec }: { sec: number }) {
  const timer = useTimerControls();
  const done = sec <= 0;
  const toggleLabel = timer.running ? get("timer.pause", "Pause") : get("timer.resume", "Reprendre");
  const addLabel = get("timer.addMinute", "+1 minute");
  const stopLabel = get("timer.stop", "Arrêter le minuteur");
  return (
    <div className={`eu-timer ${done ? "eu-timer-done" : ""}`}>
      <button type="button" onClick={timer.toggle} aria-label={toggleLabel} {...tip(toggleLabel)}>
        <Icon icon={timer.running ? Pause : Play} size={14} />
        <span className="eu-t-num">{formatTimer(sec)}</span>
      </button>
      <button type="button" onClick={() => timer.add(1)} aria-label={addLabel} {...tip(addLabel)}>
        +1
      </button>
      <button type="button" onClick={timer.stop} aria-label={stopLabel} {...tip(stopLabel)}>
        <Icon icon={X} size={14} />
      </button>
    </div>
  );
}

/** The timer's remaining time, in the status bar. */
export function StatusTimerChip() {
  const sec = useTimerSec();
  if (sec == null) return null;
  return (
    <span className="eu-status-item">
      <Icon icon={Clock} size={14} />
      {formatTimer(sec)}
    </span>
  );
}

/** Big countdown for the classroom, shown while projection mode is on. */
export function TimerStage() {
  const timer = useTimerControls();
  const sec = useTimerSec();
  if (sec == null) return null;
  const done = sec <= 0;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-overlay">
      <div className={`eu-panel shadow-pop px-7 py-4 flex items-center gap-5 ${done ? "border-danger" : ""}`}>
        <span
          className={`font-mono text-[4rem] leading-none font-semibold tabular-nums tracking-[-0.03em] ${
            done ? "text-danger" : "text-ink"
          }`}
        >
          {formatTimer(sec)}
        </span>
        <div className="flex flex-col gap-1.5">
          <button type="button" onClick={timer.toggle} className="eu-btn-ghost eu-btn-sm">
            <Icon icon={timer.running ? Pause : Play} size={14} />
            {timer.running ? get("timer.pause", "Pause") : get("timer.resume", "Reprendre")}
          </button>
          <button type="button" onClick={() => timer.add(1)} className="eu-btn-ghost eu-btn-sm">
            +1 min
          </button>
          <button type="button" onClick={timer.stop} className="eu-btn-quiet eu-btn-sm">
            {get("timer.stop", "Arrêter")}
          </button>
        </div>
      </div>
    </div>
  );
}
