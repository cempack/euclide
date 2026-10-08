import { frenchSpaces } from "../../lib/errors";

/**
 * Script templates: the built-in catalogue (templates/<level>/*.py), level
 * by level and theme by theme, from a first print() to Maths expertes and
 * NSI Terminale, plus the teacher's own (any script kept as a template, in
 * the `python_templates` setting).
 *
 * Each file opens with its card in the gallery, which the new script leaves
 * out:
 *
 *   # Modèle : Encadrer √2 par balayage
 *   # Résumé : Avancer par pas de 0,1, puis 0,01… jusqu'à 10⁻⁶.
 *   # Script : encadrer racine de 2      (the new script's name, if not the model's)
 *
 * Every one runs as it is and its examples (`>>>`) pass « Vérifier »,
 * except the exercises' (sidecar/tests/test_templates.py runs them all).
 */
export interface ScriptTemplate {
  /** "<level>/<file>" for a built-in one, "mine/<name>" for the teacher's. */
  id: string;
  /** What the gallery calls it, and the new script's name. */
  name: string;
  /** One line under the name. */
  hint: string;
  level: LevelId;
  /** The section of its level; empty for the teacher's own. */
  theme: string;
  code: string;
  /** The new script's name, when not the template's. */
  scriptName?: string;
}

export type LevelId =
  | "bases"
  | "seconde"
  | "premiere"
  | "terminale"
  | "maths-expertes"
  | "nsi-premiere"
  | "nsi-terminale"
  | "dessins"
  | "mine";

export interface Level {
  id: LevelId;
  label: string;
  /** Its sections, in teaching order, each listing its files in order. */
  themes: { label: string; files: string[] }[];
}

/** The catalogue's order: each level's themes, each theme's files. */
export const LEVELS: Level[] = [
  {
    id: "bases",
    label: "Pour commencer",
    themes: [
      { label: "Premiers pas", files: ["script-vide", "variables-et-types", "saisie-et-calcul"] },
      { label: "Conditions et boucles", files: ["si-sinon", "boucle-for", "boucle-while"] },
      { label: "Fonctions", files: ["fonctions", "hasard"] },
      { label: "Exercices à vérifier", files: ["fonction-a-completer", "fiche-d-exercices"] },
    ],
  },
  {
    id: "seconde",
    label: "Seconde",
    themes: [
      {
        label: "Nombres et calculs",
        files: [
          "multiples-et-diviseurs",
          "plus-grand-multiple",
          "encadrer-racine-de-2",
          "puissance-et-seuil",
          "fractions-irreductibles",
        ],
      },
      {
        label: "Géométrie",
        files: ["milieu-et-distance", "points-alignes", "equation-de-droite", "tracer-un-triangle"],
      },
      {
        label: "Fonctions",
        files: ["tableau-de-valeurs", "courbe", "maximum-par-balayage", "longueur-d-une-courbe"],
      },
      { label: "Statistiques", files: ["indicateurs", "filtrer-et-ou-non", "tableau-croise"] },
      {
        label: "Probabilités et échantillonnage",
        files: ["lancers-de-de", "loi-des-grands-nombres", "fluctuation"],
      },
    ],
  },
  {
    id: "premiere",
    label: "Première",
    themes: [
      { label: "Listes", files: ["creer-une-liste", "parcourir-une-liste"] },
      {
        label: "Suites",
        files: [
          "suite-et-seuil",
          "termes-et-somme",
          "representer-une-suite",
          "escalier-d-une-suite",
          "factorielle",
          "syracuse",
          "fibonacci",
          "remboursement-d-emprunt",
          "sommes-de-carres",
        ],
      },
      { label: "Dérivation", files: ["pentes-des-secantes", "tracer-une-tangente", "methode-de-newton"] },
      {
        label: "Exponentielle et trigonométrie",
        files: ["exponentielle-par-euler", "approcher-e", "pi-par-archimede", "sinus-et-cosinus"],
      },
      {
        label: "Probabilités et statistiques",
        files: [
          "pi-par-monte-carlo",
          "aire-sous-une-parabole",
          "marche-aleatoire",
          "esperance-et-variance",
          "frequence-des-lettres",
          "moyennes-d-echantillons",
        ],
      },
    ],
  },
  {
    id: "terminale",
    label: "Terminale",
    themes: [
      { label: "Combinatoire", files: ["triangle-de-pascal", "permutations", "parties-a-k-elements"] },
      { label: "Suites et limites", files: ["methode-de-heron", "approcher-pi-e-ln2-phi"] },
      { label: "Fonctions", files: ["dichotomie", "methode-de-la-secante", "algorithme-de-briggs"] },
      { label: "Équations différentielles", files: ["euler-y-prime-egal-f", "euler-y-prime-ay-plus-b"] },
      {
        label: "Intégration",
        files: ["rectangles-milieux-trapezes", "integrale-par-monte-carlo", "algorithme-de-brouncker"],
      },
      {
        label: "Probabilités",
        files: [
          "loi-binomiale",
          "planche-de-galton",
          "surreservation",
          "bienayme-tchebychev",
          "ecart-type-des-moyennes",
        ],
      },
    ],
  },
  {
    id: "maths-expertes",
    label: "Maths expertes",
    themes: [
      {
        label: "Arithmétique",
        files: [
          "euclide-et-bezout",
          "crible-d-eratosthene",
          "facteurs-premiers",
          "fermat-et-carmichael",
          "mersenne-et-fermat",
          "restes-chinois",
          "triplets-pythagoriciens",
          "racines-rationnelles",
        ],
      },
      {
        label: "Codage et chiffrement",
        files: [
          "cles-de-controle",
          "chiffrement-affine",
          "chiffre-de-vigenere",
          "chiffrement-de-hill",
          "rsa",
          "code-de-hamming",
        ],
      },
      {
        label: "Nombres complexes",
        files: [
          "complexes-en-python",
          "second-degre-complexe",
          "racines-n-iemes-de-l-unite",
          "suite-complexe",
          "ensemble-de-mandelbrot",
        ],
      },
      {
        label: "Matrices et graphes",
        files: [
          "calcul-matriciel",
          "chemins-dans-un-graphe",
          "graphe-eulerien",
          "chaine-de-markov",
          "marche-sur-un-graphe",
          "modele-d-ehrenfest",
          "proies-et-predateurs",
          "pagerank",
        ],
      },
    ],
  },
  {
    id: "nsi-premiere",
    label: "NSI Première",
    themes: [
      {
        label: "Représentation des données",
        files: [
          "binaire-et-hexadecimal",
          "complement-a-deux",
          "nombres-flottants",
          "encodage-du-texte",
          "tables-de-verite",
        ],
      },
      { label: "Types construits", files: ["p-uplets", "tableaux-a-deux-dimensions", "dictionnaire"] },
      { label: "Données en table", files: ["lire-un-csv", "selectionner-et-trier", "fusionner-deux-tables"] },
      {
        label: "Algorithmes",
        files: [
          "parcours-sequentiel",
          "tri-par-selection",
          "tri-insertion",
          "recherche-dichotomique",
          "k-plus-proches-voisins",
          "rendu-de-monnaie",
          "sac-a-dos",
          "cout-d-un-algorithme",
        ],
      },
    ],
  },
  {
    id: "nsi-terminale",
    label: "NSI Terminale",
    themes: [
      { label: "Programmation objet", files: ["classe-point", "classe-fraction"] },
      { label: "Structures linéaires", files: ["pile", "file", "liste-chainee", "parentheses"] },
      {
        label: "Arbres et graphes",
        files: ["arbre-binaire", "arbre-binaire-de-recherche", "parcours-de-graphe", "chemin-et-cycle"],
      },
      {
        label: "Algorithmique",
        files: [
          "recursivite",
          "tours-de-hanoi",
          "tri-fusion",
          "programmation-dynamique",
          "recherche-textuelle",
        ],
      },
    ],
  },
  {
    id: "dessins",
    label: "Dessins et graphiques",
    themes: [
      {
        label: "Turtle",
        files: ["polygones", "rosace", "spirale", "damier", "flocon-de-koch", "arbre-fractal"],
      },
      {
        label: "Graphiques",
        files: [
          "plusieurs-courbes",
          "nuage-de-points",
          "diagramme-en-barres",
          "histogramme",
          "courbe-parametree",
        ],
      },
    ],
  },
  { id: "mine", label: "Mes modèles", themes: [] },
];

