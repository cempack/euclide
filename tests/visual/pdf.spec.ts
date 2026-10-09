import { test, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { settle } from "./app";

/**
 * The PDF viewer at work in the browser build: what a tool left on does to
 * the other tabs, the unsaved mark, old versions and links. No screenshots.
 */

// Wide enough for the whole PDF toolbar, Versions included.
test.use({ viewport: { width: 1900, height: 1000 } });

const PDF = /Évaluation — Statistiques/;

async function openPdf(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await settle(page);
  await page.getByRole("navigation").getByRole("button", { name: "Documents" }).first().click();
  await settle(page);
  await page.getByRole("option", { name: PDF }).click();
  await page.locator(".page").first().waitFor();
  await expect(page.getByText("Chargement du PDF…")).toHaveCount(0);
  await page.waitForTimeout(500);
}

async function stroke(page: Page, dy = 0) {
  const box = (await page.locator(".page").first().boundingBox())!;
  const x = box.x + box.width / 3;
  const y = box.y + 150 + dy;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + i * 14, y + i * 5);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

const tool = (page: Page, name: "Sélection" | "Stylo") => page.getByRole("button", { name, exact: true });
const save = (page: Page) =>
  page.getByRole("toolbar").getByRole("button", { name: "Enregistrer", exact: true });

test("a PDF left in pen mode leaves the other tabs their keys", async ({ page }) => {
  await openPdf(page);
  await tool(page, "Stylo").click();
  await page.waitForTimeout(300);
  await page.keyboard.press("Control+n");
  await settle(page);
  const body = page.locator("textarea").last();
  await body.click();
  await page.keyboard.type("abcd");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  expect(await body.inputValue(), "the PDF out of sight").toBe("ab");

  // Back in front, the pen is on again.
  await page.getByRole("tab", { name: PDF }).click();
  await page.waitForTimeout(400);
  await stroke(page);
  await expect(save(page)).toBeEnabled();
  await page.keyboard.press("Control+w");
  await page.getByRole("button", { name: "Ne pas enregistrer" }).click();
  await expect(page.getByRole("tab", { name: PDF })).toHaveCount(0);
  await page
    .getByRole("tab", { name: /Nouvelle note/ })
    .first()
    .click();
  await body.click();
  await page.keyboard.press("End");
  await page.keyboard.type("xy");
  await page.keyboard.press("Backspace");
  expect(await body.inputValue(), "the PDF closed").toBe("abx");
});

test("the unsaved mark follows the annotations", async ({ page }) => {
  await openPdf(page);
  await expect(save(page)).toBeDisabled();
  await tool(page, "Stylo").click();
  await page.waitForTimeout(300);
  await stroke(page);
  await expect(save(page)).toBeEnabled();
  await save(page).click();
  await expect(save(page)).toBeDisabled();
  // Changing tools changes nothing.
  await tool(page, "Sélection").click();
  await tool(page, "Stylo").click();
  await page.waitForTimeout(300);
  await expect(save(page)).toBeDisabled();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(500);
  await expect(save(page), "deleted after the save").toBeEnabled();
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(500);
  await expect(save(page), "undone back to what the file holds").toBeDisabled();
});

test("an old version does not throw unsaved annotations away", async ({ page }) => {
  await openPdf(page);
  await tool(page, "Stylo").click();
  await page.waitForTimeout(300);
  await stroke(page);
  await save(page).click();
  await expect(save(page)).toBeDisabled();
  await stroke(page, 120);
  await expect(save(page)).toBeEnabled();
  const versions = page.getByRole("button", { name: /Versions/ });

  await versions.click();
  await page.getByRole("menuitem").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Enregistrer vos annotations avant d'afficher cette version")).toBeVisible();
  await dialog.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByText(/lecture seule/)).toHaveCount(0);
  await expect(save(page)).toBeEnabled();

  await versions.click();
  await page.getByRole("menuitem").first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText(/lecture seule/)).toBeVisible();
  await expect(save(page)).toBeDisabled();
  await expect(page.getByRole("button", { name: /Versions \(2\)/ })).toBeVisible();
});

test("a link in a PDF asks for a window of its own", async ({ page }) => {
  const pdf = fileURLToPath(new URL("./fixtures/link.pdf", import.meta.url));
  await page.route(
    (url) => url.pathname === "/link.pdf",
    (route) => route.fulfill({ path: pdf, contentType: "application/pdf" }),
  );
  // No network in tests: the request says where the link went.
  await page.context().route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
  await page.goto("/?pdf=/link.pdf");
  const link = page.locator(".annotationLayer a[href^='https://']");
  await link.waitFor({ state: "attached" });
  expect(await link.getAttribute("target")).toBe("_blank");
  expect(await link.getAttribute("rel")).toContain("noopener");
  const asked = page.context().waitForEvent("request", (r) => r.url().includes("education.gouv.fr"));
  const popup = page.waitForEvent("popup");
  await link.click();
  await popup;
  await asked;
  expect(page.url()).toContain("?pdf=");
});
