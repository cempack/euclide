/**
 * Note templates: five built in, plus the teacher's own (any note saved as
 * a template, kept in the `note_templates` setting). `{{cours}}`,
 * `{{classe}}` and `{{date}}` are filled in when a template is used; « … »
 * marks where to type, and the first one is selected.
 */
export interface NoteTemplate {
  name: string;
  /** The note's title; it may hold placeholders too. */
  title: string;
  body: string;
}

export interface TemplateContext {
  cours: string;
  classe: string;
  date: string;
}

export const BUILT_IN: NoteTemplate[] = [
  {
    name: "Cours",
    title: "Cours — {{cours}}",
    body: `# …

*{{cours}} · {{classe}} · {{date}}*

## Objectifs

- …

## 1. Définition

> **Définition.** …

## 2. Propriétés

> **Propriété.** …

**Démonstration.** …

## 3. Exemples

**Exemple.** …

## À retenir

- …
`,
  },
  {
    name: "Exercices",
    title: "Exercices — {{cours}}",
    body: `# Exercices : …

*{{classe}} · {{date}}*

## Exercice 1

…

## Exercice 2

…

## Exercice 3 — pour aller plus loin

…
`,
  },
  {
    name: "Évaluation",
    title: "Évaluation — {{cours}}",
    body: `# Évaluation : …

*{{classe}} · {{date}} · Durée : 55 min · Calculatrice autorisée*

## Exercice 1 (… points)

…

## Exercice 2 (… points)

…

## Exercice 3 (… points)

…

*Le soin et la rédaction sont pris en compte dans la notation.*
`,
  },
  {
    name: "Fiche méthode",
    title: "Méthode — {{cours}}",
    body: `# Méthode : …

*{{cours}} · {{classe}}*

## Quand l'utiliser ?

…

## Les étapes

1. …
2. …
3. …

## Exemple rédigé

…

## Pièges à éviter

- …
`,
  },
  {
    name: "Activité",
    title: "Activité — {{cours}}",
    body: `# Activité : …

*{{classe}} · {{date}}*

## Objectif

…

## Partie A — Découverte

1. …

## Partie B — Pour aller plus loin

1. …

## Bilan

…
`,
  },
];

const PLACEHOLDER = /\{\{\s*(cours|classe|date)\s*\}\}/gi;
const HAS_PLACEHOLDER = /\{\{\s*(cours|classe|date)\s*\}\}/i;
/** Emphasis around a whole line (`*…*`, `**…**`, `_…_`). */
const WRAPPED = /^(\s*)(\*{1,2}|_)(.*)\2(\s*)$/;

/**
 * Fills one line. A line of « a · b · c » loses the parts that came out
 * empty (no course yet), and a title its dangling dash, so a note without
 * a course does not start with « Cours —  » or « * · mardi* ».
 */
function fillLine(line: string, ctx: TemplateContext): string | null {
  if (!HAS_PLACEHOLDER.test(line)) return line;
  let out = line.replace(PLACEHOLDER, (_, key: string) => ctx[key.toLowerCase() as keyof TemplateContext]);
  const wrapped = WRAPPED.exec(out);
  const [lead, mark, inner, trail] = wrapped ? wrapped.slice(1) : ["", "", out, ""];
  let text = inner
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" · ");
  text = text.replace(/\s+[—–-]\s*$/, "").replace(/^(#+\s+)?[—–-]\s+/, "$1");
  if (!text.replace(/^#+\s*/, "")) return null;
  out = mark ? `${lead}${mark}${text}${mark}${trail}` : text;
  return out;
}

/** The template with its placeholders filled; lines left empty go. */
export function fillTemplate(t: NoteTemplate, ctx: TemplateContext): { title: string; body: string } {
  const lines = t.body.split("\n").map((line) => fillLine(line, ctx));
  // A dropped line takes one blank neighbour with it, not the spacing.
  const body: string[] = [];
  lines.forEach((line, i) => {
    if (line != null) {
      if (line === "" && i > 0 && lines[i - 1] === null && body[body.length - 1] === "") return;
      body.push(line);
    }
  });
  return { title: fillLine(t.title, ctx) ?? t.name, body: body.join("\n") };
}

/** The teacher's templates, from the setting (bad JSON reads as none). */
export function parseTemplates(raw: string | null | undefined): NoteTemplate[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (t): t is NoteTemplate =>
        !!t && typeof t.name === "string" && typeof t.title === "string" && typeof t.body === "string",
    );
  } catch {
    return [];
  }
}
