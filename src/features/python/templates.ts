/**
 * Script templates: fourteen built in (templates/*.py), from the first
 * `input()` to a class in NSI, plus the teacher's own (any script saved as
 * a template, kept in the `python_templates` setting). Each one runs as it
 * is; the exercise and the NSI ones carry examples (`>>>`) that
 * « Vérifier » checks.
 */
export interface ScriptTemplate {
  /** What the gallery calls it, and the new script's name. */
  name: string;
  /** One line under the name. */
  hint: string;
  group: TemplateGroup;
  code: string;
  /** The new script's name, when not the template's. */
  scriptName?: string;
}

/** The scripts themselves, real files a test runs (sidecar/tests/test_templates.py). */
const FILES = import.meta.glob<string>("./templates/*.py", { query: "?raw", import: "default", eager: true });
const file = (name: string) => FILES[`./templates/${name}.py`] ?? "";

export type TemplateGroup = "start" | "maths" | "drawing" | "exercise" | "nsi" | "mine";

export const GROUPS: { id: TemplateGroup; label: string }[] = [
  { id: "start", label: "Pour commencer" },
  { id: "maths", label: "Maths" },
  { id: "drawing", label: "Dessin" },
  { id: "exercise", label: "Exercices" },
  { id: "nsi", label: "NSI" },
  { id: "mine", label: "Mes modèles" },
];

export const BUILT_IN: ScriptTemplate[] = [
  {
    name: "Script vide",
    hint: "Une page blanche, un print.",
    group: "start",
    code: file("script-vide"),
    scriptName: "nouveau script",
  },
  {
    name: "Saisie et calcul",
    hint: "input(), une conversion, un résultat mis en forme.",
    group: "start",
    code: file("saisie-et-calcul"),
  },
  {
    name: "Tableau de valeurs",
    hint: "Une fonction et ses images, ligne par ligne.",
    group: "maths",
    code: file("tableau-de-valeurs"),
  },
  {
    name: "Courbe d'une fonction",
    hint: "matplotlib : la courbe, les axes, une légende.",
    group: "maths",
    code: file("courbe"),
  },
  {
    name: "Suite et seuil",
    hint: "Une suite récurrente et le rang où elle passe un seuil.",
    group: "maths",
    code: file("suite-et-seuil"),
  },
  {
    name: "Dichotomie",
    hint: "Encadrer une solution de f(x) = 0, à la précision voulue.",
    group: "maths",
    code: file("dichotomie"),
  },
  {
    name: "Lancers de dé",
    hint: "Simuler, compter les fréquences, tracer un diagramme.",
    group: "maths",
    code: file("lancers-de-de"),
  },
  {
    name: "Polygones à la tortue",
    hint: "Une fonction, une boucle, et la tortue dessine.",
    group: "drawing",
    code: file("polygones"),
  },
  {
    name: "Rosace",
    hint: "Des cercles qui tournent, trois couleurs.",
    group: "drawing",
    code: file("rosace"),
  },
  {
    name: "Fonction à compléter",
    hint: "Les exemples disent quoi renvoyer ; « Vérifier » corrige.",
    group: "exercise",
    code: file("fonction-a-completer"),
  },
  {
    name: "Tri par insertion",
    hint: "Le tri du programme, vérifié par ses exemples.",
    group: "nsi",
    code: file("tri-insertion"),
  },
  {
    name: "Récursivité",
    hint: "Une fonction qui s'appelle sur un cas plus petit.",
    group: "nsi",
    code: file("recursivite"),
  },
  {
    name: "Pile (classe)",
    hint: "Une classe, ses attributs, ses méthodes.",
    group: "nsi",
    code: file("pile"),
  },
  { name: "Dictionnaire", hint: "Compter les lettres d'un texte.", group: "nsi", code: file("dictionnaire") },
];

/** The teacher's templates from the setting; anything malformed is skipped. */
export function parseTemplates(raw: string | null | undefined): ScriptTemplate[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter(
        (t): t is { name: string; code: string; hint?: unknown } =>
          !!t && typeof t.name === "string" && !!t.name.trim() && typeof t.code === "string",
      )
      .map((t) => ({
        name: t.name.trim(),
        hint: typeof t.hint === "string" ? t.hint : "",
        group: "mine" as const,
        code: t.code,
      }));
  } catch {
    return [];
  }
}
