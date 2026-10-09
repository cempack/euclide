import { test, expect, type Page } from "@playwright/test";
import { nav, settle } from "./app";

/**
 * Formulas, pictures and the selection on the whiteboard, in the browser
 * build: a formula placed, a wrong one refused, moving and resizing, a
 * pasted picture under the ink, the eraser leaving it, Suppr and Ctrl+Z.
 * No screenshots.
 */

async function openBoard(page: Page) {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await settle(page);
  await nav(page, "Tableau blanc");
  await page.locator(".eu-board").waitFor();
  return {
    box: (await page.locator(".eu-board").boundingBox())!,
    palette: page.getByRole("toolbar", { name: "Outils du tableau" }),
  };
}

/** What the drawing's canvas holds at a point of the page: [r, g, b, a]. */
function inkAt(page: Page, x: number, y: number) {
  return page.evaluate(
    ([x, y]) => {
      const c = document.querySelectorAll<HTMLCanvasElement>(".eu-board canvas")[1];
      const r = c.getBoundingClientRect();
      const k = c.width / r.width;
      const at = c
        .getContext("2d")!
        .getImageData(Math.round((x - r.left) * k), Math.round((y - r.top) * k), 1, 1);
      return Array.from(at.data);
    },
    [x, y],
  );
}

test("a formula is placed, moved and resized; a wrong one says so", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { box, palette } = await openBoard(page);

  await palette.getByRole("button", { name: "Formule (LaTeX)" }).click();
  await page.mouse.click(box.x + 300, box.y + 120);
  const field = page.getByRole("textbox", { name: "Formule en LaTeX" });
  await expect(field).toBeFocused();
  await field.fill("f(x) = \\frac{1}{x} + \\sqrt{2x+1}");
  await field.press("Enter");
  await expect(field).toHaveCount(0);
  // The fraction's bar, drawn on the canvas.
  await expect
    .poll(async () => (await inkAt(page, box.x + 300 + 113, box.y + 120 + 33))[3])
    .toBeGreaterThan(100);

  await page.mouse.click(box.x + 300, box.y + 400);
  await field.fill("\\frac{1}{");
  await field.press("Enter");
  await expect(page.getByRole("alert")).toContainText("La formule est incomplète");
  await field.press("Escape");
  await expect(field).toHaveCount(0);

  await palette.getByRole("button", { name: /^Sélection/ }).click();
  await page.mouse.click(box.x + 330, box.y + 150);
  const frame = page.locator(".eu-board-selection");
  const f0 = (await frame.boundingBox())!;
  await page.mouse.move(box.x + 330, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + 430, box.y + 200, { steps: 6 });
  await page.mouse.up();
  const f1 = (await frame.boundingBox())!;
  expect([Math.round(f1.x - f0.x), Math.round(f1.y - f0.y)]).toEqual([100, 50]);

  const handle = (await page.locator(".eu-board-handle").boundingBox())!;
  await page.mouse.move(handle.x + 7, handle.y + 7);
  await page.mouse.down();
  await page.mouse.move(handle.x + 157, handle.y + 7, { steps: 6 });
  await page.mouse.up();
  const f2 = (await frame.boundingBox())!;
  expect(f2.width).toBeGreaterThan(f1.width + 120);
  expect(f2.height / f2.width).toBeCloseTo(f1.height / f1.width, 1);

  // One undo for the whole resize, one for the move.
  await page.keyboard.press("Control+z");
  expect(Math.round((await frame.boundingBox())!.width)).toBe(Math.round(f1.width));
  await page.keyboard.press("Control+z");
  expect(Math.round((await frame.boundingBox())!.x)).toBe(Math.round(f0.x));
  expect(errors).toEqual([]);
});

