// The desktop app on Windows (WebView2), driven by Playwright through the
// WebView2's DevTools port, which the e2e build opens (tauri.e2e.conf.json):
// the real backend, the app's CSP and its eufile protocol, on PDFs and an image.
//   node scripts/e2e/windows.mjs <euclide.exe> <out dir>   (from the repository's root)
/* global document, window, innerHeight */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const [exe, out = "e2e-out"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const fixture = (path) => resolve(path);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = async (what, run) => {
  try {
    const result = await run();
    if (result === false) throw new Error("no");
    // A value worth reading; not the handle a wait gives back.
    const shown =
      result !== undefined && result !== true && (typeof result !== "object" || Array.isArray(result));
    console.log(`ok   ${what}${shown ? ` (${JSON.stringify(result)})` : ""}`);
  } catch (err) {
    failures++;
    console.log(`FAIL ${what}: ${String(err?.message ?? err).split("\n")[0]}`);
  }
};

const app = spawn(exe, [], { stdio: "inherit" });
let browser = null;
for (let i = 0; i < 90 && !browser; i++) {
  browser = await chromium.connectOverCDP("http://127.0.0.1:9222").catch(() => null);
  if (!browser) await sleep(1000);
}
if (!browser) {
  console.log("FAIL the app's WebView2 never opened its DevTools port");
  app.kill();
  process.exit(1);
}
const context = browser.contexts()[0];
let page = null;
for (let i = 0; i < 60 && !page; i++) {
  page = context.pages().find((p) => /tauri\.localhost/.test(p.url())) ?? null;
  if (!page) await sleep(500);
}
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const invoke = (cmd, args) => page.evaluate(([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a), [cmd, args]);
const toolbar = () => page.getByRole("toolbar").first();
const saveButton = () => toolbar().getByRole("button", { name: "Enregistrer", exact: true });
const shownPage = () => page.locator(".eu-pdf-page:visible").first();
const fileId = async (start) =>
  (await invoke("list_files", { courseId: null })).find((f) => f.name.startsWith(start))?.id;

/** Opens a file of the library from Documents; true once its first page is drawn. */
async function open(name) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /Documents/ })
    .first()
    .click();
  await page.getByRole("option", { name: new RegExp(name) }).click();
  await page.waitForFunction(
    () => {
      const p = [...document.querySelectorAll(".eu-pdf-page")].find((e) => e.offsetParent);
      return !!p && [...p.querySelectorAll("img")].some((i) => i.complete && i.naturalWidth > 0);
    },
    null,
    { timeout: 30_000 },
  );
  await sleep(800);
}

/** A stroke of the pen across the page shown, `dy` points down from 260 px. */
async function stroke(dy = 0) {
  const box = await shownPage().boundingBox();
  await page.mouse.move(box.x + 120, box.y + 260 + dy);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) await page.mouse.move(box.x + 120 + i * 18, box.y + 260 + dy + (i % 2) * 24);
  await page.mouse.up();
  await sleep(1300);
}

