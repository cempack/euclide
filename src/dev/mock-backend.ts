/**
 * In-memory stand-in for the Rust backend, used only by the Vite dev server
 * when Euclide runs in a plain browser (`npm run dev`, screenshot tests).
 *
 * The data is a realistic week of a maths/NSI teacher, built relative to the
 * current time so « aujourd'hui », « demain » and « en retard » always mean
 * something. Writes change the in-memory store so screens can be exercised.
 * Add `?empty` to the URL to start from an empty library instead.
 *
 * Production builds never include this file (see `invoke` in lib/api.ts).
 */
import samplePdf from "./fixtures/cours.pdf?url";
import { serveDevFiles } from "../lib/api";
import type {
  AppInfo,
  Course,
  CourseClass,
  FileItem,
  Note,
  PronoteStatus,
  PythonDemo,
  QuickLink,
  RecapData,
  Reminder,
  ScheduleEntry,
  SearchResult,
  Sequence,
  SequenceItem,
  StepResource,
  BackupStatus,
} from "../lib/api";

type Args = Record<string, unknown> | undefined;

const now = new Date();
const empty = typeof location !== "undefined" && new URLSearchParams(location.search).has("empty");

function addDays(days: number, hours?: number, minutes = 0): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  if (hours != null) d.setHours(hours, minutes, 0, 0);
  return d;
}
function addHours(hours: number): Date {
  return new Date(now.getTime() + hours * 3_600_000);
}
/** SQLite `datetime('now')` format: UTC, space separated. */
/** To the minute: the data loads a second or two after the screenshots' clock starts. */
function sqlUtc(d: Date): string {
  return `${d.toISOString().slice(0, 16).replace("T", " ")}:00`;
}

let nextId = 1000;
const newId = () => nextId++;

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

const courses: Course[] = [
  {
    id: 1,
    name: "Mathématiques",
    emoji: "calc",
    color: "#2c62a8",
    description: "Seconde générale : fonctions, statistiques, vecteurs et géométrie repérée.",
    matiere: "Mathématiques",
    created_at: sqlUtc(addDays(-40)),
  },
  {
    id: 2,
    name: "NSI",
    emoji: "code",
    color: "#1f6f65",
    description: "Terminale : structures de données, algorithmique et bases de données.",
    matiere: "NSI",
    created_at: sqlUtc(addDays(-38)),
  },
  {
    id: 3,
    name: "Maths expertes",
    emoji: "ruler",
    color: "#7a3fa0",
    description: "Terminale : arithmétique, nombres complexes, matrices.",
    matiere: "Maths expertes",
    created_at: sqlUtc(addDays(-35)),
  },
  {
    id: 4,
    name: "Spécialité maths",
    emoji: "pencil",
    color: "#a15c07",
    description: "Première : suites, dérivation, probabilités conditionnelles.",
    matiere: "Mathématiques",
    created_at: sqlUtc(addDays(-33)),
  },
];

const sequences: Sequence[] = [
  { id: 1, course_id: 1, title: "Fonctions de référence", position: 0, created_at: sqlUtc(addDays(-30)) },
  { id: 2, course_id: 1, title: "Statistiques", position: 1, created_at: sqlUtc(addDays(-30)) },
  { id: 3, course_id: 1, title: "Vecteurs", position: 2, created_at: sqlUtc(addDays(-30)) },
  { id: 4, course_id: 2, title: "Structures de données", position: 0, created_at: sqlUtc(addDays(-28)) },
  { id: 5, course_id: 2, title: "Bases de données", position: 1, created_at: sqlUtc(addDays(-28)) },
  { id: 6, course_id: 3, title: "Arithmétique", position: 0, created_at: sqlUtc(addDays(-25)) },
];

const files: FileItem[] = [
  {
    id: 1,
    course_id: 1,
    name: "Chapitre 3 — Fonctions de référence.pdf",
    rel_path: "courses/1/chapitre-3.pdf",
    kind: "pdf",
    size: 482_311,
    added_at: sqlUtc(addHours(-26)),
  },
  {
    id: 2,
    course_id: 1,
    name: "Exercices — Fonction carré.pdf",
    rel_path: "courses/1/exercices-carre.pdf",
    kind: "pdf",
    size: 155_204,
    added_at: sqlUtc(addDays(-2)),
  },
  {
    id: 3,
    course_id: 2,
    name: "TP — Piles et files.pdf",
    rel_path: "courses/2/tp-piles.pdf",
    kind: "pdf",
    size: 231_870,
    added_at: sqlUtc(addDays(-3)),
  },
  {
    id: 4,
    course_id: 2,
    name: "Cours — Arbres binaires.pdf",
    rel_path: "courses/2/arbres.pdf",
    kind: "pdf",
    size: 1_204_551,
    added_at: sqlUtc(addDays(-6)),
  },
  {
    id: 5,
    course_id: null,
    name: "Programme officiel de seconde.pdf",
    rel_path: "documents/programme-2nde.pdf",
    kind: "pdf",
    size: 3_811_002,
    added_at: sqlUtc(addDays(-20)),
  },
  {
    id: 6,
    course_id: 1,
    name: "Tableau — Vecteurs.euboard",
    rel_path: "whiteboards/vecteurs.euboard",
    kind: "board",
    size: 48_120,
    added_at: sqlUtc(addHours(-2)),
  },
  {
    id: 7,
    course_id: 3,
    name: "DM 2 — Congruences.pdf",
    rel_path: "courses/3/dm2.pdf",
    kind: "pdf",
    size: 98_310,
    added_at: sqlUtc(addDays(-9)),
  },
  {
    id: 8,
    course_id: null,
    name: "Photo du tableau.jpg",
    rel_path: "documents/photo-tableau.jpg",
    kind: "image",
    size: 2_301_998,
    added_at: sqlUtc(addDays(-1)),
  },
  {
    id: 9,
    course_id: 4,
    name: "Fiche méthode — Suites.pdf",
    rel_path: "courses/4/fiche-suites.pdf",
    kind: "pdf",
    size: 120_442,
    added_at: sqlUtc(addDays(-14)),
  },
  {
    id: 10,
    course_id: 2,
    name: "Sujet bac NSI 2026.pdf",
    rel_path: "courses/2/bac-2026.pdf",
    kind: "pdf",
    size: 640_118,
    added_at: sqlUtc(addDays(-35)),
  },
  {
    id: 11,
    course_id: 4,
    name: "Progression annuelle.xlsx",
    rel_path: "courses/4/progression.xlsx",
    kind: "sheet",
    size: 22_016,
    added_at: sqlUtc(addDays(-31)),
  },
];