test("a pasted picture lies under the ink, and only the selection takes it off", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { palette } = await openBoard(page);
  await page.evaluate(async () => {
    const c = Object.assign(document.createElement("canvas"), { width: 480, height: 300 });
    const g = c.getContext("2d")!;
    g.fillStyle = "#cfe3ff";
    g.fillRect(0, 0, 480, 300);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
    const clipboard = new DataTransfer();
    clipboard.items.add(new File([blob], "image.png", { type: "image/png" }));
    document.body.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }),
    );
  });
  const frame = page.locator(".eu-board-selection");
  await expect(frame).toBeVisible();
  const pic = (await frame.boundingBox())!;
  const x = pic.x + pic.width / 2;
  const y = pic.y + pic.height / 2;
  await expect.poll(async () => (await inkAt(page, x, y - 40)).join()).toBe("207,227,255,255");

  await palette.getByRole("button", { name: "Stylo" }).click();
  await page.mouse.move(x - 80, y + 40);
  await page.mouse.down();
  await page.mouse.move(x + 80, y + 40, { steps: 10 });
  await page.mouse.up();
  expect((await inkAt(page, x, y + 40))[2]).toBeLessThan(100);

  await palette.getByRole("button", { name: "Gomme" }).click();
  await page.mouse.move(x - 60, y + 40);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 40, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await inkAt(page, x, y + 40)).join()).toBe("207,227,255,255");

  await palette.getByRole("button", { name: /^Sélection/ }).click();
  await page.mouse.click(x, y - 40);
  await page.keyboard.press("Delete");
  await expect(frame).toHaveCount(0);
  expect((await inkAt(page, x, y - 40))[3]).toBe(0);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await inkAt(page, x, y - 40)).join()).toBe("207,227,255,255");
  expect(errors).toEqual([]);
});

test("pages: added, turned, undone where they changed, saved and opened again", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { box } = await openBoard(page);
  const inked = () =>
    page.evaluate(() => {
      const c = [...document.querySelectorAll<HTMLCanvasElement>(".eu-board canvas")].filter(
        (x) => x.offsetParent,
      )[1];
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 128) n++;
      return n;
    });
  const stroke = async (dy: number) => {
    await page.mouse.move(box.x + 300, box.y + 200 + dy);
    await page.mouse.down();
    await page.mouse.move(box.x + 600, box.y + 260 + dy, { steps: 8 });
    await page.mouse.up();
  };
  const indicator = page.getByLabel(/^Page \d+ sur \d+$/);

  await stroke(0);
  const one = await inked();
  await page.getByRole("button", { name: "Nouvelle page" }).click();
  await expect(indicator).toHaveText("2 / 2");
  expect(await inked()).toBe(0);
  await stroke(100);
  const two = await inked();

  // A presentation clicker's keys turn the pages.
  await page.keyboard.press("PageUp");
  await expect(indicator).toHaveText("1 / 2");
  expect(await inked()).toBe(one);

  // Undo from page 1 takes back page 2's stroke, on page 2; redo puts it back there.
  await page.keyboard.press("Control+z");
  await expect(indicator).toHaveText("2 / 2");
  expect(await inked()).toBe(0);
  await page.keyboard.press("Control+y");
  await expect(indicator).toHaveText("2 / 2");
  expect(await inked()).toBe(two);
  // Undo again: the stroke, then the page itself.
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await expect(indicator).toHaveCount(0);
  await page.keyboard.press("Control+y");
  await page.keyboard.press("Control+y");
  await expect(indicator).toHaveText("2 / 2");

  // Saved on page 2, opened again on page 2, page 1 there too.
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(500);
  const name = (await page.getByRole("tab", { selected: true }).textContent())!.trim();
  await page.keyboard.press("Control+w");
  await nav(page, "Documents");
  await page.getByText(name).locator("visible=true").first().click();
  await expect(indicator).toHaveText("2 / 2");
  await expect.poll(inked).toBe(two);
  await page.keyboard.press("PageUp");
  await expect.poll(inked).toBe(one);
  expect(errors).toEqual([]);
});
