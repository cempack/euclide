import { get } from "./i18n";

export const isMac = typeof navigator !== "undefined" &&
  /Macintosh|Mac OS X|Mac|iPod|iPhone|iPad/.test(navigator.userAgent || navigator.platform || "");

export const isWindows = typeof navigator !== "undefined" &&
  /Windows|Win32|Win64|WOW64/.test(navigator.userAgent || navigator.platform || "");

export const isLinux = typeof navigator !== "undefined" &&
  /Linux|X11/.test(navigator.userAgent || navigator.platform || "") && !isMac && !isWindows;

export const MOD = isMac ? "⌘" : "Ctrl";

export interface ShortcutDoc {
  keys: string[];
  label: string;
}

export const SHORTCUTS: { group: string; items: ShortcutDoc[] }[] = [
  {
    group: "Navigation",
    items: [
      { keys: [MOD, "K"], label: get("app.searchTitle", "Rechercher").replace(" ({mod}K)", "") || "Palette" },
      { keys: [MOD, "T"], label: get("app.newTab", "Nouvel onglet") },
      { keys: [MOD, "W"], label: "Fermer onglet" },
      { keys: [MOD, "1…9"], label: "Aller à l'onglet" },
      { keys: ["Ctrl", "Tab"], label: "Onglet suivant" },
      { keys: [MOD, "D"], label: get("nav.dashboard", "Tableau de bord") },
    ],
  },
  {
    group: "Actions",
    items: [
      { keys: [MOD, "F"], label: get("nav.documents", "Documents") },
      { keys: [MOD, "B"], label: get("nav.whiteboard", "Tableau blanc") },
      { keys: [MOD, "N"], label: get("common.newNote", "Nouvelle note") },
      { keys: [MOD, ","], label: get("nav.settings", "Réglages") },
      { keys: [MOD, "/"], label: get("app.shortcutsTitle", "Raccourcis") },
    ],
  },
];