const sequenceItems: Omit<SequenceItem, "resources">[] = [
  { id: 1, sequence_id: 1, title: "Fonction carré", position: 0 },
  { id: 2, sequence_id: 1, title: "Fonction inverse", position: 1 },
  { id: 3, sequence_id: 1, title: "Variations et extremums", position: 2 },
  { id: 4, sequence_id: 2, title: "Moyenne et médiane", position: 0 },
  { id: 5, sequence_id: 2, title: "Écart interquartile", position: 1 },
  { id: 6, sequence_id: 3, title: "Translations", position: 0 },
  { id: 7, sequence_id: 4, title: "Piles et files", position: 0 },
  { id: 8, sequence_id: 4, title: "Arbres binaires", position: 1 },
  { id: 9, sequence_id: 4, title: "Graphes", position: 2 },
  { id: 10, sequence_id: 5, title: "Modèle relationnel", position: 0 },
  { id: 11, sequence_id: 6, title: "Divisibilité et congruences", position: 0 },
];

/** What each step opens in class (sequence_item_resources). */
type MockResource = Pick<StepResource, "id" | "item_id" | "kind" | "ref_id" | "ref_name"> & {
  position: number;
};
const stepResources: MockResource[] = [
  { id: 1, item_id: 1, kind: "note", ref_id: 1, ref_name: "", position: 0 },
  { id: 2, item_id: 1, kind: "file", ref_id: 2, ref_name: "", position: 1 },
  { id: 3, item_id: 1, kind: "link", ref_id: 4, ref_name: "", position: 2 },
  { id: 4, item_id: 2, kind: "file", ref_id: 1, ref_name: "", position: 0 },
  { id: 5, item_id: 3, kind: "file", ref_id: 2, ref_name: "", position: 0 },
  { id: 6, item_id: 6, kind: "file", ref_id: 6, ref_name: "", position: 0 },
  { id: 7, item_id: 7, kind: "file", ref_id: 3, ref_name: "", position: 0 },
  { id: 8, item_id: 7, kind: "script", ref_id: null, ref_name: "Pile.py", position: 1 },
  { id: 9, item_id: 8, kind: "file", ref_id: 4, ref_name: "", position: 0 },
  { id: 10, item_id: 11, kind: "file", ref_id: 7, ref_name: "", position: 0 },
  { id: 11, item_id: 11, kind: "note", ref_id: 4, ref_name: "", position: 1 },
];

const courseClasses: CourseClass[] = [
  {
    id: 1,
    course_id: 1,
    class_name: "2NDE4",
    last_file_id: 2,
    last_item_id: 1,
    progress_updated_at: sqlUtc(addDays(-1)),
    notes: "Reprendre l'exercice 12 : beaucoup d'erreurs sur les signes.",
  },
  {
    id: 2,
    course_id: 1,
    class_name: "2NDE7",
    last_file_id: 1,
    last_item_id: 2,
    progress_updated_at: sqlUtc(addDays(-2)),
    notes: "",
  },
  {
    id: 3,
    course_id: 2,
    class_name: "TNSI",
    last_file_id: 4,
    last_item_id: 8,
    progress_updated_at: sqlUtc(addDays(-3)),
    notes: "Projet arbres : groupes de trois, rendu vendredi.",
  },
  {
    id: 4,
    course_id: 3,
    class_name: "TEXP1",
    last_file_id: 7,
    last_item_id: 11,
    progress_updated_at: sqlUtc(addDays(-6)),
    notes: "",
  },
  {
    id: 5,
    course_id: 4,
    class_name: "1SPE3",
    last_file_id: 9,
    last_item_id: null,
    progress_updated_at: sqlUtc(addDays(-8)),
    notes: "",
  },
];

