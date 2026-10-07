import { useEffect, useRef } from "react";
import { tr } from "./i18n";
import { isMac } from "./shortcuts";

/**
 * Every keyboard shortcut, once. The handler, the help sheet, the sidebar
 * and the tooltips all read this table, so a key cannot be bound in one
 * place and documented as another.
 *
 * `inFields`: also while typing in a field. Off for keys that mean
 * something there (Ctrl+B is bold, Ctrl+F is find…).
 * `overDialogs`: also while a dialog is open (to toggle that dialog).
 */
type KeySpec = {
  keys: string;
  label: string;
  group: "navigation" | "actions";
  inFields?: boolean;
  overDialogs?: boolean;
  /** How the help sheet writes keys that are a family (Ctrl 1…9). */
  shown?: string;
};

export const KEYMAP = {
  palette: {
    keys: "mod+K",
    label: tr("shortcuts.palette"),
    group: "navigation",
    inFields: true,
    overDialogs: true,
  },
  newTab: { keys: "mod+T", label: tr("app.newTab"), group: "navigation" },
  closeTab: {
    keys: "mod+W",
    label: tr("shortcuts.closeTab"),
    group: "navigation",
    inFields: true,
  },
  gotoTab: {
    keys: "mod+digit",
    shown: "mod+1…9",
    label: tr("shortcuts.gotoTab"),
    group: "navigation",
  },
  nextTab: {
    keys: "ctrl+Tab",
    label: tr("shortcuts.nextTab"),
    group: "navigation",
    inFields: true,
  },
  prevTab: {
    keys: "ctrl+shift+Tab",
    label: tr("shortcuts.prevTab"),
    group: "navigation",
    inFields: true,
  },
  dashboard: { keys: "mod+D", label: tr("nav.dashboard"), group: "navigation" },
  documents: { keys: "mod+F", label: tr("nav.documents"), group: "navigation" },
  save: {
    keys: "mod+S",
    label: tr("shortcuts.save"),
    group: "actions",
    inFields: true,
  },
  newNote: { keys: "mod+N", label: tr("common.newNote"), group: "actions" },
  whiteboard: { keys: "mod+B", label: tr("nav.whiteboard"), group: "actions" },
  capture: {
    keys: "mod+shift+K",
    label: tr("capture.title"),
    group: "actions",
    inFields: true,
    overDialogs: true,
  },
  runPython: {
    keys: "mod+enter",
    label: tr("shortcuts.runPython"),
    group: "actions",
    inFields: true,
  },
  checkPython: {
    keys: "mod+shift+enter",
    label: tr("shortcuts.checkPython"),
    group: "actions",
    inFields: true,
  },
  scene: {
    keys: "mod+shift+H",
    label: tr("scene.open"),
    group: "actions",
    inFields: true,
  },
  present: {
    keys: "F5",
    label: tr("shortcuts.present"),
    group: "actions",
    inFields: true,
  },
  projection: {
    keys: "mod+shift+P",
    label: tr("appearance.projection"),
    group: "actions",
    inFields: true,
  },
  leaveProjection: {
    keys: "esc",
    label: tr("appearance.leaveProjection"),
    group: "actions",
    inFields: true,
  },
  settings: { keys: "mod+,", label: tr("nav.settings"), group: "actions", inFields: true },
  help: {
    keys: "mod+/",
    label: tr("app.shortcutsTitle"),
    group: "actions",
    inFields: true,
    overDialogs: true,
  },
} satisfies Record<string, KeySpec>;

export type ShortcutId = keyof typeof KEYMAP;

/** The keys of a shortcut, in the notation tooltips and keycaps take. */
export const keysOf = (id: ShortcutId): string => KEYMAP[id].keys;

/**
 * A handler gets the digit for `mod+digit`; returning false means "not
 * mine after all" and lets the key through (Escape outside projection).
 */
type Handler = (digit?: number) => void | boolean;

