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
