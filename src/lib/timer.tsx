import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useToast } from "../components/ui";
import { get } from "./i18n";

export type TimerControls = {
  running: boolean;
  start: (minutes: number) => void;
  toggle: () => void;
  add: (minutes: number) => void;
  stop: () => void;
};

const ControlsCtx = createContext<TimerControls | null>(null);
const SecCtx = createContext<number | null>(null);

export function useTimerControls(): TimerControls {
  const c = useContext(ControlsCtx);
  if (!c) throw new Error("useTimerControls: no provider");
  return c;
}

export function useTimerSec(): number | null {
  return useContext(SecCtx);
}

export function formatTimer(sec: number) {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Two-note chime with a soft attack and release.
 * The previous version was a bare 880 Hz square burst — startling in a quiet
 * classroom. This is deliberately gentle: a fifth, fading out.
 */
export function chime(volume = 0.07) {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes: Array<[number, number]> = [
      [660, 0],
      [990, 0.16],
    ];
    for (const [freq, delay] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = now + delay;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      osc.start(t);
      osc.stop(t + 0.8);
    }
    window.setTimeout(() => ctx.close().catch(() => {}), 1400);
  } catch {
    // no audio device / autoplay blocked: silence is an acceptable outcome
  }
}

/**
 * Class timer lives in its own provider so a 1 Hz tick does not re-render the
 * shell, the sidebar, or every open tab. Seconds and controls are split: only
 * widgets that display the countdown subscribe to the tick.
 */
export function TimerProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [sec, setSec] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  const start = useCallback((minutes: number) => {
    setSec(Math.max(1, Math.round(minutes * 60)));
    setRunning(true);
  }, []);

  const toggle = useCallback(() => {
    setSec((s) => {
      if (s == null) return s;
      if (s <= 0) {
        setRunning(false);
        return null;
      }
      setRunning((r) => !r);
      return s;
    });
  }, []);

  const add = useCallback((minutes: number) => {
    setSec((s) => (s == null ? s : Math.max(0, s) + minutes * 60));
    setRunning(true);
  }, []);

  const stop = useCallback(() => {
    setSec(null);
    setRunning(false);
  }, []);

  const controls = useMemo<TimerControls>(
    () => ({ running, start, toggle, add, stop }),
    [running, start, toggle, add, stop]
  );

  useEffect(() => {
    const onStart = (e: Event) => {
      const minutes = Number((e as CustomEvent).detail?.minutes) || 5;
      setSec(Math.max(1, Math.round(minutes * 60)));
      setRunning(true);
    };
    window.addEventListener("eu:timer-start", onStart as EventListener);
    return () => window.removeEventListener("eu:timer-start", onStart as EventListener);
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setSec((s) => (s == null || s <= 0 ? s : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (sec !== 0 || !running) return;
    setRunning(false);
    chime();
    toast(get("timer.done", "Minuteur terminé"), "success");
  }, [sec, running, toast]);

  return (
    <ControlsCtx.Provider value={controls}>
      <SecCtx.Provider value={sec}>{children}</SecCtx.Provider>
    </ControlsCtx.Provider>
  );
}
