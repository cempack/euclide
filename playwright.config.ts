import { defineConfig } from "@playwright/test";

/**
 * Screenshot harness for the visual work. Runs the Vite dev server, where
 * Euclide talks to the in-memory mock backend (src/dev/mock-backend.ts).
 *
 *   npm run shots:update   capture a reference set (before a change)
 *   npm run shots          compare against it (after the change)
 *
 * Reference images live in .shots/ and are not committed: fonts render
 * differently from one machine to another. Set PW_CHROMIUM to use a system
 * Chromium instead of the browser downloaded by `npx playwright install`.
 */
export default defineConfig({
  testDir: "tests/visual",
  snapshotPathTemplate: ".shots/{arg}{ext}",
  outputDir: "test-results",
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  expect: {
    // SHOTS_STRICT=1 reports every changed pixel, for reviewing a deliberate change.
    toHaveScreenshot: {
      maxDiffPixelRatio: process.env.SHOTS_STRICT ? 0 : 0.002,
      animations: "disabled",
      caret: "hide",
    },
  },
  use: {
    baseURL: "http://localhost:1420",
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