/** The scripts themselves, real files a test runs. */
const FILES = import.meta.glob<string>("./templates/*/*.py", {
  query: "?raw",
  import: "default",
  eager: true,
});

const HEADER = /^# (Modèle|Résumé|Script) : (.*)\n/;

/** A template file's card (its header lines) and the script without them. */
export function readTemplate(source: string): {
  name: string;
  hint: string;
  scriptName?: string;
  code: string;
} {
  let rest = source.replace(/\r\n/g, "\n");
  const meta: Record<string, string> = {};
  for (let m = HEADER.exec(rest); m; m = HEADER.exec(rest)) {
    meta[m[1]] = m[2].trim();
    rest = rest.slice(m[0].length);
  }
  return {
    name: frenchSpaces(meta["Modèle"] ?? ""),
    hint: frenchSpaces(meta["Résumé"] ?? ""),
    scriptName: meta["Script"],
    code: rest.replace(/^\n/, ""),
  };
}

export const BUILT_IN: ScriptTemplate[] = LEVELS.flatMap((level) =>
  level.themes.flatMap((theme) =>
    theme.files.flatMap((file) => {
      const source = FILES[`./templates/${level.id}/${file}.py`];
      if (source === undefined) return [];
      return [{ id: `${level.id}/${file}`, level: level.id, theme: theme.label, ...readTemplate(source) }];
    }),
  ),
);

/** Template files no level lists (a test keeps this empty). */
export const UNLISTED = Object.keys(FILES).filter(
  (path) => !BUILT_IN.some((t) => path === `./templates/${t.id}.py`),
);

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
        id: `mine/${t.name.trim()}`,
        name: t.name.trim(),
        hint: typeof t.hint === "string" ? t.hint : "",
        level: "mine" as const,
        theme: "",
        code: t.code,
      }));
  } catch {
    return [];
  }
}

/** Lower case, without accents: « Équation » finds « equation ». */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/**
 * The templates matching every word of `query`: those whose card or theme
 * says so first, then those whose code does (« randint », « while »).
 */
export function searchTemplates(all: ScriptTemplate[], query: string): ScriptTemplate[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const label = (id: LevelId) => LEVELS.find((l) => l.id === id)?.label ?? "";
  const card = all.filter((t) => {
    const text = fold(`${t.name} ${t.hint} ${t.theme} ${label(t.level)}`);
    return words.every((w) => text.includes(w));
  });
  const code = all.filter((t) => !card.includes(t) && words.every((w) => fold(t.code).includes(w)));
  return [...card, ...code];
}
