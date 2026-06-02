export const isMac = /Macintosh|Mac OS X/.test(
  typeof navigator !== "undefined" ? navigator.userAgent : ""
);

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
