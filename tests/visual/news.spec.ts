import { test, expect } from "@playwright/test";
import { settle } from "./app";

/**
 * « Nouveautés »: opened by the first launch after an update, with every
 * version since the one it came from, and from Réglages any time.
 */

test("after an update, Nouveautés tells every version since the one it came from, with its pictures", async ({
  page,
}) => {
  // The backend says so at launch (src-tauri/src/boot.rs): Euclide was 0.4.2.
  await page.addInitScript(() => {
    (window as { __EUCLIDE_BOOT__?: unknown }).__EUCLIDE_BOOT__ = {
      nonce: "news",
      settings: {},
      updated: { from: "0.4.2", to: "0.6.0" },
    };
  });
  await page.goto("/");
  await settle(page);

  await expect(page.getByRole("tab", { name: /Nouveautés/, selected: true })).toBeVisible();
  await expect(page.getByText("Ce qui a changé depuis la version 0.4.2")).toBeVisible();
  const versions = page.getByRole("heading", { level: 2, name: /^Version / });
  // 0.5.0 came out inside 0.6.0: both are told, 0.4.2 is not.
  await expect(versions).toHaveText(["Version 0.6.0", "Version 0.5.0"]);

  // The pictures are the app's own: they show without a network.
  const picture = page.getByRole("img", { name: /Une évaluation annotée/ });
  await expect(picture).toBeVisible();
  await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Versions précédentes" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Version 0.4.0" })).toBeVisible();
});

test("Réglages opens Nouveautés on every version", async ({ page }) => {
  await page.goto("/");
  await settle(page);
  await page.keyboard.press("Control+Comma");
  await settle(page);
  await page.getByRole("button", { name: "Voir", exact: true }).click();
  await expect(page.getByRole("tab", { name: /Nouveautés/, selected: true })).toBeVisible();
  await expect(page.getByText("Ce qui a changé d'une version à l'autre")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /^Version / }).first()).toHaveText(
    "Version 0.6.0",
  );
  await expect(page.getByRole("button", { name: "Versions précédentes" })).toHaveCount(0);
});
