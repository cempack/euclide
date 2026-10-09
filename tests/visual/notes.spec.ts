import { test, expect, type Page } from "@playwright/test";
import { settle } from "./app";

/**
 * Tables and pictures in a note, in the browser build: the toolbar's
 * table, cells pasted from a spreadsheet, a pasted screenshot that Ctrl+Z
 * takes back, a picture's width, one whose document is gone. No screenshots.
 */

async function openNote(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await settle(page);
  await page.getByRole("navigation").getByRole("button", { name: "Documents" }).first().click();
  await settle(page);
  await page.getByText("Fonction carré — cours").locator("visible=true").first().click();
  await page.getByRole("tab", { name: "Partagé" }).click();
  const source = page.getByRole("textbox", { name: "Source Markdown" });
  await source.click();
  await page.keyboard.press("Control+End");
  return source;
}

/** A paste as the system clipboard hands it over: text, HTML or a PNG. */
async function paste(page: Page, data: { text?: string; html?: string; png?: boolean }) {
  await page.evaluate(async ({ text, html, png }) => {
    const source = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Source Markdown"]')!;
    source.focus();
    const clipboard = new DataTransfer();
    if (text) clipboard.setData("text/plain", text);
    if (html) clipboard.setData("text/html", html);
    if (png) {
      const canvas = Object.assign(document.createElement("canvas"), { width: 240, height: 120 });
      canvas.getContext("2d")!.fillRect(0, 0, 240, 120);
      const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), "image/png"));
      clipboard.items.add(new File([blob], "image.png", { type: "image/png" }));
    }
    source.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }),
    );
  }, data);
}

test("a table from the toolbar or from a spreadsheet", async ({ page }) => {
  const source = await openNote(page);
  const preview = page.locator(".eu-prose").first();
  await page.getByRole("button", { name: "Tableau", exact: true }).click();
  await expect(source).toHaveValue(
    /\$\$\n\n\| Colonne 1 \| Colonne 2 \| Colonne 3 \|\n\| --- \| --- \| --- \|\n\| \| \| \|\n\| \| \| \|$/,
  );
  await expect(preview.locator("th").first()).toHaveText("Colonne 1");

  await page.keyboard.press("Control+End");
  await paste(page, {
    text: "Élève\tNote\r\nLéa\t12,5\r\nHugo\t9\r\n",
    html: "<table><tr><td>Élève</td><td>Note</td></tr></table>",
  });
  await expect(source).toHaveValue(
    /\n\n\| Élève \| Note \|\n\| --- \| ---: \|\n\| Léa \| 12,5 \|\n\| Hugo \| 9 \|$/,
  );
  await expect(preview.locator("table")).toHaveCount(2);
  // The column of marks lines up on the right.
  await expect(preview.locator("table").nth(1).locator("td").nth(1)).toHaveCSS("text-align", "right");

  // Code with tabs, from anywhere but a spreadsheet, is left to the textarea.
  const before = await source.inputValue();
  await paste(page, { text: "def f():\n\treturn 1" });
  await expect(preview.locator("table")).toHaveCount(2);
  expect(await source.inputValue()).toBe(before);
});

test("a pasted screenshot, its width, and a picture whose document is gone", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const source = await openNote(page);
  const preview = page.locator(".eu-prose").first();
  const before = await source.inputValue();

  await paste(page, { png: true });
  await expect(source).toHaveValue(/\n\n!\[\]\(eufile:\/\/file\/\d+\)$/);
  const picture = preview.locator("img").last();
  await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(240);

  // Ctrl+Z takes it back out, Ctrl+Maj+Z puts it back.
  const pasted = await source.inputValue();
  await page.keyboard.press("Control+z");
  await expect(source).toHaveValue(before);
  await page.keyboard.press("Control+Shift+z");
  await expect(source).toHaveValue(pasted);

  const address = pasted.match(/eufile:\/\/file\/\d+/)![0];
  await page.keyboard.type(`\n\n![Parabole|120](${address})\n\n![Vieille figure](eufile://file/987654)\n`);
  await expect(preview.locator('img[alt="Parabole"]')).toHaveCSS("width", "120px");
  await expect(preview.getByText("Image introuvable : Vieille figure")).toBeVisible();
  expect(errors).toEqual([]);
});