try {
  await check("the app opens on its dashboard", () =>
    page.locator("nav").first().waitFor({ timeout: 30_000 }),
  );
  await page.setViewportSize({ width: 1280, height: 900 }).catch(() => {});

  await check("two PDFs and a phone photo go into the library", async () => {
    const files = await invoke("import_paths", {
      paths: [
        fixture("src/dev/fixtures/cours.pdf"),
        fixture("tests/visual/fixtures/form.pdf"),
        fixture("tests/visual/fixtures/rotated.jpg"),
      ],
      courseId: null,
    });
    return files.map((f) => f.name);
  });

  // 1. A course: drawn with its text, its page count.
  await check("the course opens, its first page drawn", () => open("cours"));
  await check("the page count reads sur 3", () => toolbar().getByText("sur 3").waitFor({ timeout: 5000 }));
  await check("the page has its text", async () => {
    const dark = await shownPage().evaluate((p) => {
      const img = [...p.querySelectorAll("img")].find((i) => i.naturalWidth > 0);
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] < 128) n++;
      return n;
    });
    if (dark < 300) throw new Error(`${dark} dark pixels`);
    return dark;
  });

  // 2. The pen, saved into the file; the old file kept as a version.
  await check("nothing to save yet", async () => !(await saveButton().isEnabled()));
  await check("the stroke makes it unsaved", async () => {
    await toolbar().getByRole("button", { name: "Stylo", exact: true }).click();
    await stroke();
    return saveButton().isEnabled();
  });
  await check("saved", async () => {
    await saveButton().click({ timeout: 5000 });
    await page.waitForFunction(
      () => {
        const b = [...document.querySelectorAll("[role=toolbar] button")].find(
          (x) => x.offsetParent && x.textContent.trim() === "Enregistrer",
        );
        return b && b.disabled;
      },
      null,
      { timeout: 10_000 },
    );
  });
  await check(
    "the old file is a version",
    async () => (await invoke("get_file_versions", { fileId: await fileId("cours") })).length === 1,
  );

  // 3. Ctrl+Z, Ctrl+Y.
  const paths = () =>
    shownPage().locator("[data-no-interaction] svg path:not([stroke='transparent'])").count();
  await page.keyboard.press("Control+z");
  await sleep(600);
  await check("Ctrl+Z takes it away", async () => (await paths()) === 0);
  await page.keyboard.press("Control+y");
  await sleep(600);
  await check("Ctrl+Y brings it back", async () => (await paths()) === 1);

  // 4. The page box and the pages panel.
  await check("page 3 shows after typing it", async () => {
    // The box, not the group around it, which has the same name.
    const box = toolbar().getByRole("textbox", { name: "Aller à la page" });
    await box.fill("3");
    await box.press("Enter");
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll(".eu-pdf-page")].some(
          (p) =>
            p.dataset.page === "3" &&
            p.getBoundingClientRect().top < innerHeight &&
            p.getBoundingClientRect().bottom > 0,
        ),
      null,
      { timeout: 5000 },
    );
  });
  await check("the pages panel draws its pages", async () => {
    await toolbar().getByRole("button", { name: "Vignettes des pages" }).click();
    await page.waitForFunction(
      () => [...document.querySelectorAll(".eu-pdf-thumb img")].some((i) => i.complete && i.naturalWidth > 0),
      null,
      { timeout: 10_000 },
    );
  });

  // 5. A form, filled in and saved.
  await check("the form opens", () => open("form"));
  await check("a click puts the caret in « Nom »", async () => {
    const form = await shownPage().boundingBox();
    const k = form.width / 595.28;
    await page.mouse.click(form.x + 265 * k, form.y + 128 * k);
    await sleep(400);
    return page.evaluate(() => document.activeElement?.tagName === "INPUT");
  });
  await page.keyboard.type("Moreau");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Élise");
  await sleep(300);
  await check("the form is saved", async () => {
    await saveButton().click({ timeout: 5000 });
    for (let i = 0; i < 40; i++) {
      if ((await invoke("get_file_versions", { fileId: await fileId("form") })).length === 1) return true;
      await sleep(250);
    }
    return false;
  });

  // 6. A phone photo stored on its side: shown upright, drawn on, the drawing kept apart.
  await check("the photo opens, upright", async () => {
    await open("rotated");
    const box = await shownPage().boundingBox();
    if (box.height <= box.width) throw new Error(`${box.width} × ${box.height}`);
    return [Math.round(box.width), Math.round(box.height)];
  });
  await check("its drawing is kept apart from it", async () => {
    await toolbar().getByRole("button", { name: "Stylo", exact: true }).click();
    await stroke(-120);
    await saveButton().click({ timeout: 5000 });
    for (let i = 0; i < 40; i++) {
      const json = await invoke("read_annotations", { fileId: await fileId("rotated") });
      if (json && JSON.parse(json).version === 2 && JSON.parse(json).annotations.length === 1) return true;
      await sleep(250);
    }
    return false;
  });

  await check("no errors in the page", async () => {
    if (errors.length) throw new Error(JSON.stringify(errors.slice(0, 5)));
  });
} catch (err) {
  failures++;
  console.log(`FAIL ${err?.message ?? err}`);
} finally {
  await page?.screenshot({ path: join(out, "app-end.png") }).catch(() => {});
  writeFileSync(join(out, "errors.json"), JSON.stringify(errors, null, 1));
  await browser.close().catch(() => {});
  app.kill();
}
console.log(failures ? `${failures} check(s) failed` : "all checks passed");
process.exit(failures ? 1 : 0);
