import { describe, expect, it } from "vitest";
import { errorCode, errorMessage, frenchSpaces } from "./errors";

describe("errors", () => {
  it("reads backend errors", () => {
    const err = { code: "not_found", message: "Élément introuvable." };
    expect(errorCode(err)).toBe("not_found");
    expect(errorMessage(err)).toBe("Élément introuvable.");
  });

  it("reads strings, Error objects and falls back", () => {
    expect(errorMessage('"Pronote n\'est pas connecté."')).toBe("Pronote n'est pas connecté.");
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage(new TypeError("x is undefined"), "Erreur")).toBe("Erreur");
    expect(errorMessage(undefined, "Erreur")).toBe("Erreur");
    expect(errorCode("x")).toBeNull();
  });
});

describe("frenchSpaces", () => {
  it("keeps signs from starting a line, and leaves times and links alone", () => {
    expect(frenchSpaces("Erreur de fichier : accès refusé")).toBe("Erreur de fichier\u00a0: accès refusé");
    expect(frenchSpaces("En choisir un autre ?")).toBe("En choisir un autre\u00a0?");
    expect(frenchSpaces("le nom « cours »")).toBe("le nom «\u00a0cours\u00a0»");
    expect(frenchSpaces("à 10:15, https://exemple.fr")).toBe("à 10:15, https://exemple.fr");
    expect(errorMessage("Python n'a pas démarré : délai")).toBe("Python n'a pas démarré\u00a0: délai");
  });
});
