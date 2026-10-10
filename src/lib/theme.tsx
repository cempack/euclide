import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, isTauri } from "./api";
import { bootSetting, canCrossFade } from "./boot";
import { logged } from "./report";

/**
 * Appearance: theme (auto / light / dark), density and projection mode.
 *
 * Persistence is deliberately doubled:
 *   - SQLite via api.setSetting(...) is the source of truth (travels with the
 *     USB key, same mechanism as `max_tabs` / `open_tabs`), and arrives with
 *     the page at launch (lib/boot.ts), so the first paint is right;
 *   - localStorage is a mirror for reloads of the page and browser mode, read
 *     by the inline script in index.html too.
 */

/**
 * Sets an appearance attribute on <html>. A change while the app is shown
 * cross-fades (a view transition, 240 ms in styles.css) instead of flipping
 * the whole window from light to dark in one frame; the first paint, a
 * system asking for less motion and an engine without view transitions get
 * the plain change. So does WebKitGTK without its compositor (the Linux
 * AppImage), where a view transition crashes the window (canCrossFade).
 */
function morph(name: string, value: string | null) {
  const root = document.documentElement;
  if (root.getAttribute(name) === value) return;
  const apply = () => (value === null ? root.removeAttribute(name) : root.setAttribute(name, value));
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const fade = canCrossFade() && !calm && document.visibilityState === "visible";
  if (fade && document.startViewTransition) document.startViewTransition(apply);
  else apply();
}

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
  /** Classroom beamer mode: larger type, slim rail instead of the full sidebar. */
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

/** The saved value: from the boot state at launch, else the local mirror. */
function readSaved<T>(setting: string, localKey: string, guard: (v: unknown) => v is T, fallback: T): T {
  const atLaunch = bootSetting(setting);
  if (guard(atLaunch)) return atLaunch;
  try {
    const v = localStorage.getItem(localKey);
    return guard(v) ? v : fallback;
  } catch {
    // Storage disabled: the database value arrives just after.
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
  const [pref, setPrefState] = useState<ThemePref>(() =>
    readSaved(SETTING_THEME, LS_THEME, isThemePref, "auto"),
  );
  const [density, setDensityState] = useState<Density>(() =>
    readSaved(SETTING_DENSITY, LS_DENSITY, isDensity, "comfortable"),
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
    morph("data-theme", resolved);
  }, [resolved]);

  useEffect(() => {
    morph("data-density", density);
  }, [density]);

  // The native title bar follows the choice ("auto" follows the system). The
  // window was created in the saved theme, so the first run changes nothing.
  useEffect(() => {
    if (!isTauri()) return;
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(pref === "auto" ? null : pref))
      .catch(logged("theme.titleBar"));
  }, [pref]);

  useEffect(() => {
    morph("data-projection", projection ? "on" : null);
  }, [projection]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    writeLocal(LS_THEME, p);
    api.setSetting(SETTING_THEME, p).catch(logged("settings.theme"));
  }, []);

  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    writeLocal(LS_DENSITY, d);
    api.setSetting(SETTING_DENSITY, d).catch(logged("settings.density"));
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
    [pref, resolved, setPref, density, setDensity, projection, setProjection, toggleProjection],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
