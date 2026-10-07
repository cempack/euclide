import { describe, expect, it } from "vitest";
import { isTitleSlide, splitSlides } from "./slides";

describe("splitSlides", () => {
  it("cuts at lines holding only ---", () => {
    expect(splitSlides("# Fonctions\n\n---\n\n## Définition\nTexte\n---\nFin")).toEqual([
      "# Fonctions",
      "## Définition\nTexte",
      "Fin",
    ]);
  });

  it("leaves code blocks whole", () => {
    const md = "```python\nx = 1\n---\ny = 2\n```\n---\nSuite";
    expect(splitSlides(md)).toEqual(["```python\nx = 1\n---\ny = 2\n```", "Suite"]);
  });

  it("drops empty slides and keeps a note without separators as one slide", () => {
    expect(splitSlides("---\n\n---\nUn")).toEqual(["Un"]);
    expect(splitSlides("Une seule diapositive")).toEqual(["Une seule diapositive"]);
  });
});

describe("isTitleSlide", () => {
  it("is a top heading, with at most one line under it", () => {
    expect(isTitleSlide("# Chapitre 3")).toBe(true);
    expect(isTitleSlide("# Chapitre 3\nFonctions de référence")).toBe(true);
    expect(isTitleSlide("# Chapitre 3\n\nUn\nDeux")).toBe(false);
    expect(isTitleSlide("## Définition")).toBe(false);
  });
});
