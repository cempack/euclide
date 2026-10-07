import { test, expect, type Page } from "@playwright/test";

/** Tuesday mid-morning: a class is in progress, reminders are due today. */
const NOW = new Date("2026-10-06T10:40:00");

type Variant = { theme: "light" | "dark"; density: "comfortable" | "compact" };
const VARIANTS: Variant[] = [
  { theme: "light", density: "comfortable" },
  { theme: "dark", density: "comfortable" },
  { theme: "light", density: "compact" },
  { theme: "dark", density: "compact" },
];

async function boot(page: Page, v: Variant) {
  await page.emulateMedia({ colorScheme: v.theme, reducedMotion: "reduce" });
  await page.clock.install({ time: NOW });
  await page.addInitScript((density) => {
    // Deterministic « random » greetings and cheers.
    let seed = 42;
    Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    localStorage.setItem("eu:theme", "auto");
    localStorage.setItem("eu:density", density);
  }, v.density);
  // No network in screenshots: remote favicons fall back to local badges.
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await settle(page);
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function nav(page: Page, label: string) {
  await page.getByRole("navigation").getByRole("button", { name: label, exact: false }).first().click();
  await settle(page);
}

const SCREENS: Array<{ name: string; go: (page: Page) => Promise<void> }> = [
  { name: "dashboard", go: async () => {} },
  { name: "courses", go: (p) => nav(p, "Cours") },
  {
    name: "course-detail",
    go: async (p) => {
      await nav(p, "Cours");
      await p.getByText("Mathématiques", { exact: true }).first().click();
      await settle(p);
    },
  },
  { name: "documents", go: (p) => nav(p, "Documents") },
  { name: "reminders", go: (p) => nav(p, "Rappels") },
  { name: "whiteboard", go: (p) => nav(p, "Tableau blanc") },
  { name: "python", go: (p) => nav(p, "Python") },
  { name: "tools", go: (p) => nav(p, "Outils") },
  { name: "recap", go: (p) => nav(p, "Bilan") },
  {
    name: "settings",
    go: async (p) => {
      await p.keyboard.press("Control+Comma");
      await settle(p);
    },
  },
  {
    name: "note",
    go: async (p) => {
      await nav(p, "Documents");
      await p.getByText("Fonction carré — cours").first().click();
      await settle(p);
      await p.waitForTimeout(400); // KaTeX preview
    },
  },
  {
    name: "palette",
    go: async (p) => {
      await p.keyboard.press("Control+k");
      await p.keyboard.type("fonc");
      await settle(p);
    },
  },
  {
    name: "shortcuts",
    go: async (p) => {
      await p.keyboard.press("Control+Slash");
      await settle(p);
    },
  },
];

for (const v of VARIANTS) {
  test.describe(`${v.theme} ${v.density}`, () => {
    for (const s of SCREENS) {
      test(s.name, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await boot(page, v);
        await s.go(page);
        await expect(page).toHaveScreenshot(`${s.name}--${v.theme}-${v.density}.png`);
        expect(errors, "page errors").toEqual([]);
      });
    }
  });
}
