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
      { keys: [MOD, "K"], label: "Palette de commandes" },
      { keys: [MOD, "T"], label: "Nouvel onglet" },
      { keys: [MOD, "W"], label: "Fermer l'onglet" },
      { keys: [MOD, "1 … 9"], label: "Aller a l'onglet" },
      { keys: ["Ctrl", "Tab"], label: "Onglet suivant" },
      { keys: [MOD, "D"], label: "Tableau de bord" },
    ],
  },
  {
    group: "Actions",
    items: [
      { keys: [MOD, "F"], label: "Rechercher un document" },
      { keys: [MOD, "B"], label: "Nouveau tableau blanc" },
      { keys: [MOD, ","], label: "Reglages" },
      { keys: [MOD, "/"], label: "Afficher les raccourcis" },
    ],
  },
];
