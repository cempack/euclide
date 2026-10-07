import {
  BookOpen,
  ChartColumn,
  FileText,
  FolderOpen,
  House,
  Bell,
  Image,
  NotebookPen,
  Presentation,
  Settings,
  SquareTerminal,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { get } from "../lib/i18n";
import type { TabKind } from "../stores/tabs";
import { keysOf } from "../lib/keymap";

/**
 * One glyph per kind of screen, everywhere it appears (sidebar, tabs, palette,
 * help): each section is recognisable at a glance.
 */
export const KIND_ICONS: Record<TabKind, LucideIcon> = {
  dashboard: House,
  courses: BookOpen,
  course: BookOpen,
  "class-content": BookOpen,
  documents: FolderOpen,
  reminders: Bell,
  note: NotebookPen,
  whiteboard: Presentation,
  python: SquareTerminal,
  tools: Wrench,
  recap: ChartColumn,
  settings: Settings,
  pdf: FileText,
};

/** A PDF tab may hold an image (the same viewer annotates both). */
export function iconForFile(fileName: string | undefined): LucideIcon {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fileName ?? "") ? Image : FileText;
}

export type NavItem = { kind: TabKind; label: string; keys?: string };

/** The sidebar: what you work on, then what you work with. */
export const NAV_WORK: NavItem[] = [
  { kind: "dashboard", label: get("nav.dashboard", "Tableau de bord"), keys: keysOf("dashboard") },
  { kind: "courses", label: get("nav.courses", "Cours") },
  { kind: "documents", label: get("nav.documents", "Documents"), keys: keysOf("documents") },
  { kind: "reminders", label: get("nav.reminders", "Rappels") },
];

export const NAV_TOOLS: NavItem[] = [
  { kind: "note", label: get("nav.notes", "Nouvelle note"), keys: keysOf("newNote") },
  { kind: "whiteboard", label: get("nav.whiteboard", "Tableau blanc"), keys: keysOf("whiteboard") },
  { kind: "python", label: get("nav.python", "Python") },
  { kind: "tools", label: get("nav.tools", "Outils") },
  { kind: "recap", label: get("nav.recap", "Bilan") },
];

/** Whether the sidebar entry `navKind` should look current for the active tab. */
export function navKindActive(navKind: TabKind, activeKind?: TabKind): boolean {
  if (!activeKind) return false;
  if (navKind === activeKind) return true;
  if (navKind === "courses" && (activeKind === "course" || activeKind === "class-content")) return true;
  if (navKind === "documents" && activeKind === "pdf") return true;
  return false;
}
