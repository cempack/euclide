// The release keynote: the dev page ?recap (src/dev/Recap.tsx), slides of
// 1920 × 1080 laid out in the app's own design system from the screenshots
// capture.mjs leaves in scripts/changelog/shots.
//
//   node scripts/changelog/recap.mjs [out-dir]     (npm run dev running)
//
// Writes, in out-dir (scripts/changelog/shots by default):
//   slide-NN-<name>.jpg   each slide at 3840 × 2160
//   recap-light.png, recap-dark.png   the overview slide alone, both themes
//   Euclide-0.4.pdf       the slides bound, one per page
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] ?? resolve(here, "shots"));
mkdirSync(out, { recursive: true });
// Slides of an earlier run, which may have been numbered otherwise.
for (const f of readdirSync(out)) if (/^slide-\d+-.*\.jpg$/.test(f)) rmSync(resolve(out, f));

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);

async function deck(theme) {
  const page = await browser.newPage({ viewport: { width: 2016, height: 1176 }, deviceScaleFactor: 2 });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("eu:theme", "auto"));
  await page.goto("http://localhost:1420/?recap");
  await page.locator(".k-slide").first().waitFor();
  await page.evaluate(() => globalThis.document.fonts.ready);
  await page.waitForLoadState("networkidle");
  // Every screenshot decoded before the first photograph.
  await page.evaluate(async () => {
    const urls = new Set();
    for (const el of globalThis.document.querySelectorAll(".k-shot, .k-shot-pic"))
      if (el.style.backgroundImage) urls.add(globalThis.getComputedStyle(el).backgroundImage.slice(5, -2));
    await Promise.all([...urls].map((u) => Object.assign(new globalThis.Image(), { src: u }).decode()));
  });
  await page.waitForTimeout(400);
  return page;
}

const light = await deck("light");
const slides = await light.locator(".k-slide").all();
const files = [];
for (const [i, slide] of slides.entries()) {
  const name = await slide.getAttribute("data-name");
  const file = resolve(out, `slide-${String(i + 1).padStart(2, "0")}-${name}.jpg`);
  await slide.screenshot({ path: file, type: "jpeg", quality: 88 });
  files.push(file);
  if (name === "vue-d-ensemble") await slide.screenshot({ path: resolve(out, "recap-light.png") });
  console.log("✓", name);
}
await light.close();

const dark = await deck("dark");
await dark
  .locator('.k-slide[data-name="vue-d-ensemble"]')
  .screenshot({ path: resolve(out, "recap-dark.png") });
await dark.close();
console.log("✓ vue d'ensemble, sombre");

// The PDF: one slide per page, the photographs as they are.
const pages = files
  .map((f) => `<img src="data:image/jpeg;base64,${readFileSync(f).toString("base64")}">`)
  .join("");
const bind = await browser.newPage();
await bind.setContent(
  `<!doctype html><html><head><style>
    @page { size: 1920px 1080px; margin: 0 }
    html, body { margin: 0 }
    img { display: block; width: 1920px; height: 1080px; break-after: page }
  </style></head><body>${pages}</body></html>`,
);
await bind.pdf({
  path: resolve(out, "Euclide-0.4.pdf"),
  width: "1920px",
  height: "1080px",
  printBackground: true,
});
console.log("✓ Euclide-0.4.pdf");
await browser.close();
