import { describe, expect, it } from "vitest";
import { errorCode, errorMessage } from "./errors";

describe("errors", () => {
  it("reads backend errors", () => {
    const err = { code: "not_found", message: "Élément introuvable." };
    expect(errorCode(err)).toBe("not_found");
    expect(errorMessage(err)).toBe("Élément introuvable.");
  });

  it("reads strings, Error objects and falls back", () => {
    expect(errorMessage('"Pronote n\'est pas connecté."')).toBe("Pronote n'est pas connecté.");
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage(undefined, "Erreur")).toBe("Erreur");
    expect(errorCode("x")).toBeNull();
  });
});
