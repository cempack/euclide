import type { Page } from "@playwright/test";

/** Tuesday mid-morning: a class is in progress, reminders are due today. */
export const NOW = new Date("2026-10-06T10:40:00");

export type Variant = { theme: "light" | "dark"; density: "comfortable" | "compact" };
export const VARIANTS: Variant[] = [
  { theme: "light", density: "comfortable" },
  { theme: "dark", density: "comfortable" },
  { theme: "light", density: "compact" },
  { theme: "dark", density: "compact" },
];

export async function boot(page: Page, v: Variant) {
  await page.emulateMedia({ colorScheme: v.theme, reducedMotion: "reduce" });
  await page.clock.install({ time: NOW });
  await page.addInitScript((density) => {
    // Deterministic « random » greetings and cheers.
    let seed = 42;
    Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    // And the classroom screen's draws (features/classroom/picker.ts).
    crypto.getRandomValues = <T extends ArrayBufferView | null>(array: T): T => {
      if (array instanceof Uint32Array)
        for (let i = 0; i < array.length; i++) array[i] = Math.random() * 2 ** 32;
      return array;
    };
    localStorage.setItem("eu:theme", "auto");
    localStorage.setItem("eu:density", density);
  }, v.density);
  // No network in screenshots: remote favicons fall back to local badges.
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await settle(page);
}

export async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  // Data that depends on other data (the class's lesson) arrives in a second
  // round: wait until no query is loading (src/api/client.ts).
  await page.waitForFunction(
    () => (window as unknown as { __euQueries?: { isFetching(): number } }).__euQueries?.isFetching() === 0,
  );
  await page.waitForTimeout(400);
}

/** Python, once the editor has laid out its gutter (a busy machine measures it late). */
async function openPython(page: Page) {
  await nav(page, "Python");
  await page.locator(".cm-editor .cm-lineNumbers .cm-gutterElement").nth(1).waitFor();
  await page.waitForFunction(() => {
    const el = document.querySelectorAll(".cm-lineNumbers .cm-gutterElement")[1];
    const line = document.querySelector(".cm-line");
    if (!el || !line) return false;
    // The gutter's numbers sit level with the text's lines.
    return Math.abs(el.getBoundingClientRect().top - line.getBoundingClientRect().top) < 1;
  });
  await page.waitForTimeout(200);
}

/** The classroom screen (Ctrl+Maj+H), on one of its modes. */
async function openScene(page: Page, mode: string) {
  await page.keyboard.press("Control+Shift+H");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: mode, exact: true }).click();
  await dialog.focus();
}

export async function nav(page: Page, label: string) {
  await page.getByRole("navigation").getByRole("button", { name: label, exact: false }).first().click();
  await settle(page);
}

export const SCREENS: Array<{ name: string; go: (page: Page) => Promise<void> }> = [
  { name: "dashboard", go: async () => {} },
  {
    // A teacher's first days: one class, already over; no reminders or links yet.
    name: "dashboard-sparse",
    go: async (p) => {
      await p.goto("/?sparse");
      await p.waitForLoadState("networkidle");
      await settle(p);
    },
  },
  { name: "courses", go: (p) => nav(p, "Cours") },
  {
    name: "course-detail",
    go: async (p) => {
      await nav(p, "Cours");
      await p.getByText("Mathématiques", { exact: true }).first().click();
      await settle(p);
    },
  },
  {
    name: "class-content",
    go: async (p) => {
      await p
        .getByRole("button", { name: /MATHEMATIQUES · 2NDE7/ })
        .first()
        .click();
      await settle(p);
    },
  },
  { name: "documents", go: (p) => nav(p, "Documents") },
  { name: "reminders", go: (p) => nav(p, "Rappels") },
  { name: "whiteboard", go: (p) => nav(p, "Tableau blanc") },
  {
    // A board saved by an older Euclide (format 2), opened in format 3.
    name: "board",
    go: async (p) => {
      await p.keyboard.press("Control+k");
      await p.getByRole("textbox", { name: /Rechercher un cours/ }).fill("Vecteurs");
      await p.getByRole("dialog").getByText("Tableau — Vecteurs.euboard").click();
      await settle(p);
    },
  },
  {
    // The four instruments, placed where they cover each other least.
    name: "board-instruments",
    go: async (p) => {
      await nav(p, "Tableau blanc");
      const palette = p.getByRole("toolbar", { name: /Outils/ });
      for (const name of ["Règle", "Équerre", "Rapporteur", "Compas"])
        await palette.getByRole("button", { name }).click();
      await settle(p);
    },
  },
  { name: "python", go: (p) => openPython(p) },
  {
    name: "python-templates",
    go: async (p) => {
      await openPython(p);
      await p.getByRole("button", { name: "Nouveau script" }).first().click();
      await settle(p);
    },
  },
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
    // What changed, version after version, with its pictures (from Réglages).
    name: "news",
    go: async (p) => {
      await p.keyboard.press("Control+Comma");
      await settle(p);
      await p.getByRole("button", { name: "Voir", exact: true }).click();
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
      await p.getByRole("textbox", { name: /Rechercher un cours/ }).fill("fonc");
      // The search is debounced and asynchronous: wait for its results.
      await p.getByText("Fonction carré — cours").waitFor();
      await settle(p);
    },
  },
  {
    // The classroom screen, full screen: a name drawn from the class in progress.
    name: "scene-draw",
    go: async (p) => {
      await openScene(p, "Tirage");
      await p.keyboard.press("Space");
      await settle(p);
    },
  },
  {
    name: "scene-groups",
    go: async (p) => {
      await openScene(p, "Groupes");
      await p.getByRole("dialog").getByRole("button", { name: "Faire les groupes" }).click();
      await settle(p);
    },
  },
  {
    name: "scene-qr",
    go: async (p) => {
      await nav(p, "Outils");
      await p.getByRole("button", { name: "Afficher en QR code — Capytale" }).click();
      await p
        .getByRole("dialog")
        .getByRole("img", { name: /^QR code de / })
        .waitFor();
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
