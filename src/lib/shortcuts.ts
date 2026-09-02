import { get } from "./i18n";

export const isMac = typeof navigator !== "undefined" &&
  /Macintosh|Mac OS X|Mac|iPod|iPhone|iPad/.test(navigator.userAgent || navigator.platform || "");

export const isWindows = typeof navigator !== "undefined" &&
  /Windows|Win32|Win64|WOW64/.test(navigator.userAgent || navigator.platform || "");

export const isLinux = typeof navigator !== "undefined" &&
  /Linux|X11/.test(navigator.userAgent || navigator.platform || "") && !isMac && !isWindows;

export const MOD = isMac ? "⌘" : "Ctrl";
const SHIFT = isMac ? "⇧" : "Maj";

export interface ShortcutDoc {
  keys: string[];
  label: string;
}

/**
 * The keyboard map, as documented to the user.
 * Every entry here is really bound in App.tsx (or in the editor that owns it);
 * the previous list was missing half of the bindings.
 */
export const SHORTCUTS: { group: string; items: ShortcutDoc[] }[] = [
  {
    group: get("shortcuts.groupNavigation", "Navigation"),
    items: [
      { keys: [MOD, "K"], label: get("shortcuts.palette", "Palette de recherche") },
      { keys: [MOD, "T"], label: get("app.newTab", "Nouvel onglet") },
      { keys: [MOD, "W"], label: get("shortcuts.closeTab", "Fermer l'onglet") },
      { keys: [MOD, "1…9"], label: get("shortcuts.gotoTab", "Aller à l'onglet") },
      { keys: ["Ctrl", "Tab"], label: get("shortcuts.nextTab", "Onglet suivant") },
      { keys: ["Ctrl", SHIFT, "Tab"], label: get("shortcuts.prevTab", "Onglet précédent") },
      { keys: [MOD, "D"], label: get("nav.dashboard", "Tableau de bord") },
      { keys: [MOD, "F"], label: get("nav.documents", "Documents") },
    ],
  },
  {
    group: get("shortcuts.groupActions", "Actions"),
    items: [
      { keys: [MOD, "S"], label: get("shortcuts.save", "Enregistrer (note, tableau, script)") },
      { keys: [MOD, "N"], label: get("common.newNote", "Nouvelle note") },
      { keys: [MOD, "B"], label: get("nav.whiteboard", "Tableau blanc") },
      { keys: [MOD, SHIFT, "K"], label: get("capture.title", "Capture rapide") },
      { keys: [MOD, "↵"], label: get("shortcuts.runPython", "Exécuter le script Python") },
      { keys: [MOD, SHIFT, "P"], label: get("appearance.projection", "Mode projection") },
      { keys: [MOD, ","], label: get("nav.settings", "Réglages") },
      { keys: [MOD, "/"], label: get("app.shortcutsTitle", "Raccourcis") },
    ],
  },
  {
    group: get("shortcuts.groupTabs", "Barre d'onglets"),
    items: [
      { keys: [get("shortcuts.doubleClick", "Double-clic")], label: get("shortcuts.pinTab", "Épingler l'onglet") },
      { keys: [get("shortcuts.drag", "Glisser")], label: get("shortcuts.reorderTab", "Réordonner les onglets") },
      { keys: [get("shortcuts.middleClick", "Clic milieu")], label: get("shortcuts.closeTab", "Fermer l'onglet") },
    ],
  },
  {
    group: get("shortcuts.groupPalette", "Dans la palette"),
    items: [
      { keys: [">"], label: get("palette.prefixCommands", "Commandes") },
      { keys: ["@"], label: get("palette.prefixCourses", "Cours") },
      { keys: ["#"], label: get("palette.prefixDocs", "Documents") },
      { keys: ["↑", "↓"], label: get("shortcuts.navigateList", "Parcourir les résultats") },
    ],
  },
];
