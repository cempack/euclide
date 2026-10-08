import { test, expect } from "@playwright/test";
import { SCREENS, VARIANTS, boot, settle, type Variant } from "./app";

for (const v of VARIANTS) {
  test.describe(`${v.theme} ${v.density}`, () => {
    for (const s of SCREENS) {
      test(s.name, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await boot(page, v);
        await s.go(page);
        await expect(page).toHaveScreenshot(`${s.name}--${v.theme}-${v.density}.png`);
        expect(errors, "page errors").toEqual([]);
      });
    }
  });
}

// The UI kit on one page (dev/Gallery.tsx), tall enough to show it whole.
test.describe("gallery", () => {
  const variants: Array<Variant & { projection?: boolean }> = [
    ...VARIANTS,
    { theme: "light", density: "comfortable", projection: true },
  ];
  for (const v of variants) {
    const name = `gallery--${v.theme}-${v.density}${v.projection ? "-projection" : ""}`;
    test(name, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 2400 });
      await page.emulateMedia({ colorScheme: v.theme, reducedMotion: "reduce" });
      await page.addInitScript((density) => {
        localStorage.setItem("eu:theme", "auto");
        localStorage.setItem("eu:density", density);
      }, v.density);
      await page.goto(`/?gallery${v.projection ? "&projection" : ""}`);
      await page.getByText("Composants").first().waitFor();
      await settle(page);
      await expect(page).toHaveScreenshot(`${name}.png`);
    });
  }
});
