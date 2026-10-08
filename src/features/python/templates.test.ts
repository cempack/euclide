import { describe, expect, it } from "vitest";
import { BUILT_IN, LEVELS, UNLISTED, parseTemplates, readTemplate, searchTemplates } from "./templates";

describe("the built-in catalogue", () => {
  it("lists every template file once, each with its card", () => {
    expect(UNLISTED).toEqual([]);
    const listed = LEVELS.flatMap((l) => l.themes.flatMap((t) => t.files.map((f) => `${l.id}/${f}`)));
    expect(new Set(listed).size).toBe(listed.length);
    expect(BUILT_IN.map((t) => t.id)).toEqual(listed);
    for (const t of BUILT_IN) {
      expect(t.name, t.id).not.toBe("");
      expect(t.hint, t.id).not.toBe("");
      expect(t.code.trim(), t.id).not.toBe("");
      expect(t.code, t.id).not.toMatch(/^# (Modèle|Résumé|Script) :/m);
    }
  });

  it("names each template once", () => {
    const names = BUILT_IN.map((t) => t.name.toLowerCase());
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  });

  it("starts with the blank script, a « nouveau script »", () => {
    expect(BUILT_IN[0].id).toBe("bases/script-vide");
    expect(BUILT_IN[0].scriptName).toBe("nouveau script");
  });
});

describe("readTemplate", () => {
  it("reads the card and leaves the script without it", () => {
    const file =
      "# Modèle : Est-ce un multiple ?\n# Résumé : a et b : le reste.\n# Script : multiple\n\n# a = k × b\nprint(1)\n";
    expect(readTemplate(file)).toEqual({
      name: "Est-ce un multiple ?",
      hint: "a et b : le reste.",
      scriptName: "multiple",
      code: "# a = k × b\nprint(1)\n",
    });
  });

  it("takes a file without a card as it is", () => {
    expect(readTemplate("print(1)\n")).toEqual({
      name: "",
      hint: "",
      scriptName: undefined,
      code: "print(1)\n",
    });
  });
});

describe("searchTemplates", () => {
  it("finds by card first, without accents, then by code", () => {
    const found = searchTemplates(BUILT_IN, "equation");
    expect(found.length).toBeGreaterThan(0);
    expect(searchTemplates(BUILT_IN, "   ")).toEqual([]);
    const byCode = searchTemplates(BUILT_IN, "randint");
    expect(byCode.every((t) => t.code.includes("randint") || /randint/i.test(t.name + t.hint))).toBe(true);
  });
});

describe("parseTemplates", () => {
  it("reads the teacher's templates, as their own level", () => {
    const raw = JSON.stringify([{ name: " Mon exo ", hint: "Pour les 2nde", code: "print(1)\n" }]);
    expect(parseTemplates(raw)).toEqual([
      {
        id: "mine/Mon exo",
        name: "Mon exo",
        hint: "Pour les 2nde",
        level: "mine",
        theme: "",
        code: "print(1)\n",
      },
    ]);
  });

  it("skips what is not a template, and survives anything", () => {
    expect(parseTemplates(null)).toEqual([]);
    expect(parseTemplates("pas du json")).toEqual([]);
    expect(parseTemplates('{"name":"x"}')).toEqual([]);
    expect(parseTemplates('[{"name":"","code":"x"},{"name":"a"},{"name":"b","code":"y"}]')).toEqual([
      { id: "mine/b", name: "b", hint: "", level: "mine", theme: "", code: "y" },
    ]);
  });
});
