import { test, expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { settle } from "./app";

/**
 * The PDF viewer at work in the browser build: what a tool left on does to
 * the other tabs, the unsaved mark, old versions and links. No screenshots.
 */

// Wide enough for the whole PDF toolbar, Versions included, with the pen's colours and widths out.
test.use({ viewport: { width: 2000, height: 1000 } });

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

type Point = { x: number; y: number };

/**
 * The outline fixture in the dev page, tall enough to draw on its first
 * lines without scrolling. Gives where a point of the first page (in the
 * page's points, from the top) is on the screen.
 */
async function openOutline(page: Page) {
  const pdf = fileURLToPath(new URL("./fixtures/outline.pdf", import.meta.url));
  await page.route(
    (url) => url.pathname === "/outline.pdf",
    (route) => route.fulfill({ path: pdf, contentType: "application/pdf" }),
  );
  await page.setViewportSize({ width: 1000, height: 1400 });
  await page.goto("/?pdf=/outline.pdf");
  const sheet = page.locator(".eu-pdf-page").first();
  await sheet.waitFor();
  await page.waitForTimeout(800);
  const box = (await sheet.boundingBox())!;
  return (x: number, y: number): Point => ({
    x: box.x + (x * box.width) / 595,
    y: box.y + (y * box.width) / 595,
  });
}

async function drag(page: Page, from: Point, to: Point) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++)
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10);
  await page.mouse.up();
}

/** What the dev page saves, as text: PDFium writes the annotations' types out plainly. */
async function savedText(page: Page) {
  await page.getByRole("button", { name: "save" }).click();
  await expect(page.getByTestId("dirty")).toHaveText("clean");
  return page.evaluate(() =>
    new TextDecoder("latin1").decode((window as { pdfSaved?: Uint8Array }).pdfSaved),
  );
}

// The fixture's lines: « Ligne 1 » 170 pt from the top, then one every 22 pt, from 60 pt on.

test("the highlighter marks a line of text, and draws free-hand where there is none", async ({ page }) => {
  const at = await openOutline(page);
  await page.getByRole("button", { name: "highlight", exact: true }).click();
  await drag(page, at(62, 166), at(220, 166));
  // Down the margin.
  await drag(page, at(20, 300), at(32, 420));
  const saved = await savedText(page);
  expect(saved).toContain("/Subtype/Highlight");
  expect(saved).toContain("/Subtype/Ink");
});

test("a line of text is underlined or struck out", async ({ page }) => {
  const at = await openOutline(page);
  await page.getByRole("button", { name: "underline", exact: true }).click();
  await drag(page, at(62, 188), at(220, 188));
  await page.getByRole("button", { name: "strikeout", exact: true }).click();
  await drag(page, at(62, 210), at(220, 210));
  const saved = await savedText(page);
  expect(saved).toContain("/Subtype/Underline");
  expect(saved).toContain("/Subtype/StrikeOut");
});

test("a PDF with a password opens once it is given, and stays protected when saved", async ({ page }) => {
  // reportlab's one page, encrypted by pypdf (AES-128) with the password « secret ».
  const pdf = fileURLToPath(new URL("./fixtures/locked.pdf", import.meta.url));
  await page.route(
    (url) => url.pathname === "/locked.pdf",
    (route) => route.fulfill({ path: pdf, contentType: "application/pdf" }),
  );
  await page.goto("/?pdf=/locked.pdf");
  const field = page.getByLabel("Mot de passe");
  await expect(field).toBeFocused();
  await field.fill("nope");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toHaveText("Ce n'est pas le bon mot de passe.");
  await field.fill("secret");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("info")).toHaveText(/pages=1/);

  await page.getByRole("button", { name: "pen", exact: true }).click();
  await stroke(page);
  // Encryption hides strings and streams, not the dictionaries' names.
  const saved = await savedText(page);
  expect(saved).toContain("/Encrypt");
  expect(saved).toContain("/Subtype/Ink");
});

test("a copy has what was drawn and typed fixed in its pages", async ({ page }) => {
  const form = fileURLToPath(new URL("./fixtures/form.pdf", import.meta.url));
  await page.route(
    (url) => url.pathname === "/form.pdf",
    (route) => route.fulfill({ path: form, contentType: "application/pdf" }),
  );
  await page.goto("/?pdf=/form.pdf");
  const box = (await page.locator(".eu-pdf-page").first().boundingBox())!;
  await page.waitForTimeout(800);
  await page.mouse.click(box.x + box.width * 0.44, box.y + 268 * (box.width / 1248));
  await page.keyboard.type("Moreau");
  await page.getByRole("button", { name: "pen", exact: true }).click();
  await stroke(page, 300);
  await page.getByRole("button", { name: "copy", exact: true }).click();
  await page.waitForFunction(() => (window as { pdfCopy?: Uint8Array }).pdfCopy);
  const copy = await page.evaluate(() =>
    new TextDecoder("latin1").decode((window as { pdfCopy?: Uint8Array }).pdfCopy),
  );
  // No field and no annotation left: all of it is drawn in the page.
  expect(copy).toContain("%PDF");
  expect(copy).not.toContain("/AcroForm");
  expect(copy).not.toMatch(/\/Subtype\s*\/(Widget|Ink)/);
  // The document itself is as it was: still to be saved.
  await expect(page.getByTestId("dirty")).toHaveText("dirty");
});

