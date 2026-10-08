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

const t: unknown = strings; // for get(), the untyped lookup of a key built at run time

/**
 * Untyped lookup, for keys built at run time (palette aliases). Everything
 * else uses tr(), which checks the key.
 *
 * Safe deep getter for i18n strings/arrays/objects.
 * Never throws; returns fallback (or key) if missing.
 * Logs warning in dev for missing keys (helps catch JSON drift after centralization).
 */
export function get(path: string, fallback: unknown = ""): unknown {
  if (!path) return fallback;
  const parts = path.split(".");
  let cur: unknown = t;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object" || !(p in cur)) {
      if (typeof console !== "undefined" && import.meta.env?.DEV) {
        console.warn(`[i18n] missing key "${path}" in src/locales/strings.json — using fallback`);
      }
      return fallback;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur ?? fallback;
}

type Strings = typeof strings;
/** A message whose wording follows a number: « 1 étape », « 3 étapes ». */
type PluralForms = { one: string; other: string };
type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends readonly unknown[] | PluralForms
      ? never
      : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
type Plurals<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends PluralForms
    ? `${P}${K}`
    : T[K] extends string | readonly unknown[]
      ? never
      : Plurals<T[K], `${P}${K}.`>;
}[keyof T & string];
type Lists<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends readonly string[]
    ? `${P}${K}`
    : T[K] extends string
      ? never
      : Lists<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Every message in strings.json, by its dotted path: a typo fails the typecheck. */
export type StringKey = Leaves<Strings>;
export type StringListKey = Lists<Strings>;
/** Every message with singular and plural forms. */
export type PluralKey = Plurals<Strings>;

function lookup(path: string): unknown {
  let cur: unknown = strings;
  for (const p of path.split(".")) cur = (cur as Record<string, unknown> | undefined)?.[p];
  return cur;
}

/** A message, its {placeholders} filled: tr("notes.savedAt", { when }). */
export function tr(key: StringKey, vars?: Record<string, string | number>): string {
  const text = lookup(key);
  const s = typeof text === "string" ? text : key;
  return vars ? fmt(s, vars) : s;
}

const PLURAL = new Intl.PluralRules("fr-FR");
const NUMBER = new Intl.NumberFormat("fr-FR");

/**
 * A message for `count` things, in the right form: French puts 0 and 1 in
 * the singular (« 0 étape », « 1 étape », « 2 étapes »). {count} is written
 * the French way (« 1 200 »).
 */
export function trn(key: PluralKey, count: number, vars?: Record<string, string | number>): string {
  const forms = lookup(key) as Partial<Record<Intl.LDMLPluralRule, string>> | undefined;
  const text = forms?.[PLURAL.select(count)] ?? forms?.other ?? key;
  return fmt(text, { count: NUMBER.format(count), ...vars });
}

/** A list of messages (greetings, day names…). */
export function trList(key: StringListKey): string[] {
  const list = lookup(key);
  return Array.isArray(list) ? list : [];
}
