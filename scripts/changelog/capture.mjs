// Screenshots for a release's changelog, from the dev server's sample data
// (npm run dev), on the visual tests' frozen Tuesday morning. Python runs
// replay what the real runner did (run-events.mjs writes run-events.json).
//
//   node scripts/changelog/capture.mjs [out-dir] [shot…]
//
// Writes <name>.png at twice 1440 × 900 (a few in a narrower window), and
// part-<name>.png cut-outs, in scripts/changelog/shots unless told otherwise
// (the recap page reads them from there).
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] ?? resolve(here, "shots"));
mkdirSync(out, { recursive: true });
const recorded = JSON.parse(readFileSync(resolve(here, "run-events.json"), "utf8"));
const NOW = new Date("2026-10-06T10:40:00");
// The release the changelog tells of (its first heading): the version the
// pictures show, in the sidebar and the status bar.
const release = readFileSync(resolve(here, "../../CHANGELOG.md"), "utf8").match(/^## (\d+\.\d+\.\d+)/m)[1];

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);

async function open(theme = "light", viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.clock.install({ time: NOW });
  await page.addInitScript(
    ([runs, version]) => {
      let seed = 42;
      Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      // And the classroom screen's draws: the same names in every picture.
      crypto.getRandomValues = (array) => {
        if (array instanceof Uint32Array)
          for (let i = 0; i < array.length; i++) array[i] = Math.random() * 2 ** 32;
        return array;
      };
      localStorage.setItem("eu:theme", "auto");
      localStorage.setItem("eu:density", "comfortable");
      globalThis.__euRecordedRuns = runs;
      globalThis.__euRelease = version;
    },
    [recorded, release],
  );
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
  await page.goto("http://localhost:1420/");
  await settle(page);
  return page;
}

async function settle(page, extra = 400) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => globalThis.document.fonts.ready);
  await page.waitForFunction(() => globalThis.__euQueries?.isFetching() === 0);
  await page.waitForTimeout(extra);
}

const nav = async (page, label) => {
  await page.getByRole("navigation").getByRole("button", { name: label, exact: false }).first().click();
  await settle(page);
};

/** A script open, with a taller output pane (as a teacher drags it). */
const python = async (page, script) => {
  await nav(page, "Python");
  await page.getByRole("button", { name: script, exact: true }).first().click();
  await settle(page, 300);
  const bar = await page.getByRole("separator", { name: /Redimensionner|console/i }).boundingBox();
  if (bar) {
    await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.mouse.move(bar.x + bar.width / 2, bar.y - 240, { steps: 8 });
    await page.mouse.up();
  }
};
/** A lesson as a teacher writes it, for the note's screenshot. */
const LESSON = `## Définition

La fonction carré est la fonction $f$ définie sur $\\mathbb{R}$ par $f(x) = x^2$.

## Variations

- $f$ est **décroissante** sur $]-\\infty ; 0]$ et **croissante** sur $[0 ; +\\infty[$.
- Son minimum vaut $0$, atteint en $x = 0$.

## Propriétés

Pour tout réel $x$, $(-x)^2 = x^2$ : la courbe est symétrique par rapport à l'axe des ordonnées.

Pour tous réels $a$ et $b$ :

$$a^2 - b^2 = (a - b)(a + b)$$

## Résoudre $x^2 = k$

- si $k < 0$, aucune solution ;
- si $k = 0$, une seule : $x = 0$ ;
- si $k > 0$, deux : $x = -\\sqrt{k}$ et $x = \\sqrt{k}$.
`;

/** The pointer out of the way: no tooltip in the picture. */
const away = (page) => page.mouse.move(1430, 450);

/** The lesson again, with a table of values and the photo of the board. */
const LESSON_TABLE = `## Tableau de valeurs

| $x$ | $-2$ | $-1$ | $0$ | $1$ | $2$ |
| --- | ---: | ---: | ---: | ---: | ---: |
| $f(x) = x^2$ | $4$ | $1$ | $0$ | $1$ | $4$ |

## La courbe

![Photo du tableau|420](eufile://file/8)

La courbe de $f$ est une **parabole**, symétrique par rapport à l'axe des ordonnées.

## À retenir

- [x] $f$ est décroissante sur $]-\\infty ; 0]$
- [x] $f$ est croissante sur $[0 ; +\\infty[$
- [ ] Exercices 12 à 15 p. 87
`;

