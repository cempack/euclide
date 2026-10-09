/**
 * Chance in class: drawing a name, making groups, a die, a number, heads or
 * tails. Fair to every student: the draws come from crypto.getRandomValues,
 * and a draw that would favour the first values (the remainder of a
 * division) is made again.
 */

/** A whole number in [0, n). Tests pass a seeded one. */
export type Below = (n: number) => number;

const RANGE = 0x1_0000_0000;

export const below: Below = (n) => {
  if (!Number.isInteger(n) || n < 1 || n > RANGE) throw new RangeError(`below(${n})`);
  // The largest multiple of n under 2³²: what lies above it is drawn again.
  const limit = RANGE - (RANGE % n);
  const word = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(word);
    if (word[0] < limit) return word[0] % n;
  }
};

/** The next name: one not drawn yet, or null once every name was. */
export function drawName(
  names: readonly string[],
  drawn: readonly string[],
  rand: Below = below,
): string | null {
  const done = new Set(drawn);
  const left = names.filter((n) => !done.has(n));
  return left.length ? left[rand(left.length)] : null;
}

/** A shuffled copy, every order equally likely (Fisher–Yates). */
export function shuffle<T>(items: readonly T[], rand: Below = below): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type GroupsBy = { size: number } | { count: number };

/**
 * Groups at random, their sizes one apart at most. « Par 2 » makes groups
 * of at least two: 25 students give 11 pairs and a trio, nobody alone.
 */
export function makeGroups(names: readonly string[], by: GroupsBy, rand: Below = below): string[][] {
  const n = names.length;
  if (!n) return [];
  const wanted = "size" in by ? Math.floor(n / Math.max(1, by.size)) : by.count;
  const count = Math.min(n, Math.max(1, Math.floor(wanted)));
  const groups: string[][] = Array.from({ length: count }, () => []);
  shuffle(names, rand).forEach((name, i) => groups[i % count].push(name));
  return groups;
}

/** A die with `faces` faces: 1 to faces. */
export function rollDie(faces = 6, rand: Below = below): number {
  return 1 + rand(Math.max(2, Math.floor(faces)));
}

/** A whole number between `a` and `b`, both included, in either order. */
export function randomInt(a: number, b: number, rand: Below = below): number {
  const lo = Math.ceil(Math.min(a, b));
  const hi = Math.floor(Math.max(a, b));
  if (hi < lo) throw new RangeError(`randomInt(${a}, ${b})`);
  return lo + rand(Math.min(RANGE, hi - lo + 1));
}

export type Side = "pile" | "face";

export function coin(rand: Below = below): Side {
  return rand(2) === 0 ? "pile" : "face";
}

/**
 * The names of a pasted list: one per line, « 1. Dupont Léa » or « - Léa »
 * as well, without blank lines or names given twice.
 */
export function parseNames(text: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const name = line
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    const key = name.toLocaleLowerCase("fr-FR");
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}
