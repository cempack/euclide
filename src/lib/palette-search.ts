import Fuse from "fuse.js";

/** Anything the command palette can rank (commands, courses, links). */
export type PaletteSearchItem = {
  id: string;
  label: string;
  hint?: string;
  /** Extra terms: "settings" / "paramètres" → Réglages. */
  aliases?: string[];
};

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Rank palette rows with Fuse.js (fuzzy, accent-insensitive, alias-aware).
 * "settings" or "parametres" hits a command whose aliases include those words.
 */
export function rankPaletteItems<T extends PaletteSearchItem>(items: T[], query: string): T[] {
  const q = query.trim();
  if (!q) return items;
  if (q.length === 1) {
    const n = fold(q);
    return items.filter((item) => {
      if (fold(item.label).startsWith(n)) return true;
      if (item.hint && fold(item.hint).startsWith(n)) return true;
      return (item.aliases ?? []).some((a) => fold(a).startsWith(n));
    });
  }

  const fuse = new Fuse(items, {
    keys: [
      { name: "label", weight: 2 },
      { name: "hint", weight: 0.5 },
      { name: "aliases", weight: 1.6 },
    ],
    ignoreLocation: true,
    ignoreDiacritics: true,
    ignoreFieldNorm: true,
    threshold: q.length < 3 ? 0.28 : 0.4,
    minMatchCharLength: 2,
    includeScore: true,
    shouldSort: true,
  });
  return fuse.search(q).map((r) => r.item);
}

export function aliasesOf(raw: string): string[] {
  return raw
    .split(/[\s,;/|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
