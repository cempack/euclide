import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";

/**
 * Appearance: theme (auto / light / dark), density and projection mode.
 *
 * Persistence is deliberately doubled:
 *   - SQLite via api.setSetting(...) is the source of truth (travels with the
 *     USB key, same mechanism as `max_tabs` / `open_tabs`);
 *   - localStorage is a mirror read by the inline script in index.html so the
 *     first paint is already in the right theme (no white flash).
 */

export type ThemePref = "auto" | "light" | "dark";
export type Density = "comfortable" | "compact";

const SETTING_THEME = "theme";
const SETTING_DENSITY = "density";
const LS_THEME = "eu:theme";
const LS_DENSITY = "eu:density";

type ThemeCtx = {
  /** What the user chose. */
  pref: ThemePref;
  /** What is actually displayed once "auto" is resolved. */
  resolved: "light" | "dark";
  setPref: (p: ThemePref) => void;
  density: Density;
  setDensity: (d: Density) => void;
  /** Classroom beamer mode: larger type, no sidebar, no tab strip. */
  projection: boolean;
  setProjection: (on: boolean) => void;
  toggleProjection: () => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

export const useAppearance = (): ThemeCtx => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAppearance: no provider");
  return c;
};

function isThemePref(v: unknown): v is ThemePref {
  return v === "auto" || v === "light" || v === "dark";
}
function isDensity(v: unknown): v is Density {
  return v === "comfortable" || v === "compact";
}

function readLocal<T>(key: string, guard: (v: unknown) => v is T, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return guard(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore (storage disabled)
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(() => readLocal(LS_THEME, isThemePref, "auto"));
  const [density, setDensityState] = useState<Density>(() =>
    readLocal(LS_DENSITY, isDensity, "comfortable")
  );
  const [projection, setProjectionState] = useState(false);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Hydrate from the database (authoritative), once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [t, d] = await Promise.all([
        api.getSetting(SETTING_THEME).catch(() => null),
        api.getSetting(SETTING_DENSITY).catch(() => null),
      ]);
      if (cancelled) return;
      if (isThemePref(t)) {
        setPrefState(t);
        writeLocal(LS_THEME, t);
      }
      if (isDensity(d)) {
        setDensityState(d);
        writeLocal(LS_DENSITY, d);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Follow the OS while the preference is "auto".
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved: "light" | "dark" = pref === "auto" ? (systemDark ? "dark" : "light") : pref;

  // Reflect on <html>: one attribute drives every token, including the native
  // form controls (color-scheme is set alongside the tokens in styles.css).
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved]);

  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
  }, [density]);

  useEffect(() => {
    if (projection) document.documentElement.setAttribute("data-projection", "on");
    else document.documentElement.removeAttribute("data-projection");
  }, [projection]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    writeLocal(LS_THEME, p);
    api.setSetting(SETTING_THEME, p).catch(() => {});
  }, []);

  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    writeLocal(LS_DENSITY, d);
    api.setSetting(SETTING_DENSITY, d).catch(() => {});
  }, []);

  const setProjection = useCallback((on: boolean) => setProjectionState(on), []);
  const toggleProjection = useCallback(() => setProjectionState((p) => !p), []);

  const value = useMemo<ThemeCtx>(
    () => ({
      pref,
      resolved,
      setPref,
      density,
      setDensity,
      projection,
      setProjection,
      toggleProjection,
    }),
    [pref, resolved, setPref, density, setDensity, projection, setProjection, toggleProjection]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
