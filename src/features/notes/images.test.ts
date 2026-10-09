import { describe, expect, it } from "vitest";
import {
  asBlock,
  fileStem,
  imageExtension,
  imageMarkdown,
  imageSize,
  isImageName,
  libraryFileId,
  libraryImageUrl,
} from "./images";

describe("pictures in a note", () => {
  it("name a library file the same way on every system", () => {
    expect(libraryImageUrl(42)).toBe("eufile://file/42");
    expect(libraryFileId("eufile://file/42")).toBe(42);
    expect(libraryFileId("eufile://localhost/file/42")).toBeNull();
    expect(libraryFileId("https://example.org/file/42")).toBeNull();
    expect(libraryFileId("eufile://file/42/../1")).toBeNull();
  });

  it("are written with their caption escaped", () => {
    expect(imageMarkdown(7)).toBe("![](eufile://file/7)");
    expect(imageMarkdown(7, "Figure [1] \\ a")).toBe("![Figure \\[1\\] \\\\ a](eufile://file/7)");
  });

  it("take a width after a bar", () => {
    expect(imageSize("Parabole")).toEqual({ text: "Parabole" });
    expect(imageSize("Parabole|300")).toEqual({ text: "Parabole", width: "300px" });
    expect(imageSize("Parabole | 50 %")).toEqual({ text: "Parabole", width: "50%" });
    expect(imageSize("|150%")).toEqual({ text: "", width: "100%" });
    expect(imageSize("a|0")).toEqual({ text: "a|0" });
    expect(imageSize("x | y")).toEqual({ text: "x | y" });
  });

  it("are told apart by their name and type", () => {
    expect(isImageName("Figure.PNG")).toBe(true);
    expect(isImageName("cours.pdf")).toBe(false);
    expect(imageExtension("image/jpeg")).toBe("jpg");
    expect(imageExtension("image/svg+xml")).toBe("svg");
    expect(imageExtension("image/x-icon")).toBe("png");
  });

  it("are named after the note, without what Windows refuses", () => {
    expect(fileStem("Chapitre 3 : fonctions / dérivées")).toBe("Chapitre 3 - fonctions - dérivées");
    expect(fileStem("  ..  ")).toBe("Note");
    expect(fileStem("Fin.")).toBe("Fin");
  });

  it("stand as a block of their own", () => {
    expect(asBlock("", "X", "")).toBe("X");
    expect(asBlock("Texte", "X", "suite")).toBe("\n\nX\n\n");
    expect(asBlock("Texte\n", "X", "\nsuite")).toBe("\nX\n");
    expect(asBlock("Texte\n\n", "X", "\n\nsuite")).toBe("X");
  });
});
