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