const notes: Note[] = [
  {
    id: 1,
    course_id: 1,
    title: "Fonction carré — cours",
    body:
      "## Définition\n\nLa fonction carré est définie sur $\\mathbb{R}$ par $f(x) = x^2$.\n\n" +
      "- Elle est **décroissante** sur $]-\\infty ; 0]$ et **croissante** sur $[0 ; +\\infty[$.\n" +
      "- Son minimum vaut $0$, atteint en $x = 0$.\n\n" +
      "## Propriété\n\nPour tous réels $a$ et $b$ : $$a^2 - b^2 = (a - b)(a + b)$$\n",
    updated_at: sqlUtc(addHours(-3)),
  },
  {
    id: 2,
    course_id: 2,
    title: "Piles : exemples en classe",
    body: "Une pile suit le principe **LIFO**.\n\n```python\npile = []\npile.append(3)\npile.append(7)\nprint(pile.pop())  # 7\n```\n\nApplication : vérifier un parenthésage.\n",
    updated_at: sqlUtc(addDays(-1)),
  },
  {
    id: 3,
    course_id: null,
    title: "Journée portes ouvertes",
    body: "- Stand NSI : robots + Python\n- Affiche « Les maths au lycée »\n- Prévoir deux élèves de Terminale\n",
    updated_at: sqlUtc(addDays(-4)),
  },
  {
    id: 4,
    course_id: 3,
    title: "Congruences — exercices types",
    body: "Montrer que pour tout entier $n$, $n^3 - n$ est divisible par $6$.\n",
    updated_at: sqlUtc(addDays(-7)),
  },
];

const reminders: Reminder[] = [
  {
    id: 1,
    title: "Rendre les copies du DS de 2NDE4",
    due_at: addDays(0, 17).toISOString(),
    done: false,
    created_at: sqlUtc(addDays(-3)),
    course_id: 1,
    repeat_rule: "none",
  },
  {
    id: 2,
    title: "Préparer le TP arbres binaires",
    due_at: addDays(1, 8).toISOString(),
    done: false,
    created_at: sqlUtc(addDays(-2)),
    course_id: 2,
    repeat_rule: "none",
  },
  {
    id: 3,
    title: "Saisir les notes du trimestre",
    due_at: addDays(-2, 18).toISOString(),
    done: false,
    created_at: sqlUtc(addDays(-10)),
    course_id: null,
    repeat_rule: "none",
  },
  {
    id: 4,
    title: "Réunion parents-professeurs",
    due_at: addDays(6, 18).toISOString(),
    done: false,
    created_at: sqlUtc(addDays(-5)),
    course_id: null,
    repeat_rule: "none",
  },
  {
    id: 5,
    title: "Photocopies pour la semaine",
    due_at: addDays(3, 7, 30).toISOString(),
    done: false,
    created_at: sqlUtc(addDays(-20)),
    course_id: null,
    repeat_rule: "weekly",
  },
  {
    id: 6,
    title: "Envoyer le sujet du DM aux 1SPE3",
    due_at: addDays(-1, 12).toISOString(),
    done: true,
    created_at: sqlUtc(addDays(-6)),
    course_id: 4,
    repeat_rule: "none",
  },
];

const links: QuickLink[] = [
  { id: 1, label: "Pronote", url: "https://demo.index-education.net/pronote/professeur.html", icon: "" },
  { id: 2, label: "ENT", url: "https://www.monlycee.net", icon: "" },
  { id: 3, label: "Capytale", url: "https://capytale2.ac-paris.fr", icon: "" },
  { id: 4, label: "GeoGebra", url: "https://www.geogebra.org/classic", icon: "" },
];

const sched = (
  id: number,
  day: number,
  start: string,
  end: string,
  subject: string,
  room: string,
): ScheduleEntry => ({
  id,
  day_of_week: day,
  start_time: start,
  end_time: end,
  subject,
  room,
  course_id: null,
  source: "pronote",
});

const schedule: ScheduleEntry[] = [
  sched(1, 1, "08:00", "09:00", "MATHEMATIQUES · 2NDE4", "B204"),
  sched(2, 1, "10:00", "12:00", "NSI · TNSI", "Info 2"),
  sched(3, 1, "14:00", "15:00", "MATHEMATIQUES · 1SPE3", "B110"),
  sched(4, 2, "08:00", "10:00", "NSI · TNSI", "Info 2"),
  sched(5, 2, "10:15", "11:15", "MATHEMATIQUES · 2NDE7", "B204"),
  sched(6, 2, "13:30", "14:30", "MATHS EXPERTES · TEXP1", "B110"),
  sched(7, 3, "09:00", "10:00", "MATHEMATIQUES · 2NDE4", "B204"),
  sched(8, 3, "10:00", "12:00", "MATHEMATIQUES · 1SPE3", "B110"),
  sched(9, 4, "08:00", "09:00", "MATHS EXPERTES · TEXP1", "B110"),
  sched(10, 4, "09:00", "10:00", "MATHEMATIQUES · 2NDE7", "B204"),
  sched(11, 4, "14:00", "16:00", "NSI · TNSI", "Info 2"),
  sched(12, 5, "10:00", "11:00", "MATHEMATIQUES · 2NDE4", "B204"),
  sched(13, 5, "11:00", "12:00", "MATHEMATIQUES · 1SPE3", "B110"),
];

const pythonDemos: PythonDemo[] = [
  {
    name: "Suite de Syracuse",
    path: "/mock/python/Suite_de_Syracuse.py",
    code: 'def syracuse(n):\n    """Renvoie la suite de Syracuse partant de n."""\n    suite = [n]\n    while n != 1:\n        n = n // 2 if n % 2 == 0 else 3 * n + 1\n        suite.append(n)\n    return suite\n\nprint(syracuse(27)[:10])\n',
  },
  {
    name: "Pile",
    path: "/mock/python/Pile.py",
    code: "class Pile:\n    def __init__(self):\n        self.contenu = []\n\n    def empiler(self, x):\n        self.contenu.append(x)\n\n    def depiler(self):\n        return self.contenu.pop()\n\np = Pile()\np.empiler(1)\np.empiler(2)\nprint(p.depiler())\n",
  },
  {
    name: "Méthode de dichotomie",
    path: "/mock/python/Methode_de_dichotomie.py",
    code: "def dichotomie(f, a, b, eps=1e-6):\n    while b - a > eps:\n        m = (a + b) / 2\n        if f(a) * f(m) <= 0:\n            b = m\n        else:\n            a = m\n    return (a + b) / 2\n\nprint(dichotomie(lambda x: x**2 - 2, 1, 2))\n",
  },
];

