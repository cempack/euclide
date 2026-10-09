import { create } from "zustand";

/**
 * The class timer. It counts down to a deadline rather than one second per
 * tick: a hidden or minimised window gets its timers slowed down (to once a
 * minute after a while), and the old countdown fell behind the clock by as
 * much. Only the integer seconds are stored, so readers re-render once a
 * second at most; nothing else in the app does.
 */
type TimerState = {
  /** Seconds left; 0 once it ran out; null when no timer is set. */
  sec: number | null;
  /** The whole duration, for a progress ring; grows with « +1 min ». */
  total: number | null;
  running: boolean;
};

const useTimerStore = create<TimerState>()(() => ({ sec: null, total: null, running: false }));
const state = useTimerStore.getState;
const setState = useTimerStore.setState;

let deadline = 0;
let ticker = 0;
const doneListeners = new Set<() => void>();

function tick() {
  const sec = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  if (sec !== state().sec) setState({ sec });
  if (sec > 0) return;
  halt();
  setState({ running: false });
  for (const listener of doneListeners) listener();
}

function halt() {
  window.clearInterval(ticker);
  ticker = 0;
}

function run(sec: number) {
  deadline = Date.now() + sec * 1000;
  setState({ sec, running: true });
  halt();
  // A quarter second keeps the display on the second; a tick that changes
  // nothing costs one comparison.
  ticker = window.setInterval(tick, 250);
}

// Back from a hidden window: show the right time at once.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (ticker) tick();
  });
}

export const timer = {
  start(minutes: number) {
    const sec = Math.max(1, Math.round(minutes * 60));
    setState({ total: sec });
    run(sec);
  },

  /** The same duration again, from the start. */
  restart() {
    const total = state().total;
    if (total) run(total);
  },

  /** Pause or resume; once it has run out, put it away. */
  toggle() {
    const { sec, running } = state();
    if (sec == null) return;
    if (sec <= 0) return timer.stop();
    if (!running) return run(sec);
    halt();
    setState({ running: false, sec: Math.max(1, Math.ceil((deadline - Date.now()) / 1000)) });
  },

  add(minutes: number) {
    const { sec, running } = state();
    if (sec == null) return;
    const left = running ? Math.max(0, (deadline - Date.now()) / 1000) : Math.max(0, sec);
    const next = Math.max(1, Math.round(left + minutes * 60));
    setState({ total: Math.max(next, (state().total ?? 0) + minutes * 60) });
    run(next);
  },

  stop() {
    halt();
    setState({ sec: null, total: null, running: false });
  },
};

/** Called when a countdown reaches zero; returns the unsubscribe. */
export function onTimerDone(listener: () => void): () => void {
  doneListeners.add(listener);
  return () => doneListeners.delete(listener);
}

export const useTimerSec = () => useTimerStore((s) => s.sec);
export const useTimerRunning = () => useTimerStore((s) => s.running);
export const useTimerTotal = () => useTimerStore((s) => s.total);

export function formatTimer(sec: number) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * The stopwatch: counts up from when it started, by the clock (as the
 * timer counts down to a deadline), with laps. It runs beside the timer.
 */
type StopwatchState = {
  /** Whole seconds counted; null when no stopwatch is set. */
  elapsed: number | null;
  running: boolean;
  /** The seconds at each « Tour », first first. */
  laps: number[];
};

const useStopwatchStore = create<StopwatchState>()(() => ({ elapsed: null, running: false, laps: [] }));
const watch = useStopwatchStore.getState;
const setWatch = useStopwatchStore.setState;

/** When the count started, less the time it was paused. */
let origin = 0;
/** Milliseconds counted when paused. */
let pausedMs = 0;
let watchTicker = 0;

const countedMs = () => (watch().running ? Date.now() - origin : pausedMs);

function watchTick() {
  const elapsed = Math.floor(countedMs() / 1000);
  if (elapsed !== watch().elapsed) setWatch({ elapsed });
}

function watchRun(fromMs: number) {
  origin = Date.now() - fromMs;
  window.clearInterval(watchTicker);
  watchTicker = window.setInterval(watchTick, 250);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (watchTicker) watchTick();
  });
}

export const stopwatch = {
  /** From zero. */
  start() {
    pausedMs = 0;
    setWatch({ elapsed: 0, running: true, laps: [] });
    watchRun(0);
  },

  /** Pause or resume; with none set, start one. */
  toggle() {
    const { elapsed, running } = watch();
    if (elapsed == null) return stopwatch.start();
    if (running) {
      pausedMs = Date.now() - origin;
      window.clearInterval(watchTicker);
      watchTicker = 0;
      setWatch({ running: false, elapsed: Math.floor(pausedMs / 1000) });
    } else {
      setWatch({ running: true });
      watchRun(pausedMs);
    }
  },

  /** Note the time, the stopwatch going on. */
  lap() {
    if (watch().elapsed == null) return;
    setWatch({ laps: [...watch().laps, Math.floor(countedMs() / 1000)] });
  },

  stop() {
    window.clearInterval(watchTicker);
    watchTicker = 0;
    pausedMs = 0;
    setWatch({ elapsed: null, running: false, laps: [] });
  },
};

export const useStopwatchElapsed = () => useStopwatchStore((s) => s.elapsed);
export const useStopwatchRunning = () => useStopwatchStore((s) => s.running);
export const useStopwatchLaps = () => useStopwatchStore((s) => s.laps);
