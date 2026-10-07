export const isMac =
  typeof navigator !== "undefined" &&
  /Macintosh|Mac OS X|Mac|iPod|iPhone|iPad/.test(navigator.userAgent || navigator.platform || "");

export const MOD = isMac ? "⌘" : "Ctrl";
const SHIFT = isMac ? "⇧" : "Maj";

/**
 * The one notation for keys, in tooltips, menus, the sidebar and the help:
 * "mod+shift+K" → ["Ctrl", "Maj", "K"] (["⌘", "⇧", "K"] on a Mac).
 */
export function shortcutKeys(spec: string): string[] {
  return spec.split("+").map((key) => {
    switch (key.toLowerCase()) {
      case "mod":
        return MOD;
      case "shift":
        return SHIFT;
      case "alt":
        return isMac ? "⌥" : "Alt";
      case "ctrl":
        return isMac ? "⌃" : "Ctrl";
      case "enter":
        return "↵";
      case "esc":
        return "Échap";
      default:
        return key.length === 1 ? key.toUpperCase() : key;
    }
  });
}

/** The same keys as text, for labels: "Ctrl K" (⌘K on a Mac). */
export function shortcutText(spec: string): string {
  return shortcutKeys(spec).join(isMac ? "" : " ");
}