const settings = new Map<string, string>([
  ["teacher_display_name", ""],
  ["class_end_notice", "5"],
]);

/** Automatic backups: a week of daily copies, a mirror on the PC's disk. */
const backups = {
  external: "D:\\Sauvegardes\\Euclide" as string | null,
  restore: null as string | null,
};
function backupStatus(): BackupStatus {
  const days = [0, 1, 2, 3, 4, 5, 6, 13, 20].map((n) => localYmdOf(addDays(-n)));
  return {
    snapshots: days.map((day, i) => ({ name: `${day}.db`, day, size: 2_150_400 - i * 36_864 })),
    folder: "/media/CLE-USB/Euclide-Sauvegardes",
    external_dir: backups.external,
    external_reachable: backups.external != null,
    last_mirror: backups.external ? `${days[0]} 08:12` : null,
    integrity: "ok",
    restore_pending: backups.restore != null,
  };
}
function localYmdOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Saved boards: « Tableau — Vecteurs » is a format 2 drawing (fractions of the window). */
const boards = new Map<number, string>([
  [
    6,
    JSON.stringify({
      version: 2,
      strokes: [
        {
          color: "#2196f3",
          size: 6,
          eraser: false,
          pts: Array.from({ length: 24 }, (_, i) => ({
            x: 0.62 + i * 0.012,
            y: 0.3 + Math.sin(i / 4) * 0.04,
          })),
        },
      ],
      shapes: [
        { type: "line", x1: 0.15, y1: 0.7, x2: 0.4, y2: 0.35, color: "#000000", size: 3 },
        { type: "line", x1: 0.4, y1: 0.35, x2: 0.55, y2: 0.62, color: "#f44336", size: 3 },
        { type: "line", x1: 0.15, y1: 0.7, x2: 0.55, y2: 0.62, color: "#4caf50", size: 3 },
        { type: "ellipse", x1: 0.62, y1: 0.5, x2: 0.8, y2: 0.78, color: "#9c27b0", size: 3 },
      ],
      texts: [
        { x: 0.24, y: 0.45, text: "u", color: "#000000", size: 26 },
        { x: 0.49, y: 0.42, text: "v", color: "#f44336", size: 26 },
        { x: 0.3, y: 0.7, text: "u + v", color: "#4caf50", size: 26 },
      ],
    }),
  ],
]);

let keepAwake = true;
const pronote: PronoteStatus = {
  connected: true,
  account_name: "DUPONT Camille",
  last_sync: sqlUtc(addHours(-5)),
};