test("a squared page is inserted, then taken back; pages go to a new document", async ({ page }) => {
  await openPdf(page);
  const of = page.getByText(/^sur \d+$/);
  await expect(of).toHaveText("sur 1");
  const menu = async () => {
    await page.getByRole("button", { name: "Pages", exact: true }).click();
    return page.getByRole("menu");
  };
  // One page only: it cannot be deleted.
  await expect((await menu()).getByRole("menuitem", { name: "Supprimer la page 1" })).toBeDisabled();
  await page.keyboard.press("Escape");

  await (await menu()).getByRole("menuitem", { name: /petits carreaux/ }).click();
  await expect(of).toHaveText("sur 2");
  await expect(page.getByRole("textbox", { name: "Aller à la page" })).toHaveValue("2");
  // The toast's « Annuler » (the toolbar's undoes strokes).
  await page.getByText("Annuler", { exact: true }).click();
  await expect(of).toHaveText("sur 1");

  await (await menu()).getByRole("menuitem", { name: /Extraire/ }).click();
  const pagesBox = page.getByLabel("Pages à extraire");
  await pagesBox.fill("2");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toContainText("De 1 à 1");
  await pagesBox.fill("1");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Pages extraites/)).toBeVisible();
  await expect(page.getByLabel("Pages à extraire")).toHaveCount(0);
});

test("another PDF goes at the end, and a page moves after the next", async ({ page }) => {
  await openPdf(page);
  const of = page.getByText(/^sur \d+$/);
  await expect(of).toHaveText("sur 1");
  const menu = async () => {
    await page.getByRole("button", { name: "Pages", exact: true }).click();
    return page.getByRole("menu");
  };
  await (await menu()).getByRole("menuitem", { name: /Ajouter un autre PDF/ }).click();
  const chooser = page.getByRole("dialog");
  await chooser.getByRole("option").first().click();
  await expect(chooser).toHaveCount(0);
  await expect(of).not.toHaveText("sur 1");
  const total = Number((await of.textContent())!.replace(/\D/g, ""));
  // The view opens at the first page added.
  await expect(page.getByRole("textbox", { name: "Aller à la page" })).toHaveValue("2");

  await page.getByRole("textbox", { name: "Aller à la page" }).fill("1");
  await page.keyboard.press("Enter");
  await expect(
    (await menu()).getByRole("menuitem", { name: "Mettre la page 1 avant la page 0" }),
  ).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Mettre la page 1 après la page 2" }).click();
  await expect(page.getByRole("textbox", { name: "Aller à la page" })).toHaveValue("2");
  await expect(of).toHaveText(`sur ${total}`);
});

test("Ctrl+P prints the pages as they show, then puts the sheet away", async ({ page }) => {
  // The dialog is the system's: here, only that it was asked for.
  await page.addInitScript(() => {
    window.print = () => {
      (window as { printAsked?: number }).printAsked = 1;
    };
  });
  await openPdf(page);
  await tool(page, "Stylo").click();
  await stroke(page);
  await page.keyboard.press("Control+p");
  await page.waitForFunction(() => (window as { printAsked?: number }).printAsked === 1);
  // One picture per page, drawn with the stroke not yet saved.
  await expect(page.locator(".eu-print .eu-print-pdf img")).toHaveCount(1);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator(".eu-print")).toHaveCount(0);
  await expect(save(page)).toBeEnabled();
});

test("F5 presents the pages one at a time, and Échap comes back to the last one", async ({ page }) => {
  const pdf = fileURLToPath(new URL("./fixtures/outline.pdf", import.meta.url));
  await page.route(/\/src\/dev\/fixtures\/docs\/\d+\.pdf$/, (route) =>
    route.fulfill({ path: pdf, contentType: "application/pdf" }),
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await openPdf(page);
  await page.keyboard.press("F5");
  const count = page.locator(".eu-pdf-present-count");
  await expect(count).toHaveText("1 / 6");
  // A clicker's keys, then the wheel.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("PageDown");
  await expect(count).toHaveText("3 / 6");
  // Page 3 alone, the whole of it in the middle of the screen.
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".eu-pdf-page")]
          .filter((p) => getComputedStyle(p).visibility === "visible")
          .map((p) => {
            const r = p.getBoundingClientRect();
            return `${p.dataset.page}:${Math.abs(r.top + r.bottom - innerHeight) <= 2 ? "centred" : r.top}`;
          }),
      ),
    )
    .toEqual(["3:centred"]);
  await page.keyboard.press("b");
  await expect(page.locator(".eu-pdf-present-blank")).toHaveCount(1);
  await page.keyboard.press("x");
  await expect(page.locator(".eu-pdf-present-blank")).toHaveCount(0);
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 120);
  await expect(count).toHaveText("4 / 6");

  await page.keyboard.press("Escape");
  await expect(page.locator(".eu-pdf-presenting")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const top = document.querySelector('.eu-pdf-page[data-page="4"]')!.getBoundingClientRect().top;
        return top > 0 && top < 200;
      }),
    )
    .toBe(true);
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
