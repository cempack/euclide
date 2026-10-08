import { describe, expect, it } from "vitest";
import { BUILT_IN, GROUPS, parseTemplates } from "./templates";

describe("built-in script templates", () => {
  it("each has its script, a unique name and a known group", () => {
    const names = BUILT_IN.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of BUILT_IN) {
      expect(t.code.trim(), t.name).not.toBe("");
      expect(GROUPS.map((g) => g.id)).toContain(t.group);
      expect(t.group).not.toBe("mine");
    }
  });

  it("the blank one makes a « nouveau script »", () => {
    expect(BUILT_IN[0].scriptName).toBe("nouveau script");
  });
});

describe("parseTemplates", () => {
  it("reads the teacher's templates, as their own group", () => {
    const raw = JSON.stringify([{ name: " Mon exo ", hint: "Pour les 2nde", code: "print(1)\n" }]);
    expect(parseTemplates(raw)).toEqual([
      { name: "Mon exo", hint: "Pour les 2nde", group: "mine", code: "print(1)\n" },
    ]);
  });

  it("skips what is not a template, and survives anything", () => {
    expect(parseTemplates(null)).toEqual([]);
    expect(parseTemplates("pas du json")).toEqual([]);
    expect(parseTemplates('{"name":"x"}')).toEqual([]);
    expect(parseTemplates('[{"name":"","code":"x"},{"name":"a"},{"name":"b","code":"y"}]')).toEqual([
      { name: "b", hint: "", group: "mine", code: "y" },
    ]);
  });
});
