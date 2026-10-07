import { describe, expect, it } from "vitest";
import { fmt, get, tr, trList, trn } from "./i18n";

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

describe("tr", () => {
  it("reads a message and fills its placeholders", () => {
    expect(tr("nav.dashboard")).toBe("Tableau de bord");
    expect(tr("notes.savedAt", { when: "hier" })).toContain("hier");
  });

  it("puts 0 and 1 in the singular, and writes numbers the French way", () => {
    expect(trn("sequences.stepCount", 0)).toBe("0 étape");
    expect(trn("sequences.stepCount", 1)).toBe("1 étape");
    expect(trn("sequences.stepCount", 2)).toBe("2 étapes");
    expect(trn("documents.metaFiles", 1200)).toBe("1\u202f200 fichiers");
    expect(trn("reminders.clearDoneMessage", 1)).toBe("Supprimer le rappel terminé ?");
  });

  it("reads lists", () => {
    expect(trList("greetings").length).toBeGreaterThan(0);
  });
});
