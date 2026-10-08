// The release's recap image: the dev page ?recap (src/dev/Recap.tsx), laid
// out in the app's own design system from the screenshots capture.mjs
// leaves in scripts/changelog/shots, photographed at 3840 × 2160.
//
//   node scripts/changelog/recap.mjs [out-dir]     (npm run dev running)
//
// Writes recap-light.png and recap-dark.png.
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] ?? resolve(here, "shots"));
mkdirSync(out, { recursive: true });

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);
for (const theme of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.addInitScript(() => localStorage.setItem("eu:theme", "auto"));
  await page.goto("http://localhost:1420/?recap");
  await page.locator(".recap").waitFor();
  await page.evaluate(() => globalThis.document.fonts.ready);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await page.locator(".recap").screenshot({ path: resolve(out, `recap-${theme}.png`) });
  await page.close();
  console.log("✓", theme);
}
await browser.close();
