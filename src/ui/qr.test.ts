import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { modulesPath, qrModules, type Modules } from "./qr";

/** The modules as pixels, `scale` per module, with a margin: what a camera sees. */
function pixels(modules: Modules, scale = 4, margin = 4) {
  const n = modules.length + 2 * margin;
  const size = n * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + margin) * scale + dy) * size + (x + margin) * scale + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    }),
  );
  return { data, size };
}

describe("QR codes", () => {
  it("read back what they say", async () => {
    for (const text of [
      "https://www.education.gouv.fr/",
      "Exercice 12 p. 87 : à rendre jeudi",
      "https://capytale2.ac-paris.fr/web/c/abcd-1234567?mode=eleve&page=exercice-3",
    ]) {
      const modules = await qrModules(text);
      expect(modules).not.toBeNull();
      const { data, size } = pixels(modules!);
      expect(jsQR(data, size, size)?.data).toBe(text);
    }
  });

  it("say when a text is too long", async () => {
    expect(await qrModules("x".repeat(5000))).toBeNull();
  });

  it("draw a run of dark modules as one rectangle", () => {
    expect(
      modulesPath([
        [true, true, false],
        [false, true, true],
      ]),
    ).toBe("M0 0h2v1h-2zM1 1h2v1h-2z");
  });
});
