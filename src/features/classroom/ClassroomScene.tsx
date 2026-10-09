import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dices,
  Flag,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Shuffle,
  Square,
  Timer as TimerIcon,
  Users,
  X,
} from "lucide-react";
import { q } from "../../api/queries";
import type { Course, CourseClass, ScheduleEntry, StudentList } from "../../lib/api";
import { fullscreen } from "../../lib/fullscreen";
import { focusClass, humanMinutes, minutesRemaining, minutesUntil } from "../../lib/format";
import { tr } from "../../lib/i18n";
import { logged } from "../../lib/report";
import { picker, useDrawn, useGroups, useGroupsBy } from "../../stores/picker";
import { scene, useSceneClass, useSceneMode, useSceneQrText, type SceneMode } from "../../stores/scene";
import {
  formatTimer,
  stopwatch,
  timer,
  useStopwatchElapsed,
  useStopwatchLaps,
  useStopwatchRunning,
  useTimerRunning,
  useTimerSec,
  useTimerTotal,
} from "../../stores/timer";
import { Icon } from "../../ui/Icon";
import { QrCode } from "../../ui/QrCode";
import { groupOf, placeEntry } from "./lesson";
import { coin, randomInt, rollDie, type GroupsBy } from "./picker";

const PRESETS = [1, 2, 3, 5, 10, 15, 20, 30];
const FACES = [4, 6, 8, 10, 12, 20];
const NONE: ScheduleEntry[] = [];
const NO_COURSES: Course[] = [];
const NO_CLASSES: CourseClass[] = [];
const NO_LISTS: StudentList[] = [];
const NO_NAMES: string[] = [];

const MODES: {
  mode: SceneMode;
  label: "scene.modeClock" | "scene.modeDraw" | "scene.modeGroups" | "scene.modeChance" | "scene.modeQr";
}[] = [
  { mode: "clock", label: "scene.modeClock" },
  { mode: "draw", label: "scene.modeDraw" },
  { mode: "groups", label: "scene.modeGroups" },
  { mode: "chance", label: "scene.modeChance" },
  { mode: "qr", label: "scene.modeQr" },
];

type Chance = {
  kind: "die" | "number" | "coin";
  faces: number;
  min: number;
  max: number;
  result: string | null;
};

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
 * The classroom screen, full screen for the projector. Horloge: the time, the
 * class in progress and the countdown on a ring. Tirage: a student's name,
 * nobody twice until « Recommencer ». Groupes: the class at random, by size
 * or by number of groups. Hasard: a die, a number, heads or tails. Each mode
 * has its keys (shown at the bottom); Échap leaves.
 */