/** Last bound wins: a screen can take over a key while it is mounted. */
const handlers = new Map<ShortcutId, Handler[]>();

function bind(id: ShortcutId, handler: Handler): () => void {
  const list = handlers.get(id) ?? [];
  list.push(handler);
  handlers.set(id, list);
  return () => {
    const at = list.indexOf(handler);
    if (at !== -1) list.splice(at, 1);
  };
}

/**
 * Binds `id` while the component is mounted and `enabled` holds. The
 * handler may change on every render; the binding does not.
 */
export function useShortcut(id: ShortcutId, handler: Handler, enabled = true) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    return bind(id, (digit) => ref.current(digit));
  }, [id, enabled]);
}

type Parsed = { mod: boolean; ctrl: boolean; shift: boolean; key: string };

function parse(keys: string): Parsed {
  const parts = keys.toLowerCase().split("+");
  return {
    mod: parts.includes("mod"),
    ctrl: parts.includes("ctrl"),
    shift: parts.includes("shift"),
    key: parts[parts.length - 1],
  };
}

const PARSED = Object.fromEntries(
  (Object.keys(KEYMAP) as ShortcutId[]).map((id) => [id, parse(KEYMAP[id].keys)]),
) as Record<ShortcutId, Parsed>;

/**
 * Which shortcut a key press is, and the digit for `mod+digit`. Digits
 * match by physical key and symbols ignore Shift: on a French keyboard the
 * digits and « / » are shifted characters.
 */
export function matchShortcut(
  e: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">,
): { id: ShortcutId; digit?: number } | null {
  if (e.altKey) return null;
  const key = e.key.toLowerCase();
  for (const id of Object.keys(PARSED) as ShortcutId[]) {
    const p = PARSED[id];
    if (e.ctrlKey !== (p.ctrl || (p.mod && !isMac))) continue;
    if (e.metaKey !== (p.mod && isMac)) continue;
    if (p.key === "digit") {
      const digit = /^Digit([1-9])$/.exec(e.code)?.[1] ?? (/^[1-9]$/.test(e.key) ? e.key : null);
      if (digit && !e.shiftKey === !p.shift) return { id, digit: Number(digit) };
      continue;
    }
    const symbol = p.key.length === 1 && !/[a-z0-9]/.test(p.key);
    if (!symbol && e.shiftKey !== p.shift) continue;
    if (
      p.key === "tab" ? key === "tab" || e.code === "Tab" : p.key === "esc" ? key === "escape" : key === p.key
    )
      return { id };
  }
  return null;
}

function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return (
    el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT"
  );
}

/** The one keydown listener for app shortcuts. Returns the stop. */
export function startShortcuts(): () => void {
  const onKey = (e: KeyboardEvent) => {
    const hit = matchShortcut(e);
    if (!hit) return;
    const spec: KeySpec = KEYMAP[hit.id];
    if (!spec.inFields && typingIn(e.target)) return;
    if (!spec.overDialogs && document.querySelector("dialog[open]:modal")) return;
    const list = handlers.get(hit.id);
    const handler = list?.[list.length - 1];
    if (!handler) return;
    if (handler(hit.digit) === false) return;
    e.preventDefault();
    e.stopPropagation();
  };
  window.addEventListener("keydown", onKey, true);
  return () => window.removeEventListener("keydown", onKey, true);
}

/** The help sheet's keyboard groups, straight from the keymap. */
export function keymapGroups(): { group: string; items: { keys: string; label: string }[] }[] {
  const specs = Object.values(KEYMAP) as KeySpec[];
  const of = (group: KeySpec["group"]) =>
    specs.filter((s) => s.group === group).map((s) => ({ keys: s.shown ?? s.keys, label: s.label }));
  return [
    { group: tr("shortcuts.groupNavigation"), items: of("navigation") },
    { group: tr("shortcuts.groupActions"), items: of("actions") },
  ];
}