if (empty) {
  for (const list of [
    courses,
    sequences,
    files,
    sequenceItems,
    stepResources,
    courseClasses,
    notes,
    reminders,
    links,
    schedule,
    pythonDemos,
  ] as unknown[][]) {
    list.length = 0;
  }
  pronote.connected = false;
  pronote.account_name = null;
  pronote.last_sync = null;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const num = (args: Args, key: string): number | null => {
  const v = args?.[key];
  return typeof v === "number" ? v : v == null ? null : Number(v);
};
const str = (args: Args, key: string): string => String(args?.[key] ?? "");

function resource(r: MockResource): StepResource {
  const file = r.kind === "file" ? files.find((x) => x.id === r.ref_id) : undefined;
  const note = r.kind === "note" ? notes.find((x) => x.id === r.ref_id) : undefined;
  const link = r.kind === "link" ? links.find((x) => x.id === r.ref_id) : undefined;
  return {
    id: r.id,
    item_id: r.item_id,
    kind: r.kind,
    ref_id: r.ref_id,
    ref_name: r.ref_name,
    name: file?.name ?? note?.title ?? link?.label ?? r.ref_name,
    file_kind: file?.kind ?? null,
    url: link?.url ?? null,
  };
}

function withResources(item: Omit<SequenceItem, "resources">): SequenceItem {
  const mine = stepResources
    .filter((r) => r.item_id === item.id)
    .sort((a, b) => a.position - b.position || a.id - b.id);
  return { ...item, resources: mine.map(resource) };
}

/** Moves `id` by `delta` among `list` (already one parent's rows), renumbering. */
function reorder<T extends { id: number; position: number }>(list: T[], id: number, delta: number) {
  const sorted = list.slice().sort((a, b) => a.position - b.position || a.id - b.id);
  const from = sorted.findIndex((x) => x.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= sorted.length) return;
  const [moved] = sorted.splice(from, 1);
  sorted.splice(to, 0, moved);
  sorted.forEach((x, i) => (x.position = i));
}

function withProgress(cc: CourseClass): CourseClass {
  const f = files.find((x) => x.id === cc.last_file_id);
  const item = sequenceItems.find((x) => x.id === cc.last_item_id);
  const seq = item ? sequences.find((s) => s.id === item.sequence_id) : undefined;
  return {
    ...cc,
    last_file_name: f?.name ?? null,
    last_file_kind: f?.kind ?? null,
    last_item_title: item?.title ?? null,
    last_sequence_title: seq?.title ?? null,
  };
}

function isoDay(d: Date): number {
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

function search(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const has = (s: string) => s.toLowerCase().includes(q);
  const out: SearchResult[] = [];
  for (const c of courses) {
    if (has(c.name))
      out.push({
        kind: "course",
        id: c.id,
        title: c.name,
        subtitle: c.matiere,
        snippet: c.description,
        course_id: c.id,
        file_kind: "",
      });
  }
  for (const f of files) {
    if (has(f.name))
      out.push({
        kind: "file",
        id: f.id,
        title: f.name,
        subtitle: "Document",
        snippet: "",
        course_id: f.course_id,
        file_kind: f.kind,
      });
  }
  for (const n of notes) {
    if (has(n.title) || has(n.body)) {
      const i = n.body.toLowerCase().indexOf(q);
      const snippet = i >= 0 ? n.body.slice(Math.max(0, i - 30), i + 60) : "";
      out.push({
        kind: "note",
        id: n.id,
        title: n.title,
        subtitle: "Note",
        snippet,
        course_id: n.course_id,
        file_kind: "",
      });
    }
  }
  return out.slice(0, 20);
}

const recap: RecapData = {
  files_opened: 23,
  notes_written: 6,
  demos_run: 11,
  reminders_done: 4,
  active_minutes: 312,
  top_courses: [
    { name: "Mathématiques", emoji: "calc", count: 14 },
    { name: "NSI", emoji: "code", count: 9 },
    { name: "Maths expertes", emoji: "ruler", count: 3 },
  ],
  top_documents: [
    { name: "Chapitre 3 — Fonctions de référence.pdf", count: 7 },
    { name: "TP — Piles et files.pdf", count: 5 },
    { name: "Cours — Arbres binaires.pdf", count: 3 },
  ],
  top_tools: [
    { name: "Tableau blanc", count: 8 },
    { name: "Python", count: 6 },
    { name: "Minuteur", count: 4 },
  ],
  // Tab kinds, as App.tsx logs them each active minute.
  time_by_area: [
    { name: "pdf", count: 124 },
    { name: "whiteboard", count: 71 },
    { name: "note", count: 58 },
    { name: "python", count: 39 },
    { name: "dashboard", count: 20 },
  ],
};

function pronoteContents(args: Args) {
  const className = str(args, "className") || "2NDE4";
  const day = (offset: number) => addDays(offset, 8);
  const contents = [0, -2, -7, -9, -14].map((offset, i) => {
    const d = day(offset);
    return {
      // As Pronote writes them: « 01/10/2026 08:00:00 ».
      date: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} 08:00:00`,
      date_label: d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
      start_time: "08:00",
      end_time: "09:00",
      subject: "MATHEMATIQUES",
      title: [
        "Fonction carré : variations",
        "Fonction inverse",
        "Exercices de synthèse",
        "Évaluation : fonctions affines",
        "Correction du DS",
      ][i],
      description:
        "Activité d'introduction puis cours. Exercices 12, 14 et 15 page 87 à terminer pour la prochaine séance.",
      category: i === 3 ? "Évaluation" : "Cours",
      groups: className,
      teachers: "DUPONT C.",
      lesson_id: `L${i}`,
      documents: i % 2 === 0 ? [{ name: "Fiche d'exercices.pdf", id: `D${i}`, type: 1 }] : [],
    };
  });
  return { ok: true, contents };
}

export function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): T {
  // A copy, as the backend's JSON is: the page must never hold the sample
  // data itself (a change would mutate what the query cache compares).
  const out = handle(cmd, args);
  return (out == null ? out : structuredClone(out)) as T;
}

function handle(cmd: string, args: Args): unknown {
  switch (cmd) {
    // App
    case "get_app_info":
      return {
        teacher_name: pronote.account_name ?? "",
        author: "Elliot Moreau",
        version: "0.1.13",
        data_dir: "/media/CLE-USB/Euclide-Data",
        windows_portable: false,
        data_format: 2,
      } satisfies AppInfo;
    case "get_backup_status":
      return backupStatus();
    case "backup_now":
      return backupStatus();
    case "choose_backup_folder":
      backups.external = "D:\\Sauvegardes\\Euclide";
      return backups.external;
    case "clear_backup_folder":
      backups.external = null;
      return null;
    case "restore_snapshot":
      backups.restore = str(args, "name");
      return null;
    case "cancel_restore":
      backups.restore = null;
      return null;
    case "open_folder":
      return null;
    case "get_setting":
      return settings.get(str(args, "key")) ?? null;
    case "set_setting":
      settings.set(str(args, "key"), str(args, "value"));
      return null;
    case "log_event":
      return null;
    case "keep_awake_status":
      return keepAwake;
    case "set_keep_awake":
      keepAwake = Boolean(args?.on);
      return keepAwake;
    case "backup_data_dir":
      return "/media/CLE-USB/Euclide-Sauvegardes/euclide-mock.zip";

    // Courses
    case "list_courses":
      return courses.slice();
    case "create_course": {
      const c: Course = {
        id: newId(),
        name: str(args, "name"),
        emoji: str(args, "emoji") || "book",
        color: str(args, "color") || "#2c62a8",
        description: str(args, "description"),
        matiere: str(args, "matiere"),
        created_at: sqlUtc(new Date()),
      };
      courses.push(c);
      return c;
    }
    case "update_course": {
      const input = (args?.course ?? {}) as Partial<Course>;
      const c = courses.find((x) => x.id === input.id);
      if (c) Object.assign(c, input);
      return null;
    }
    case "delete_course": {
      const i = courses.findIndex((x) => x.id === num(args, "id"));
      if (i >= 0) courses.splice(i, 1);
      return null;
    }
    case "list_course_classes": {
      const id = num(args, "courseId");
      return courseClasses.filter((c) => id == null || c.course_id === id).map(withProgress);
    }
    case "list_all_course_classes":
      return courseClasses.map(withProgress);
    case "attach_class_to_course": {
      const courseId = num(args, "courseId") ?? 0;
      const name = str(args, "className");
      const existing = courseClasses.find((c) => c.course_id === courseId && c.class_name === name);
      if (existing) return withProgress(existing);
      const cc: CourseClass = {
        id: newId(),
        course_id: courseId,
        class_name: name,
        last_file_id: null,
        last_item_id: null,
        progress_updated_at: sqlUtc(new Date()),
        notes: "",
      };
      courseClasses.push(cc);
      return withProgress(cc);
    }
    case "detach_course_class": {
      const i = courseClasses.findIndex((c) => c.id === num(args, "id"));
      if (i >= 0) courseClasses.splice(i, 1);
      return null;
    }
    case "pronote_classes":
      return {
        ok: true,
        classes: ["2NDE4", "2NDE7", "TNSI", "TEXP1", "1SPE3", "2NDE1"].map((name) => ({ name })),
      };
    case "pronote_contents":
      return pronoteContents(args);

    // Sequences
    case "list_sequences":
      return sequences
        .filter((s) => s.course_id === num(args, "courseId"))
        .sort((a, b) => a.position - b.position);
    case "create_sequence": {
      const courseId = num(args, "courseId") ?? 0;
      const created: Sequence = {
        id: Math.max(0, ...sequences.map((x) => x.id)) + 1,
        course_id: courseId,
        title: String(args?.title ?? ""),
        position: sequences.filter((x) => x.course_id === courseId).length,
        created_at: sqlUtc(new Date()),
      };
      sequences.push(created);
      return created;
    }
    case "rename_sequence": {
      const sq = sequences.find((x) => x.id === num(args, "id"));
      if (sq) sq.title = str(args, "title");
      return null;
    }
    case "list_sequence_items": {
      const courseId = num(args, "courseId");
      // Chapter by chapter, step by step, like the backend.
      const own = sequences
        .filter((s) => s.course_id === courseId)
        .sort((a, b) => a.position - b.position || a.id - b.id);
      const rank = new Map(own.map((s, i) => [s.id, i]));
      return sequenceItems
        .filter((i) => rank.has(i.sequence_id))
        .sort(
          (a, b) =>
            rank.get(a.sequence_id)! - rank.get(b.sequence_id)! || a.position - b.position || a.id - b.id,
        )
        .map(withResources);
    }
    case "create_sequence_item": {
      const sequenceId = num(args, "sequenceId") ?? 0;
      const item = {
        id: newId(),
        sequence_id: sequenceId,
        title: str(args, "title"),
        position: sequenceItems.filter((i) => i.sequence_id === sequenceId).length,
      };
      sequenceItems.push(item);
      const fileId = num(args, "fileId");
      if (fileId != null)
        stepResources.push({
          id: newId(),
          item_id: item.id,
          kind: "file",
          ref_id: fileId,
          ref_name: "",
          position: 0,
        });
      return withResources(item);
    }
    case "rename_sequence_item": {
      const item = sequenceItems.find((i) => i.id === num(args, "id"));
      if (item) item.title = str(args, "title");
      return null;
    }
    case "delete_sequence_item": {
      const i = sequenceItems.findIndex((x) => x.id === num(args, "id"));
      if (i >= 0) sequenceItems.splice(i, 1);
      return null;
    }
    case "move_sequence_item":
      reorder(
        sequenceItems.filter((i) => i.sequence_id === num(args, "sequenceId")),
        num(args, "id") ?? 0,
        num(args, "delta") ?? 0,
      );
      return null;
    case "add_step_resource": {
      const itemId = num(args, "itemId") ?? 0;
      const kind = str(args, "kind") as StepResource["kind"];
      const refId = num(args, "refId");
      const refName = kind === "script" ? str(args, "refName") : "";
      const same = stepResources.find(
        (r) => r.item_id === itemId && r.kind === kind && r.ref_id === refId && r.ref_name === refName,
      );
      if (same) return resource(same);
      const r: MockResource = {
        id: newId(),
        item_id: itemId,
        kind,
        ref_id: kind === "script" ? null : refId,
        ref_name: refName,
        position: stepResources.filter((x) => x.item_id === itemId).length,
      };
      stepResources.push(r);
      return resource(r);
    }
    case "remove_step_resource": {
      const i = stepResources.findIndex((r) => r.id === num(args, "id"));
      if (i >= 0) stepResources.splice(i, 1);
      return null;
    }
    case "set_course_class_item": {
      const cc = courseClasses.find(
        (c) => c.course_id === num(args, "courseId") && c.class_name === str(args, "className"),
      );
      if (cc) {
        cc.last_item_id = num(args, "itemId");
        cc.progress_updated_at = sqlUtc(new Date());
      }
      return null;
    }

    // Notes
    case "list_notes":
      return notes.filter((n) => n.course_id === num(args, "courseId"));
    case "all_notes":
      return notes.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    case "get_note": {
      const note = notes.find((n) => n.id === Number(args?.id));
      if (!note) throw { code: "not_found", message: "Note introuvable." };
      return note;
    }
    case "save_note": {
      const input = (args?.note ?? {}) as Partial<Note>;
      const existing = input.id ? notes.find((n) => n.id === input.id) : undefined;
      const updated_at = sqlUtc(new Date());
      if (existing) {
        Object.assign(existing, input, { updated_at });
        return { ...existing };
      }
      const n: Note = {
        id: newId(),
        title: input.title ?? "Note",
        body: input.body ?? "",
        course_id: input.course_id ?? null,
        updated_at,
      };
      notes.push(n);
      return { ...n };
    }
    case "delete_note": {
      const i = notes.findIndex((n) => n.id === num(args, "id"));
      if (i >= 0) notes.splice(i, 1);
      return null;
    }

    // Files
    case "list_files": {
      // Like the backend: no course id means the library, the files of no course.
      const id = num(args, "courseId") ?? null;
      return files.filter((f) => (f.course_id ?? null) === id);
    }
    case "library_stats":
      return {
        files: files.filter((f) => f.course_id == null).length,
        notes: notes.length,
        bytes: files.filter((f) => f.course_id == null).reduce((n, f) => n + (f.size || 0), 0),
      };
    case "recent_files":
      return files
        .slice()
        .sort((a, b) => b.added_at.localeCompare(a.added_at))
        .slice(0, num(args, "limit") ?? 8);
    case "global_search":
      return search(str(args, "query"));
    case "create_file_bytes": {
      const headers = (args?.headers ?? {}) as Record<string, string>;
      const name = decodeURIComponent(headers["x-eu-name"] ?? "export");
      const course = headers["x-eu-course-id"] ? Number(headers["x-eu-course-id"]) : null;
      const f: FileItem = {
        id: newId(),
        course_id: course,
        name,
        rel_path: `documents/${name}`,
        kind: name.endsWith(".pdf") ? "pdf" : name.endsWith(".png") ? "image" : "file",
        size: Number(args?.size ?? 0),
        added_at: sqlUtc(new Date()),
      };
      files.push(f);
      return f;
    }
    case "write_file_bytes": {
      const headers = (args?.headers ?? {}) as Record<string, string>;
      const f = files.find((x) => x.id === Number(headers["x-eu-file-id"]));
      if (!f) return null;
      // As the backend does: what the file was becomes a version.
      const list = fileVersions.get(f.id) ?? [];
      const id = newId();
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}00`;
      list.push({
        id,
        version: list.length + 1,
        timestamp: list.length ? stamp : "original",
        label: "",
        created_at: sqlUtc(now),
        size: f.size,
      });
      fileVersions.set(f.id, list);
      versionUrls.set(id, devFileUrl("file", f.id));
      const data = args?.bytes as Uint8Array | ArrayBuffer | undefined;
      if (data)
        fileUrls.set(f.id, URL.createObjectURL(new Blob([data as BlobPart], { type: "application/pdf" })));
      Object.assign(f, { size: Number(args?.size ?? f.size), added_at: sqlUtc(now) });
      return f;
    }
    case "attach_files_to_course": {
      const course = num(args, "courseId");
      const ids = (args?.fileIds as number[]) ?? [];
      return files
        .filter((f) => ids.includes(f.id))
        .map((f) => {
          const copy = { ...f, id: newId(), course_id: course, added_at: sqlUtc(new Date()) };
          files.push(copy);
          return copy;
        });
    }
    case "list_openers":
      return [
        { name: "Application par défaut", is_reveal: false },
        { name: "Afficher dans le dossier", is_reveal: true },
      ];

    // Reminders
    case "list_reminders":
      return reminders.slice();
    case "create_reminder": {
      const r: Reminder = {
        id: newId(),
        title: str(args, "title"),
        due_at: (args?.dueAt as string | null) ?? null,
        done: false,
        created_at: sqlUtc(new Date()),
        course_id: num(args, "courseId"),
        repeat_rule: (args?.repeatRule as Reminder["repeat_rule"]) ?? "none",
      };
      reminders.push(r);
      return r;
    }
    case "update_reminder": {
      const r = reminders.find((x) => x.id === num(args, "id"));
      if (r) {
        r.title = str(args, "title");
        r.due_at = (args?.dueAt as string | null) ?? null;
      }
      return r ? { ...r } : null;
    }
    case "toggle_reminder": {
      const r = reminders.find((x) => x.id === num(args, "id"));
      if (r) r.done = Boolean(args?.done);
      return null;
    }
    case "delete_reminder": {
      const i = reminders.findIndex((x) => x.id === num(args, "id"));
      if (i >= 0) reminders.splice(i, 1);
      return null;
    }

    // Links
    case "list_links":
      return links.slice();
    case "create_link": {
      const l: QuickLink = { id: newId(), label: str(args, "label"), url: str(args, "url"), icon: "" };
      links.push(l);
      return l;
    }
    case "delete_link": {
      const i = links.findIndex((x) => x.id === num(args, "id"));
      if (i >= 0) links.splice(i, 1);
      return null;
    }

    // Schedule
    case "list_schedule":
      return schedule.slice();
    case "get_today_classes": {
      const day = isoDay(new Date());
      return schedule
        .filter((s) => s.day_of_week === day)
        .sort((a, b) => a.start_time.localeCompare(b.start_time));
    }

    // Recap
    case "get_recap":
      return empty
        ? {
            ...recap,
            files_opened: 0,
            notes_written: 0,
            demos_run: 0,
            reminders_done: 0,
            active_minutes: 0,
            top_courses: [],
            top_documents: [],
            top_tools: [],
            time_by_area: [],
          }
        : recap;

    // Pronote
    case "pronote_status":
      return { ...pronote };

    // Python
    case "list_python_demos":
      return pythonDemos.slice();
    case "python_run":
      return mockRun(args);
    case "python_input":
      mockAnswer?.(String(args?.text ?? ""));
      return null;
    case "python_stop":
    case "python_prewarm":
      return null;
    case "python_complete":
      return [];

    // Whiteboards & versions
    case "read_board":
      return boards.get(num(args, "id") ?? 0) ?? "{}";
    case "save_board": {
      const save = (args?.save ?? {}) as {
        file_id?: number | null;
        course_id?: number | null;
        name?: string;
        json: string;
      };
      let f = save.file_id ? files.find((x) => x.id === save.file_id) : undefined;
      if (!f) {
        f = {
          id: newId(),
          course_id: save.course_id ?? null,
          name: `${save.name || "Tableau"}.euboard`,
          rel_path: "whiteboards/tableau.euboard",
          kind: "board",
          size: save.json.length,
          added_at: sqlUtc(new Date()),
        } as FileItem;
        files.push(f);
      }
      boards.set(f.id, save.json);
      return { ...f };
    }
    case "get_file_versions":
      return (fileVersions.get(num(args, "fileId") ?? 0) ?? []).slice();
    case "read_annotations":
      return null;

    default:
      if (/^(list_|get_)/.test(cmd)) return [];
      return null;
  }
}

/**
 * Browser mode cannot run Python: a run prints the string literals of the
 * script's print() calls and asks its input() prompts, enough to show the
 * console at work.
 */
let mockAnswer: ((text: string) => void) | null = null;
let mockRunId = 0;

function mockRun(args?: Record<string, unknown>): number {
  type Ev = import("../lib/api").RunEvent;
  const send = args?.onEvent as (events: Ev[]) => void;
  const code = String(args?.code ?? "");
  const id = ++mockRunId;
  void (async () => {
    for (const line of code.split("\n")) {
      const asked = /input\(\s*["'](.*?)["']/.exec(line);
      if (asked) {
        send([{ t: "input", prompt: asked[1] }]);
        await new Promise<string>((resolve) => (mockAnswer = resolve));
        mockAnswer = null;
        continue;
      }
      const printed = /^\s*print\(\s*["'](.*?)["']/.exec(line);
      if (printed) send([{ t: "out", s: `${printed[1]}\n` }]);
    }
    if (code.includes("turtle")) send([{ t: "turtle", ops: mockSquare() }]);
    send([{ t: "done", ok: true, code: 0 }]);
  })();
  return id;
}

/** What `turtle` would send for a filled square, a circle and a label. */
function mockSquare() {
  type Op = import("../lib/api").TurtleOp;
  const ops: Op[] = [{ op: "turtle", id: 1, x: 0, y: 0, heading: 0, visible: true }];
  let [x, y, heading] = [-80, -80, 0];
  ops.push({ op: "move", id: 1, to: [x, y], speed: 6 });
  const points: [number, number][] = [[x, y]];
  for (let i = 0; i < 4; i++) {
    const rad = (heading * Math.PI) / 180;
    const to: [number, number] = [x + 160 * Math.cos(rad), y + 160 * Math.sin(rad)];
    ops.push({ op: "line", id: 1, from: [x, y], to, color: "#0f4fa8", width: 3, speed: 6 });
    [x, y] = to;
    points.push(to);
    heading += 90;
    ops.push({ op: "heading", id: 1, heading });
  }
  ops.push({ op: "fill", id: 1, points, color: "rgb(234,240,251)" });
  ops.push({ op: "dot", at: [0, 0], size: 20, color: "#a4262c" });
  ops.push({
    op: "text",
    at: [-80, 100],
    text: "Carré",
    align: "left",
    font: ["Arial", 16, "bold"],
    color: "#111213",
  });
  return ops;
}

/*
 * Files in browser mode: PDFs show a sample course (fixtures/cours.pdf),
 * images a drawn picture; a saved file keeps its new bytes in memory and
 * its old ones as a version.
 */
const fileUrls = new Map<number, string>();
const versionUrls = new Map<number, string>();
const fileVersions = new Map<number, import("../lib/api").FileVersion[]>();

function devFileUrl(kind: "file" | "version" | "thumb", id: number): string {
  if (kind === "version") return versionUrls.get(id) ?? samplePdf;
  // No previews in browser mode: the grid shows the type's icon.
  if (kind === "thumb") return "";
  const saved = fileUrls.get(id);
  if (saved) return saved;
  const f = files.find((x) => x.id === id);
  if (f && /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f.name)) return sampleImage;
  return samplePdf;
}

const sampleImage = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#2f4f3f"/>' +
    '<text x="60" y="120" font-family="serif" font-size="48" fill="#f2f0e6">f(x) = x²</text>' +
    '<path d="M60 420 Q 400 -120 740 420" stroke="#f2f0e6" stroke-width="4" fill="none"/></svg>',
)}`;

serveDevFiles(devFileUrl);
