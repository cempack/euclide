import { describe, expect, it } from "vitest";
import { fmt, get } from "./i18n";

describe("fmt", () => {
  it("fills every placeholder occurrence", () => {
    expect(fmt("{n} cours, {n} classes pour {who}", { n: 2, who: "Camille" })).toBe(
      "2 cours, 2 classes pour Camille",
    );
  });
});

describe("get", () => {
  it("reads nested strings and falls back on missing keys", () => {
    expect(get("nav.dashboard")).toBe("Tableau de bord");
    expect(get("nope.missing", "défaut")).toBe("défaut");
  });
});
