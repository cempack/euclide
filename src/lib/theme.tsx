import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

const THEME_KEY = "eu.theme";
const ACCENT_KEY = "eu.accent";

export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: "TUI Blue", hex: "#007aff" },
  { name: "Ink", hex: "#050404" },
  { name: "Terminal Green", hex: "#30d158" },
  { name: "TUI Red", hex: "#ff3b30" },
  { name: "Ash", hex: "#9a9898" },
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3
      ? h.split("").map((c) => c + c).join("")
      : h,
    16
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: number[], b: number[], t: number): string {
  return a.map((v, i) => Math.round(v * (1 - t) + b[i] * t)).join(" ");
}

function applyVars(theme: Theme, accentHex: string) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  const accent = hexToRgb(accentHex);
  root.style.setProperty("--eu-accent", accent.join(" "));
  // soft tint tuned for terminal grayscale (less aggressive mix)
  const soft =
    theme === "dark" ? mix([47, 49, 49], accent, 0.35) : mix([250, 249, 249], accent, 0.12);
  root.style.setProperty("--eu-accent-soft", soft);
}

type ThemeCtx = {
  theme: Theme;
  accent: string;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setAccent: (hex: string) => void;
};

const Ctx = createContext<ThemeCtx | null>(null);
export const useThemeCtx = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useThemeCtx hors ThemeProvider");
  return c;
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    if (stored) return stored;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [accent, setAccentState] = useState<string>(
    () => localStorage.getItem(ACCENT_KEY) || "#007aff" // TUI blue default for new terminal theme
  );

  useEffect(() => {
    applyVars(theme, accent);
    localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(ACCENT_KEY, accent);
  }, [theme, accent]);

  // Translucent vibrancy material is reliable on macOS; opt in there so other
  // platforms keep a guaranteed-solid background.
  useEffect(() => {
    const isMac = typeof navigator !== "undefined" &&
      /Macintosh|Mac OS X|Mac|iPod|iPhone|iPad/.test(navigator.userAgent || navigator.platform || "");
    document.documentElement.classList.toggle("has-vibrancy", isMac);
  }, []);

  const value = useMemo<ThemeCtx>(
    () => ({
      theme,
      accent,
      setTheme: setThemeState,
      toggleTheme: () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
      setAccent: setAccentState,
    }),
    [theme, accent]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// re-export for components that only need the toggle ergonomics
export const useTheme = useThemeCtx;