/** The classroom screen (Ctrl+Maj+H), on one of its modes. */
const scene = async (page, mode) => {
  await page.keyboard.press("Control+Shift+H");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: mode, exact: true }).click();
  await dialog.focus();
  return dialog;
};

/** The exercise sheet open, the side panel closed, the pages laid out. */
async function pdfOpen() {
  const page = await open();
  await nav(page, "Documents");
  await page.getByText("Évaluation — Statistiques.pdf").first().click();
  await page.locator(".eu-pdf-page").first().waitFor();
  await settle(page, 1500);
  return page;
}

/** Where a point of the PDF's first page (595 × 842, from the top left) is on the screen. */
async function pagePoint(page) {
  const box = await page.locator(".eu-pdf-page").first().boundingBox();
  const s = box.width / 595;
  return (x, y) => [box.x + x * s, box.y + y * s];
}

const SHOTS = {
  "tableau-de-bord": async () => open(),
  "tableau-de-bord-sombre": async () => open("dark"),
  seance: async () => {
    const page = await open();
    await nav(page, "Cours");
    await page.getByText("Mathématiques", { exact: true }).first().click();
    await settle(page);
    return page;
  },
  "cahier-de-textes": async () => {
    const page = await open();
    await page
      .getByRole("button", { name: /MATHEMATIQUES · 2NDE7/ })
      .first()
      .click();
    await settle(page);
    return page;
  },
  // A lesson's figure on Seyès paper: triangle ABC, the protractor reading
  // the angle at A, the compass drawing an arc from B.
  "tableau-blanc": async () => {
    const page = await open();
    await nav(page, "Tableau blanc");
    await page.getByRole("button", { name: "Fond" }).click();
    await page.getByRole("menuitem", { name: "Seyès" }).click();
    const board = await page.locator(".eu-board").boundingBox();
    const at = (x, y) => ({ x: board.x + x, y: board.y + y });
    const drag = async (from, to, steps = 12) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps });
      await page.mouse.up();
    };
    const center = async (locator) => {
      const b = await locator.boundingBox();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    };
    const palette = page.getByRole("toolbar", { name: /Outils/ });
    const [A, B, C] = [at(300, 590), at(842, 590), at(520, 252)];
    await palette.getByRole("button", { name: "Segment" }).click();
    await drag(A, B);
    await drag(B, C);
    await drag(C, A);
    await palette.getByRole("button", { name: "Texte" }).click();
    for (const [p, name, dx, dy] of [
      [A, "A", -34, 6],
      [B, "B", 14, 6],
      [C, "C", -10, -46],
    ]) {
      await page.mouse.click(p.x + dx, p.y + dy);
      await page.keyboard.type(name);
      await page.keyboard.press("Enter");
    }
    await palette.getByRole("button", { name: "Rapporteur" }).click();
    const grip = (label) => page.locator(`circle.eu-board-grip-hit[aria-label^="${label}"]`).first();
    await drag(await center(grip("Déplacer")), A);
    const len = Math.hypot(C.x - A.x, C.y - A.y);
    const reach = 6.5 * (96 / 2.54) + 0.5 * (96 / 2.54);
    await drag(await center(grip("Lire un angle")), {
      x: A.x + ((C.x - A.x) / len) * reach,
      y: A.y + ((C.y - A.y) / len) * reach,
    });
    await palette.getByRole("button", { name: "Compas" }).click();
    await drag(await center(grip("Pointe sèche")), B);
    await drag(await center(grip("Mine")), { x: B.x - 230, y: B.y });
    // Turn the handle around B: the pencil draws an arc above the base.
    const handle = await center(grip("Tourner pour tracer"));
    const a0 = Math.atan2(handle.y - B.y, handle.x - B.x);
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    for (let i = 1; i <= 24; i++) {
      const a = a0 + (i * 4 * Math.PI) / 180;
      await page.mouse.move(B.x + 200 * Math.cos(a), B.y + 200 * Math.sin(a));
    }
    await page.mouse.up();
    await palette.getByRole("button", { name: /Main/ }).click();
    await page.mouse.move(board.x + board.width - 10, board.y + 10);
    await settle(page);
    return page;
  },
  // The sample lesson, written out: headings, a list, LaTeX inline and on
  // its own line, side by side with what it gives.
  note: async () => {
    const page = await open();
    await nav(page, "Documents");
    await page.getByText("Fonction carré — cours").first().click();
    await settle(page, 400);
    await page.locator("main textarea").first().fill(LESSON);
    await away(page);
    await settle(page, 800);
    return page;
  },
  diaporama: async () => {
    const page = await open("dark");
    await nav(page, "Documents");
    await page.getByText("Fonction carré — cours").first().click();
    await settle(page, 800);
    await page.keyboard.press("F5");
    await page.waitForTimeout(500);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(800);
    return page;
  },
  "python-tortue": async () => {
    const page = await open();
    await python(page, "Rosace");
    await page.getByRole("button", { name: "Exécuter", exact: true }).click();
    await away(page);
    await page.waitForTimeout(4000);
    return page;
  },
  "python-koch": async () => {
    const page = await open();
    await python(page, "Flocon de Koch");
    await page.getByRole("button", { name: "Exécuter", exact: true }).click();
    await away(page);
    await page.waitForTimeout(5000);
    return page;
  },
  "python-mandelbrot": async () => {
    const page = await open();
    await python(page, "Ensemble de Mandelbrot");
    await page.getByRole("button", { name: "Exécuter", exact: true }).click();
    await away(page);
    await page.waitForTimeout(1500);
    return page;
  },
  "python-galton": async () => {
    const page = await open("dark");
    await python(page, "Planche de Galton");
    await page.getByRole("button", { name: "Exécuter", exact: true }).click();
    await away(page);
    await page.waitForTimeout(1500);
    return page;
  },
  "python-courbe": async () => {
    const page = await open("dark");
    await python(page, "Courbe d'une fonction");
    await page.getByRole("button", { name: "Exécuter", exact: true }).click();
    await away(page);
    await page.waitForTimeout(1500);
    return page;
  },
  "python-verifier": async () => {
    const page = await open();
    await python(page, "Moyenne et mention");
    await page.getByRole("button", { name: "Vérifier", exact: true }).click();
    await away(page);
    await page.waitForTimeout(1500);
    return page;
  },
  "python-modeles": async () => {
    const page = await open();
    await nav(page, "Python");
    await page.getByRole("button", { name: "Nouveau script" }).first().click();
    await page
      .getByRole("tab", { name: /Terminale/ })
      .first()
      .click();
    await away(page);
    await settle(page);
    return page;
  },
  // The library as a grid of previews, its PDFs only.
  documents: async () => {
    const page = await open();
    await nav(page, "Documents");
    await page.getByRole("radio", { name: /Grille/ }).click();
    await page.getByRole("button", { name: /^PDF/ }).first().click();
    await away(page);
    await settle(page, 800);
    return page;
  },
  pdf: async () => {
    const page = await open();
    await nav(page, "Documents");
    await page.getByText("Évaluation — Statistiques.pdf").first().click();
    await away(page);
    await settle(page, 2500);
    return page;
  },
  // 0.6: an exercise sheet corrected on screen: a highlight, an underline, a
  // circled value, an arrow and a note; the highlighter's ways in the toolbar.
  "pdf-annoter": async () => {
    const page = await pdfOpen();
    const at = await pagePoint(page);
    const tool = (name) => page.getByRole("button", { name, exact: true }).click();
    const drag = async (from, to, steps = 12) => {
      await page.mouse.move(...from);
      await page.mouse.down();
      for (let i = 1; i <= steps; i++)
        await page.mouse.move(
          from[0] + ((to[0] - from[0]) * i) / steps,
          from[1] + ((to[1] - from[1]) * i) / steps,
        );
      await page.mouse.up();
      await page.waitForTimeout(1000);
    };
    // Points of the sheet (595 × 842 points, from the top left): « Voici les
    // notes… de 28 élèves » on y 227, the « 28 » at x 271, question 1 on y 308.
    await tool("Surligneur");
    await drag(at(52, 227), at(260, 227));
    await page.getByRole("button", { name: "Souligner", exact: true }).click();
    await drag(at(68, 308), at(232, 308));
    await tool("Stylo");
    const ring = [];
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * 2 * Math.PI;
      ring.push(at(271 + 14 * Math.cos(t), 226 + 10 * Math.sin(t)));
    }
    await page.mouse.move(...ring[0]);
    await page.mouse.down();
    for (const p of ring.slice(1)) await page.mouse.move(...p);
    await page.mouse.up();
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: "Formes", exact: true }).click();
    await page.getByRole("menuitem", { name: "Flèche" }).click();
    await drag(at(384, 252), at(290, 232));
    await tool("Texte");
    // Right of the table, where the sheet is blank.
    await page.mouse.click(...at(386, 244));
    await page.keyboard.type("Vérifier la somme des effectifs");
    // Another tool: the note is finished, and the highlighter shows its ways.
    await tool("Surligneur");
    await page.keyboard.press("Escape");
    await away(page);
    await settle(page, 800);
    return page;
  },
  // 0.6: the same sheet presented, a stroke drawn in class.
  "pdf-presenter": async () => {
    const page = await pdfOpen();
    await page.keyboard.press("F5");
    await page.locator(".eu-pdf-present-bar").waitFor();
    await page.waitForTimeout(800);
    await page.getByRole("toolbar", { name: "Présenter" }).getByRole("button", { name: "Stylo" }).click();
    const sheet = await page.locator(".eu-pdf-page").first().boundingBox();
    const s = sheet.width / 595;
    const ring = [];
    for (let i = 0; i <= 28; i++) {
      const t = (i / 28) * 2 * Math.PI;
      // The « 28 » of « une classe de 28 élèves ».
      ring.push([sheet.x + s * (271 + 16 * Math.cos(t)), sheet.y + s * (226 + 11 * Math.sin(t))]);
    }
    await page.mouse.move(...ring[0]);
    await page.mouse.down();
    for (const p of ring.slice(1)) await page.mouse.move(...p);
    await page.mouse.up();
    await page.waitForTimeout(1200);
    await page.mouse.move(720, 860);
    await settle(page, 600);
    return page;
  },
  // 0.6: the « Pages » menu, on the page in view.
  "pdf-pages": async () => {
    const page = await pdfOpen();
    await page.getByRole("button", { name: "Pages", exact: true }).click();
    await page.getByRole("menu").waitFor();
    await settle(page, 400);
    return page;
  },
  // 0.5: three names drawn from the class in progress.
  tirage: async () => {
    const page = await open("dark");
    await scene(page, "Tirage");
    for (let i = 0; i < 3; i++) await page.keyboard.press("Space");
    await away(page);
    await page.waitForTimeout(600);
    return page;
  },
  // The class in groups of four.
  groupes: async () => {
    const page = await open("dark");
    const dialog = await scene(page, "Groupes");
    await dialog.getByRole("button", { name: "Faire les groupes" }).click();
    await dialog.getByRole("button", { name: "Un de plus" }).click();
    await dialog.getByRole("button", { name: "Un de plus" }).click();
    await away(page);
    await page.waitForTimeout(600);
    return page;
  },
  // A link of Outils as a QR code, for phones to scan.
  "qr-code": async () => {
    const page = await open("dark");
    await nav(page, "Outils");
    await page.getByRole("button", { name: "Afficher en QR code — Capytale" }).click();
    await page
      .getByRole("dialog")
      .getByRole("img", { name: /^QR code de / })
      .waitFor();
    await away(page);
    await page.waitForTimeout(600);
    return page;
  },
  // A note with a table of values, a picture and a task list.
  "note-tableau": async () => {
    const page = await open();
    await nav(page, "Documents");
    await page.getByText("Fonction carré — cours").first().click();
    await settle(page, 400);
    await page.locator("main textarea").first().fill(LESSON_TABLE);
    await away(page);
    await settle(page, 1200);
    return page;
  },
  // A parabola on the axes, its roots worked out in formulas, one selected.
  "tableau-formules": async () => {
    const page = await open();
    await nav(page, "Tableau blanc");
    const palette = page.getByRole("toolbar", { name: /Outils/ });
    await palette.getByRole("button", { name: "Courbe d'une fonction" }).click();
    await page.getByRole("textbox", { name: "Expression de f(x)" }).fill("x^2 - 4x + 3");
    await page.getByRole("button", { name: "Tracer" }).click();
    await settle(page, 300);
    const board = await page.locator(".eu-board").boundingBox();
    await palette.getByRole("button", { name: "Formule (LaTeX)" }).click();
    // On the left of the axes, where the curve leaves room.
    for (const [x, y, tex] of [
      [150, 40, "f(x) = x^2 - 4x + 3"],
      [150, 115, "\\Delta = b^2 - 4ac = 4"],
      [150, 190, "x_1 = \\frac{-b - \\sqrt{\\Delta}}{2a} = 1"],
      [150, 290, "x_2 = \\frac{-b + \\sqrt{\\Delta}}{2a} = 3"],
    ]) {
      await page.mouse.click(board.x + x, board.y + y);
      await page.getByRole("textbox", { name: "Formule en LaTeX" }).fill(tex);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
    }
    await palette.getByRole("button", { name: /^Sélection/ }).click();
    await page.mouse.click(board.x + 170, board.y + 210);
    await away(page);
    await settle(page, 800);
    return page;
  },
  horloge: async () => {
    const page = await open("dark");
    await page.keyboard.press("Control+Shift+H");
    await page.waitForTimeout(1000);
    return page;
  },
  // Five minutes started, 1 min 48 s gone: the ring, the digits, the
  // controls faded away as they do when the mouse rests.
  minuteur: async () => {
    const page = await open("dark");
    await page.keyboard.press("Control+Shift+H");
    await page.waitForTimeout(500);
    await page.keyboard.press("5");
    await away(page);
    await page.clock.runFor(108_000);
    await page.waitForTimeout(800);
    return page;
  },
  palette: async () => {
    const page = await open();
    await page.keyboard.press("Control+k");
    await page.getByRole("textbox", { name: /Rechercher un cours/ }).fill("fonc");
    await page.getByText("Fonction carré — cours").waitFor();
    await settle(page);
    return page;
  },
  reglages: async () => {
    const page = await open();
    await page.keyboard.press("Control+Comma");
    await settle(page);
    return page;
  },
  // In a narrower window, where the panel's words and buttons sit closer.
  sauvegardes: async () => {
    const page = await open("light", { width: 1120, height: 860 });
    await page.keyboard.press("Control+Comma");
    await settle(page);
    await page.getByRole("button", { name: "Sauvegardes" }).first().click();
    await away(page);
    await settle(page, 600);
    return page;
  },
};

