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
  await page.locator(".eu-pdf-page").first().waitFor();
  await expect(page.getByText("Chargement du PDF…")).toHaveCount(0);
  await page.waitForTimeout(500);
}

/** A stroke on page 1, and where it passes. */
async function stroke(page: Page, dy = 0) {
  const box = (await page.locator(".eu-pdf-page").first().boundingBox())!;
  const x = box.x + box.width / 3;
  const y = box.y + 150 + dy;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + i * 14, y + i * 5);
  await page.mouse.up();
  // The pen waits a moment for the next stroke of the same word.
  await page.waitForTimeout(1200);
  return { x: x + 4 * 14, y: y + 4 * 5 };
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
  const on = await stroke(page);
  await expect(save(page)).toBeEnabled();
  await save(page).click();
  await expect(save(page)).toBeDisabled();
  // Changing tools changes nothing.
  await tool(page, "Sélection").click();
  await tool(page, "Stylo").click();
  await tool(page, "Sélection").click();
  await page.waitForTimeout(300);
  await expect(save(page)).toBeDisabled();
  await page.mouse.click(on.x, on.y);
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
  // The link's area on the page, followed on a click (not selected for editing).
  const link = page.locator(".eu-pdf-page [style*='cursor: pointer']").first();
  await link.waitFor();
  const asked = page.context().waitForEvent("request", (r) => r.url().includes("education.gouv.fr"));
  const popup = page.waitForEvent("popup");
  await link.click();
  await popup;
  await asked;
  expect(page.url()).toContain("?pdf=");
  // With the pen on, a stroke started on the link stays a stroke.
  await page.getByRole("button", { name: "pen" }).click();
  const box = (await link.boundingBox())!;
  let opened = false;
  page.on("popup", () => (opened = true));
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);
  expect(opened).toBe(false);
});

test("a form filled in is saved into the file", async ({ page }) => {
  const form = fileURLToPath(new URL("./fixtures/form.pdf", import.meta.url));
  let served: Buffer | string = form;
  await page.route(
    (url) => url.pathname === "/form.pdf",
    (route) =>
      typeof served === "string"
        ? route.fulfill({ path: served, contentType: "application/pdf" })
        : route.fulfill({ body: served, contentType: "application/pdf" }),
  );
  await page.goto("/?pdf=/form.pdf");
  const field = page.locator(".eu-pdf-page input[type='text']");
  const box = (await page.locator(".eu-pdf-page").first().boundingBox())!;
  await page.waitForTimeout(800);
  // « Nom », then Tab to « Prénom ».
  await page.mouse.click(box.x + box.width * 0.44, box.y + 268 * (box.width / 1248));
  await expect(field.first()).toBeFocused();
  await page.keyboard.type("Moreau");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Élise");
  await expect(page.getByTestId("dirty")).toHaveText("dirty");
  // Saved while still typing in the field.
  await page.getByRole("button", { name: "save" }).click();
  await expect(page.getByTestId("dirty")).toHaveText("clean");
  served = Buffer.from(
    await page.evaluate(() => Array.from((window as { pdfSaved?: Uint8Array }).pdfSaved ?? [])),
  );

  // The saved file, opened again.
  await page.goto("/?pdf=/form.pdf");
  await expect(field.nth(1)).toHaveValue("Élise");
  await expect(field.first()).toHaveValue("Moreau");
});

test("Ctrl+F finds a word on every page, and the outline goes to a chapter", async ({ page }) => {
  const pdf = fileURLToPath(new URL("./fixtures/outline.pdf", import.meta.url));
  await page.route(/\/src\/dev\/fixtures\/docs\/\d+\.pdf$/, (route) =>
    route.fulfill({ path: pdf, contentType: "application/pdf" }),
  );
  await openPdf(page);
  // In front, the PDF takes Ctrl+F from the Documents screen.
  await page.keyboard.press("Control+f");
  const field = page.getByRole("textbox", { name: "Rechercher dans le document" });
  await expect(field).toBeFocused();
  await page.keyboard.type("dérivée");
  const status = page.locator(".eu-pdf-find [aria-live]");
  await expect(status).toHaveText("1 sur 120");
  await page.keyboard.press("Shift+Enter");
  await expect(status).toHaveText("120 sur 120");
  await expect(page.getByRole("textbox", { name: "Aller à la page" })).toHaveValue("6");
  await page.keyboard.press("Escape");
  await expect(page.locator(".eu-pdf-find")).toHaveCount(0);

  await page.getByRole("button", { name: "Vignettes des pages" }).click();
  await page.getByRole("tab", { name: "Sommaire" }).click();
  await page.getByRole("button", { name: "Suites arithmétiques" }).click();
  await expect(page.getByRole("textbox", { name: "Aller à la page" })).toHaveValue("3");
});
