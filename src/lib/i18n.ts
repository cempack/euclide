// All user-facing messages live in src/locales/strings.json.
// Single language (concise French). Edit here, no code changes needed.

import strings from "../locales/strings.json";

// Simple template formatter: fmt("Bonjour {name}", { name: "Elliot" }) => "Bonjour Elliot"
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return Object.keys(vars).reduce((str, key) => {
    const re = new RegExp(`\\{${key}\\}`, "g");
    return str.replace(re, String(vars[key]));
  }, template);
}

export const t = strings as any; // runtime object from JSON (all strings + arrays)
export type Strings = typeof t;

/**
 * Safe deep getter for i18n strings/arrays/objects.
 * Never throws; returns fallback (or key) if missing.
 * Logs warning in dev for missing keys (helps catch JSON drift after centralization).
 */
export function get(path: string, fallback: any = ""): any {
  if (!path) return fallback;
  const parts = path.split(".");
  let cur: any = t;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object" || !(p in cur)) {
      if (typeof console !== "undefined" && (import.meta as any)?.env?.DEV) {
        console.warn(`[i18n] missing key "${path}" in src/locales/strings.json — using fallback`);
      }
      return fallback;
    }
    cur = cur[p];
  }
  return cur ?? fallback;
}

// Back-compat alias if some code prefers tt()
export const tt = get;