/** Parts of a screen, cut out for the recap image (part-<name>.png). */
const PARTS = {
  "tableau-de-bord": { maintenant: (p) => p.locator("main section.eu-panel:visible").first() },
  seance: { progression: (p) => p.locator(".eu-panel").filter({ hasText: "Progression" }).first() },
  "tableau-blanc": { tableau: (p) => p.locator(".eu-board") },
  diaporama: { diapo: (p) => p.locator(".eu-slides") },
  "python-tortue": { tortue: (p) => p.locator("figure canvas").first() },
  "python-koch": { koch: (p) => p.locator("figure canvas").first() },
  "python-mandelbrot": { mandelbrot: (p) => p.locator("figure img").first() },
  "python-galton": { galton: (p) => p.locator("figure img").first() },
  documents: { apercus: (p) => p.locator("main").first() },
  "python-courbe": { courbe: (p) => p.locator("figure img").first() },
  "python-verifier": { verifications: (p) => p.locator(".eu-output").first() },
  "python-modeles": { modeles: (p) => p.getByRole("dialog") },
  palette: { palette: (p) => p.getByRole("dialog") },
  "cahier-de-textes": { semaine: (p) => p.locator("main section:visible").first() },
};

/** Parts the dark recap shows in the dark theme (part-<name>-dark.png). */
const DARK_PARTS = {
  "tableau-de-bord": ["maintenant", (p) => p.locator("main section.eu-panel:visible").first()],
  "python-verifier": ["verifications", (p) => p.locator(".eu-output").first()],
  "python-modeles": ["modeles", (p) => p.getByRole("dialog")],
};
const darkGo = {
  "tableau-de-bord": () => open("dark"),
  "python-verifier": async () => {
    const page = await open("dark");
    await python(page, "Moyenne et mention");
    await page.getByRole("button", { name: "Vérifier", exact: true }).click();
    await away(page);
    await page.waitForTimeout(1500);
    return page;
  },
  "python-modeles": async () => {
    const page = await open("dark");
    await nav(page, "Python");
    await page.getByRole("button", { name: "Nouveau script" }).first().click();
    await settle(page);
    return page;
  },
};

const only = process.argv.slice(3);
for (const [name, go] of Object.entries(SHOTS)) {
  if (only.length && !only.includes(name)) continue;
  const page = await go();
  await page.screenshot({ path: resolve(out, `${name}.png`) });
  for (const [part, find] of Object.entries(PARTS[name] ?? {}))
    await find(page).screenshot({ path: resolve(out, `part-${part}.png`) });
  await page.context().close();
  if (DARK_PARTS[name]) {
    const dark = await darkGo[name]();
    const [part, find] = DARK_PARTS[name];
    await find(dark).screenshot({ path: resolve(out, `part-${part}-dark.png`) });
    await dark.context().close();
  }
  console.log("✓", name);
}
await browser.close();
