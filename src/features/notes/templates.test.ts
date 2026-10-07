import { describe, expect, it } from "vitest";
import { BUILT_IN, fillTemplate, parseTemplates } from "./templates";

const full = { cours: "Mathématiques", classe: "2NDE 7", date: "mardi 7 octobre 2026" };
const none = { cours: "", classe: "", date: "mardi 7 octobre 2026" };
const byName = (name: string) => BUILT_IN.find((t) => t.name === name)!;

describe("fillTemplate", () => {
  it("fills the placeholders", () => {
    const { title, body } = fillTemplate(byName("Cours"), full);
    expect(title).toBe("Cours — Mathématiques");
    expect(body).toContain("*Mathématiques · 2NDE 7 · mardi 7 octobre 2026*");
    expect(body).not.toContain("{{");
  });

  it("drops what a note without a course leaves empty", () => {
    const cours = fillTemplate(byName("Cours"), none);
    expect(cours.title).toBe("Cours");
    expect(cours.body).toContain("\n*mardi 7 octobre 2026*\n");
    const methode = fillTemplate(byName("Fiche méthode"), none);
    expect(methode.body.startsWith("# Méthode : …\n\n## Quand l'utiliser ?")).toBe(true);
  });

  it("leaves lines without placeholders as they are", () => {
    const t = { name: "x", title: "T", body: "a · b\n\n{{ date }} · fin" };
    expect(fillTemplate(t, none).body).toBe("a · b\n\nmardi 7 octobre 2026 · fin");
  });
});

describe("parseTemplates", () => {
  it("reads the setting and ignores what is not a template", () => {
    expect(parseTemplates(null)).toEqual([]);
    expect(parseTemplates("pas du json")).toEqual([]);
    expect(parseTemplates('[{"name":"TP","title":"TP","body":"# TP"},{"name":3}]')).toEqual([
      { name: "TP", title: "TP", body: "# TP" },
    ]);
  });
});