export default function ClassroomScene({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sec = useTimerSec();
  const total = useTimerTotal();
  const running = useTimerRunning();
  const elapsed = useStopwatchElapsed();
  const watching = useStopwatchRunning();
  const laps = useStopwatchLaps();
  const mode = useSceneMode();
  const qrText = useSceneQrText();
  const classes = useQuery(q.todayClasses()).data ?? NONE;
  const courses = useQuery(q.courses()).data ?? NO_COURSES;
  const courseClasses = useQuery(q.allCourseClasses()).data ?? NO_CLASSES;
  const lists = useQuery(q.studentLists()).data ?? NO_LISTS;
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
  // The class drawn from: the one chosen, else the one in progress (or next).
  const chosen = useSceneClass();
  const inProgress = focus
    ? (placeEntry(focus.entry, courses, courseClasses)?.courseClass?.class_name ??
      groupOf(focus.entry.subject))
    : null;
  const className = chosen ?? inProgress ?? lists[0]?.class_name ?? null;
  const names =
    useQuery({ ...q.students(className ?? ""), enabled: !!className && mode !== "clock" }).data ?? NO_NAMES;
  const classChoices = useMemo(
    () =>
      [
        ...new Set(
          [className, ...lists.map((l) => l.class_name), ...courseClasses.map((c) => c.class_name)].filter(
            (c): c is string => !!c,
          ),
        ),
      ].sort((a, b) => a.localeCompare(b, "fr")),
    [className, lists, courseClasses],
  );

  const clock = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const timing = sec != null;
  const done = sec === 0;

  const drawn = useDrawn(className ?? "");
  const [rolling, setRolling] = useState<string | null>(null);
  const drawNext = () => {
    if (!className || !names.length || rolling) return;
    const name = picker.draw(className, names);
    if (!name || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // A short shuffle before the name settles: the class watches it.
    let n = 0;
    const roll = window.setInterval(() => {
      n += 1;
      if (n >= 9) {
        window.clearInterval(roll);
        setRolling(null);
      } else setRolling(names[(n * 7 + names.length) % names.length]);
    }, 70);
  };

  const groups = useGroups(className ?? "");
  const by = useGroupsBy();
  const makeGroups = (next: GroupsBy = by) => {
    if (className && names.length) picker.group(className, names, next);
  };
  const groupNumber = "size" in by ? by.size : by.count;
  const regroup = (step: number) => {
    const n = Math.max(2, Math.min(12, groupNumber + step));
    makeGroups("size" in by ? { size: n } : { count: n });
  };

  const [chance, setChance] = useState<Chance>({ kind: "die", faces: 6, min: 1, max: 100, result: null });
  const throwChance = (next: Chance = chance) => {
    const result =
      next.kind === "die"
        ? String(rollDie(next.faces))
        : next.kind === "number"
          ? String(randomInt(next.min, next.max))
          : tr(coin() === "pile" ? "scene.pile" : "scene.face");
    setChance({ ...next, result });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Typing in a field of the screen (a number, the class) is typing.
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const k = e.key;
    const go = k === " " || k === "Enter" || k === "ArrowRight" || k === "PageDown";
    if (mode === "clock") {
      if (k === " ") {
        if (timing) timer.toggle();
        else if (elapsed != null) stopwatch.toggle();
      } else if (k === "c" || k === "C") stopwatch.toggle();
      else if (k === "t" || k === "T") stopwatch.lap();
      else if (k === "r" || k === "R") timer.restart();
      else if (k === "+" || k === "=") {
        if (timing) timer.add(1);
        else timer.start(1);
      } else if (k === "-" || k === "_") {
        if (timing) timer.add(-1);
      } else if (/^[0-9]$/.test(k)) timer.start(k === "0" ? 10 : Number(k));
      else return;
    } else if (mode === "draw") {
      if (go) drawNext();
      else if ((k === "r" || k === "R") && className) picker.reset(className);
      else return;
    } else if (mode === "groups") {
      if (go) makeGroups();
      else if (k === "+" || k === "=") regroup(1);
      else if (k === "-" || k === "_") regroup(-1);
      else return;
    } else if (mode === "chance" && go) throwChance();
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

  const current = drawn[drawn.length - 1] ?? null;
  const allDrawn = names.length > 0 && drawn.filter((n) => names.includes(n)).length >= names.length;
  const noList = !className ? (
    <div className="eu-scene-note">
      <p>{tr("scene.noClass")}</p>
      <p className="eu-scene-hint">{tr("scene.noClassHint")}</p>
    </div>
  ) : (
    <div className="eu-scene-note">
      <p>{tr("scene.noList", { class: className })}</p>
      <p className="eu-scene-hint">{tr("scene.noListHint")}</p>
    </div>
  );

  const classSelect = (
    <select
      className="eu-scene-select"
      value={className ?? ""}
      onChange={(e) => scene.setClass(e.target.value || null)}
      aria-label={tr("scene.classLabel")}
    >
      {!className && <option value="">{tr("scene.classLabel")}</option>}
      {classChoices.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );

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
        {(timing || elapsed != null || mode !== "clock") && (
          <span className="eu-scene-clock-small">{clock}</span>
        )}
      </div>

      <div className="eu-scene-center">
        {mode === "clock" &&
          (timing ? (
            <div className="eu-scene-pick">
              <div className={`eu-scene-timer ${done ? "eu-scene-timer-done" : ""}`}>
                <Ring fraction={total ? (sec ?? 0) / total : 0} done={done} />
                <span className="eu-scene-digits" role="timer" aria-live="off">
                  {formatTimer(sec ?? 0)}
                </span>
                {!running && !done && <span className="eu-scene-paused">{tr("scene.paused")}</span>}
              </div>
              {elapsed != null && (
                <span className="eu-scene-count">
                  {tr("scene.stopwatch")} · {formatTimer(elapsed)}
                </span>
              )}
            </div>
          ) : elapsed != null ? (
            <div className="eu-scene-pick">
              <span className="eu-scene-clock" role="timer" aria-live="off">
                {formatTimer(elapsed)}
              </span>
              <span className="eu-scene-count">
                {watching ? tr("scene.stopwatch") : `${tr("scene.stopwatch")} · ${tr("scene.paused")}`}
              </span>
              {laps.length > 0 && (
                <ol className="eu-scene-laps">
                  {laps.slice(-6).map((lap, i, shown) => (
                    <li key={laps.length - shown.length + i}>
                      {tr("timer.lapN", { n: laps.length - shown.length + i + 1 })} · {formatTimer(lap)}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : (
            <span className="eu-scene-clock" role="timer">
              {clock}
            </span>
          ))}

        {mode === "draw" &&
          (!names.length ? (
            noList
          ) : (
            <div className="eu-scene-pick">
              <span
                className={`eu-scene-name ${!current && !rolling ? "eu-scene-name-wait" : ""} ${rolling ? "eu-scene-name-rolling" : ""}`}
                aria-live="polite"
              >
                {rolling ?? current ?? tr("scene.drawPrompt")}
              </span>
              <span className="eu-scene-count">
                {allDrawn && !rolling
                  ? tr("scene.drawAllDone")
                  : tr("scene.drawCount", {
                      done: drawn.filter((n) => names.includes(n)).length,
                      total: names.length,
                    })}
              </span>
            </div>
          ))}

        {mode === "groups" &&
          (!names.length ? (
            noList
          ) : groups ? (
            <div className="eu-scene-groups" style={groupsLayout(groups)}>
              {groups.map((g, i) => (
                <section key={i} className="eu-scene-group" aria-label={tr("scene.groupN", { n: i + 1 })}>
                  <h3>{tr("scene.groupN", { n: i + 1 })}</h3>
                  <ul>
                    {g.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <span className="eu-scene-name eu-scene-name-wait">{tr("scene.groupsMake")}</span>
          ))}

        {mode === "qr" &&
          (qrText.trim() ? (
            <div className="eu-scene-pick">
              <QrCode text={qrText.trim()} className="eu-scene-qr" />
              <span className="eu-scene-count eu-scene-qr-text">{qrText.trim()}</span>
            </div>
          ) : (
            <span className="eu-scene-name eu-scene-name-wait">{tr("scene.qrEmpty")}</span>
          ))}

        {mode === "chance" && (
          <div className="eu-scene-pick">
            <span
              className={`eu-scene-result ${chance.result ? "" : "eu-scene-name-wait"}`}
              aria-live="polite"
            >
              {chance.result ?? "?"}
            </span>
            <span className="eu-scene-count">
              {chance.kind === "die"
                ? tr("scene.dieOf", { faces: chance.faces })
                : chance.kind === "number"
                  ? tr("scene.numberBetween", {
                      min: Math.min(chance.min, chance.max),
                      max: Math.max(chance.min, chance.max),
                    })
                  : tr("scene.chanceCoin")}
            </span>
          </div>
        )}
      </div>

      <div className={`eu-scene-controls ${idle ? "opacity-0" : ""}`}>
        <div className="eu-scene-modes" role="group" aria-label={tr("scene.modes")}>
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              className="eu-scene-btn eu-scene-tab"
              aria-pressed={mode === m.mode}
              onClick={() => scene.setMode(m.mode)}
            >
              {tr(m.label)}
            </button>
          ))}
        </div>

        {mode === "clock" && (
          <>
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              {PRESETS.map((m) => (
                <button key={m} type="button" className="eu-scene-btn" onClick={() => timer.start(m)}>
                  {tr("tools.timerMinutes", { count: m })}
                </button>
              ))}
              <button
                type="button"
                className="eu-scene-btn eu-scene-tab"
                aria-pressed={watching}
                onClick={() => stopwatch.toggle()}
              >
                <Icon icon={elapsed != null && watching ? Pause : TimerIcon} size={16} />
                {tr("scene.stopwatch")}
              </button>
              {elapsed != null && (
                <>
                  <button type="button" className="eu-scene-btn" onClick={() => stopwatch.lap()}>
                    <Icon icon={Flag} size={16} />
                    {tr("timer.lap")}
                  </button>
                  <button
                    type="button"
                    className="eu-scene-btn"
                    onClick={() => stopwatch.stop()}
                    aria-label={`${tr("scene.stopwatch")} — ${tr("timer.stop")}`}
                  >
                    <Icon icon={Square} size={16} />
                  </button>
                </>
              )}
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
          </>
        )}

        {mode === "draw" && (
          <>
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              {classSelect}
              <button
                type="button"
                className="eu-scene-btn"
                onClick={drawNext}
                disabled={!names.length || allDrawn}
              >
                <Icon icon={Shuffle} size={16} />
                {tr("scene.draw")}
              </button>
              <button
                type="button"
                className="eu-scene-btn"
                onClick={() => className && picker.reset(className)}
                disabled={!drawn.length}
              >
                <Icon icon={RotateCcw} size={16} />
                {tr("scene.drawReset")}
              </button>
            </div>
            <p className="eu-scene-keys">{tr("scene.keysDraw")}</p>
          </>
        )}

        {mode === "groups" && (
          <>
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              {classSelect}
              <div className="flex items-center gap-1.5" role="group" aria-label={tr("scene.groupsHow")}>
                <button
                  type="button"
                  className="eu-scene-btn eu-scene-tab"
                  aria-pressed={"size" in by}
                  onClick={() => makeGroups({ size: groupNumber })}
                >
                  {tr("scene.groupsBySize")}
                </button>
                <button
                  type="button"
                  className="eu-scene-btn eu-scene-tab"
                  aria-pressed={"count" in by}
                  onClick={() => makeGroups({ count: groupNumber })}
                >
                  {tr("scene.groupsByCount")}
                </button>
              </div>
              <button
                type="button"
                className="eu-scene-btn"
                onClick={() => regroup(-1)}
                aria-label={tr("scene.groupsLess")}
              >
                <Icon icon={Minus} size={16} />
              </button>
              <span className="eu-scene-number" aria-live="polite">
                {groupNumber}
              </span>
              <button
                type="button"
                className="eu-scene-btn"
                onClick={() => regroup(1)}
                aria-label={tr("scene.groupsMore")}
              >
                <Icon icon={Plus} size={16} />
              </button>
              <button
                type="button"
                className="eu-scene-btn"
                onClick={() => makeGroups()}
                disabled={!names.length}
              >
                <Icon icon={Users} size={16} />
                {groups ? tr("scene.groupsRedo") : tr("scene.groupsMake")}
              </button>
            </div>
            <p className="eu-scene-keys">{tr("scene.keysGroups")}</p>
          </>
        )}

        {mode === "chance" && (
          <>
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
              <div className="flex items-center gap-1.5" role="group" aria-label={tr("scene.chanceKind")}>
                {(["die", "number", "coin"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className="eu-scene-btn eu-scene-tab"
                    aria-pressed={chance.kind === kind}
                    onClick={() => setChance({ ...chance, kind, result: null })}
                  >
                    {tr(
                      kind === "die"
                        ? "scene.chanceDie"
                        : kind === "number"
                          ? "scene.chanceNumber"
                          : "scene.chanceCoin",
                    )}
                  </button>
                ))}
              </div>
              {chance.kind === "die" && (
                <select
                  className="eu-scene-select"
                  value={chance.faces}
                  onChange={(e) => setChance({ ...chance, faces: Number(e.target.value), result: null })}
                  aria-label={tr("scene.faces")}
                >
                  {FACES.map((f) => (
                    <option key={f} value={f}>
                      {tr("scene.dieOf", { faces: f })}
                    </option>
                  ))}
                </select>
              )}
              {chance.kind === "number" && (
                <span className="flex items-center gap-1.5">
                  <label className="eu-scene-keys" htmlFor="eu-chance-min">
                    {tr("scene.from")}
                  </label>
                  <input
                    id="eu-chance-min"
                    type="number"
                    className="eu-scene-select w-24 text-center"
                    value={chance.min}
                    onChange={(e) => setChance({ ...chance, min: Number(e.target.value) || 0, result: null })}
                  />
                  <label className="eu-scene-keys" htmlFor="eu-chance-max">
                    {tr("scene.to")}
                  </label>
                  <input
                    id="eu-chance-max"
                    type="number"
                    className="eu-scene-select w-24 text-center"
                    value={chance.max}
                    onChange={(e) => setChance({ ...chance, max: Number(e.target.value) || 0, result: null })}
                  />
                </span>
              )}
              <button type="button" className="eu-scene-btn" onClick={() => throwChance()}>
                <Icon icon={Dices} size={16} />
                {tr("scene.roll")}
              </button>
            </div>
            <p className="eu-scene-keys">{tr("scene.keysChance")}</p>
          </>
        )}

        {mode === "qr" && (
          <>
            <input
              className="eu-scene-select w-[min(40rem,90vw)]"
              value={qrText}
              onChange={(e) => scene.setQrText(e.target.value)}
              placeholder={tr("scene.qrPlaceholder")}
              aria-label={tr("scene.qrPlaceholder")}
            />
            <p className="eu-scene-keys">{tr("scene.keysQr")}</p>
          </>
        )}
      </div>

      <button type="button" className="eu-scene-close" onClick={onClose} aria-label={tr("scene.close")}>
        <Icon icon={X} size={20} />
      </button>
    </dialog>
  );
}

/**
 * Every group in sight on a projector, without scrolling: columns by the
 * number of groups, then the text as large as the tallest row of groups
 * (in height) and the longest name (in width) allow.
 */
function groupsLayout(groups: string[][]): React.CSSProperties {
  const count = groups.length;
  const cols = count <= 4 ? count : count <= 8 ? 4 : count <= 15 ? 5 : 6;
  const rows = Math.ceil(count / cols);
  const tallest = Math.max(...groups.map((g) => g.length));
  const longest = Math.max(...groups.flat().map((name) => name.length));
  // Names, the group's title and its padding, in lines of 1.3.
  const byHeight = Math.min(3.8, 60 / (rows * (tallest + 2.2) * 1.3));
  // A column is 90vw shared out, less its card's padding; a letter is about
  // 0.6 of the size.
  const byWidth = ((90 - (cols - 1) * 2) / cols - 2.6) / (Math.max(10, longest) * 0.6);
  return {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
    fontSize: `max(0.8rem, min(${byHeight.toFixed(2)}vh, ${byWidth.toFixed(2)}vw))`,
  };
}
