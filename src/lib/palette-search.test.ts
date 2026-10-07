import { describe, expect, it } from "vitest";
import { aliasesOf, rankPaletteItems } from "./palette-search";

const items = [
  { id: "board", label: "Tableau blanc", hint: "Ctrl B", aliases: ["dessin", "whiteboard"] },
  { id: "note", label: "Nouvelle note", hint: "Ctrl N", aliases: ["notes", "écrire"] },
  { id: "settings", label: "Réglages", aliases: ["paramètres", "settings"] },
  { id: "python", label: "Python", aliases: ["code", "script"] },
];

describe("rankPaletteItems", () => {
  it("does not rank the whiteboard first for « note »", () => {
    expect(rankPaletteItems(items, "note")[0].id).toBe("note");
  });

  it("ignores accents and finds aliases", () => {
    expect(rankPaletteItems(items, "reglages")[0].id).toBe("settings");
    expect(rankPaletteItems(items, "parametres")[0].id).toBe("settings");
  });

  it("filters by prefix for a single letter and keeps everything for an empty query", () => {
    expect(rankPaletteItems(items, "p").map((i) => i.id)).toEqual(["settings", "python"]);
    expect(rankPaletteItems(items, "  ")).toHaveLength(items.length);
  });
});

describe("aliasesOf", () => {
  it("splits on spaces and punctuation", () => {
    expect(aliasesOf("a, b;c / d|e")).toEqual(["a", "b", "c", "d", "e"]);
  });
});
