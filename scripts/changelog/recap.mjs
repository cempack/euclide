// The release's recap image, in the manner of Apple's « everything new »
// pages: a title, then tiles of every size, each a headline, a line and a
// real screenshot (capture.mjs makes them), and « Et aussi » for the rest.
//
//   node scripts/changelog/recap.mjs <shots-dir> <out.png>
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const shots = resolve(process.argv[2] ?? "changelog-shots");
const out = resolve(process.argv[3] ?? "recap.png");
const img = (name) => `file://${shots}/${name}.png`;
/**
 * A region of a full screenshot (1440 × 900 page pixels), framed in a box
 * `width` pixels wide: the screenshot scaled, shifted, clipped.
 */
const region = (name, { x, y, w, h }, width, style = "") => {
  const k = width / w;
  return `<div class="region" style="height: ${Math.round(h * k)}px; ${style}"><img src="${img(name)}" style="width: ${Math.round(
    1440 * k,
  )}px; margin: ${Math.round(-y * k)}px 0 0 ${Math.round(-x * k)}px"></div>`;
};
const font = (pkg, w) =>
  `file://${root}/node_modules/@fontsource/${pkg}/files/${pkg}-latin-${w}-normal.woff2`;

const ALSO = [
  "Onglets qu'on glisse, épingle, ferme par lots",
  "Raccourcis qui marchent sur un clavier français",
  "Navigation complète au clavier",
  "Contrastes WCAG 2.1 AA, clair comme sombre",
  "Nouvelle version annoncée dans la barre d'état",
  "Rappels annulables et modifiables sur place",
  "Recherche dans le texte des documents",
  "Aperçus des documents en grille",
  "Notes exportées en vrai PDF, A4",
  "Modèles de notes : cours, exercices, évaluation…",
  "Formules seules sur leur ligne, centrées",
  "Courbes f(x) tracées sur le tableau",
  "Fonds Seyès, petits carreaux, points, repère",
  "Tableau exporté en PNG et en PDF",
  "input() interactif, bouton Stop, limite de temps",
  "Éditeur Python avec complétion et recherche",
  "Pronote : la semaine en une seule requête",
  "Cahier de textes sur 4 semaines, 3 mois, l'année",
  "Écran gardé allumé pendant les cours",
  "Rien de perdu à la fermeture de la fenêtre",
  "Sauvegardes visibles et restaurables dans Réglages",
  "Python s'arrête avec Euclide, même après un plantage",
  "Démarrage et changements d'onglet plus rapides",
  "Barre latérale repliable en rail d'icônes",
];

const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
@font-face { font-family: Plex; font-weight: 400; src: url(${font("ibm-plex-sans", 400)}); }
@font-face { font-family: Plex; font-weight: 500; src: url(${font("ibm-plex-sans", 500)}); }
@font-face { font-family: Plex; font-weight: 600; src: url(${font("ibm-plex-sans", 600)}); }
@font-face { font-family: Plex; font-weight: 700; src: url(${font("ibm-plex-sans", 700)}); }
@font-face { font-family: PlexMono; font-weight: 500; src: url(${font("ibm-plex-mono", 500)}); }
@font-face { font-family: PlexMono; font-weight: 600; src: url(${font("ibm-plex-mono", 600)}); }
:root { --ink: #111213; --muted: #4e5257; --faint: #6a6e72; --accent: #0f4fa8; --paper: #fff; --page: #ece9e4; --line: rgba(16,12,8,.08); }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; padding: 64px 48px 48px; background: var(--page); font-family: Plex; color: var(--ink); -webkit-font-smoothing: antialiased; }
.eyebrow { font-family: PlexMono; font-weight: 600; font-size: 14px; letter-spacing: .24em; color: var(--accent); }
h1 { margin-top: 14px; font-size: 92px; line-height: .95; font-weight: 700; letter-spacing: -.035em; }
h1 span { color: var(--accent); }
.lede { margin-top: 22px; max-width: 860px; font-size: 23px; line-height: 1.4; color: var(--muted); letter-spacing: -.005em; }
.grid { margin-top: 44px; display: grid; grid-template-columns: repeat(6, 1fr); grid-auto-rows: 236px; gap: 16px; }
.tile { position: relative; overflow: hidden; border-radius: 26px; background: var(--paper); box-shadow: 0 1px 0 rgba(16,12,8,.04), 0 1px 3px rgba(16,12,8,.06); padding: 26px 28px; display: flex; flex-direction: column; }
.tile.dark { background: #141414; color: #ecEAe6; }
.tile.dark .sub { color: #a09d97; }
.tile.accent { background: var(--accent); color: #fff; }
.tile.accent .sub { color: rgba(255,255,255,.78); }
.t { font-size: 27px; line-height: 1.12; font-weight: 600; letter-spacing: -.02em; }
.sub { margin-top: 8px; font-size: 15.5px; line-height: 1.4; color: var(--muted); max-width: 46ch; }
.shot { margin-top: auto; border-radius: 12px; overflow: hidden; border: 1px solid var(--line); background: #fff; }
.shot img { display: block; width: 100%; height: 100%; object-fit: cover; }
.bleed { position: absolute; left: 28px; right: -2px; bottom: -2px; border-radius: 12px 0 0 0; overflow: hidden; border: 1px solid var(--line); }
.bleed img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: left top; }
.crop { margin-top: auto; overflow: hidden; border-radius: 10px; }
.region { margin-top: auto; overflow: hidden; border-radius: 12px; border: 1px solid var(--line); }
.region img { display: block; max-width: none; }
.crop img { display: block; height: auto; max-width: none; }
.pair { position: absolute; left: 28px; right: 28px; bottom: -40px; height: 300px; }
.pair img { position: absolute; width: 74%; border-radius: 10px; box-shadow: 0 18px 50px -12px rgba(0,0,0,.45); }
.pair img:first-child { left: 0; top: 0; }
.pair img:last-child { right: 0; top: 46px; }
.c2 { grid-column: span 2; } .c3 { grid-column: span 3; } .c4 { grid-column: span 4; } .c6 { grid-column: span 6; }
.r2 { grid-row: span 2; }
.big { font-size: 120px; font-weight: 700; letter-spacing: -.05em; line-height: .9; }
.clock { font-family: PlexMono; font-weight: 600; font-size: 104px; letter-spacing: -.02em; line-height: 1; margin-top: auto; }
.also { display: grid; grid-template-columns: repeat(3, 1fr); gap: 11px 28px; margin-top: 18px; }
.also div { font-size: 15.5px; line-height: 1.35; padding-left: 20px; position: relative; color: var(--ink); }
.also div::before { content: ""; position: absolute; left: 2px; top: .52em; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); }
.foot { margin-top: 28px; display: flex; justify-content: space-between; font-family: PlexMono; font-size: 13px; color: var(--faint); letter-spacing: .02em; }
</style></head><body>
  <div class="eyebrow">EUCLIDE · BUREAU D'ENSEIGNEMENT</div>
  <h1>Euclide <span>0.4</span></h1>
  <p class="lede">Un tableau blanc avec ses instruments, des séances qui s'ouvrent en un clic, Python qui dessine et corrige, et un nouveau design repensé jusque dans les détails.</p>
  <div class="grid">
    <section class="tile c4 r2">
      <div class="t">Le tableau blanc a ses instruments.</div>
      <p class="sub">Règle, équerre, rapporteur et compas, à leur vraie taille et lisibles à tout zoom. Les tracés s'accrochent aux points.</p>
      <div class="bleed" style="top: 128px"><img src="${img("part-tableau")}" style="object-position: 0 70%"></div>
    </section>
    <section class="tile c2 accent">
      <div class="t">La séance, en un clic.</div>
      <p class="sub">« Ouvrir la séance » ouvre ce que prévoit l'étape.</p>
      <div class="crop" style="height: 92px"><img src="${img("part-maintenant")}" style="width: 168%"></div>
    </section>
    <section class="tile c2">
      <div class="big">14</div>
      <div class="t" style="margin-top: 12px">modèles de scripts</div>
      <p class="sub">Du premier input() à la classe Pile.</p>
    </section>

    <section class="tile c3 r2 dark">
      <div class="t">Python dessine.</div>
      <p class="sub">La tortue et les graphiques de matplotlib, directement dans Euclide. input() pose sa question dans la console.</p>
      <div class="shot" style="height: 318px; border-color: #2a2a2a"><img src="${img("part-tortue")}" style="object-position: center"></div>
    </section>
    <section class="tile c3 r2 dark">
      <div class="t">« Vérifier » corrige.</div>
      <p class="sub">Les exemples écrits sous une fonction deviennent des vérifications : réussi, ou l'attendu face à l'obtenu.</p>
      ${region("python-verifier", { x: 444, y: 140, w: 716, h: 440 }, 488, "border-color: #2a2a2a")}
    </section>

    <section class="tile c4 r2">
      <div class="t">Une note devient un diaporama.</div>
      <p class="sub">Une ligne « --- » sépare deux diapositives ; formules et code à la taille de l'écran. F5, et c'est parti.</p>
      <div class="bleed" style="top: 128px"><img src="${img("part-diapo")}"></div>
    </section>
    <section class="tile c2 dark">
      <div class="t">L'horloge de classe.</div>
      <p class="sub">Plein écran, pour le vidéoprojecteur.</p>
      <div class="clock">10:40</div>
    </section>
    <section class="tile c2">
      <div class="t">Ctrl K trouve tout.</div>
      <p class="sub">Documents, notes, cours, et ce qu'ils contiennent.</p>
      <div class="crop" style="height: 84px; border-radius: 10px; border: 1px solid var(--line)"><img src="${img("part-palette")}" style="width: 150%"></div>
    </section>

    <section class="tile c2 r2">
      <div class="t">Des courbes, des diagrammes.</div>
      <p class="sub">plot, bar, hist… au style d'Euclide, enregistrables dans la bibliothèque.</p>
      <div class="shot" style="height: 270px"><img src="${img("part-courbe")}" style="object-fit: contain; background: #fff"></div>
    </section>
    <section class="tile c4 r2">
      <div class="t">Des progressions prêtes pour la classe.</div>
      <p class="sub">Chaque étape garde ses documents, notes, tableaux et scripts ; chaque classe sait où elle en est.</p>
      <div class="bleed" style="top: 128px"><img src="${img("part-progression")}"></div>
    </section>

    <section class="tile c4 r2 accent">
      <div class="t">Un nouveau design.</div>
      <p class="sub">Les mêmes couleurs, en plus lisible : la sélection en papier relevé, une seule famille d'icônes, un thème sombre soigné.</p>
      <div class="pair">
        <img src="${img("tableau-de-bord")}">
        <img src="${img("tableau-de-bord-sombre")}">
      </div>
    </section>
    <section class="tile c2 r2">
      <div class="t">Le cahier de textes, par semaine.</div>
      <p class="sub">Pronote sur 4 semaines, 3 mois ou l'année ; le texte se copie.</p>
      ${region("cahier-de-textes", { x: 250, y: 44, w: 560, h: 470 }, 300)}
    </section>

    <section class="tile c6" style="grid-row: span 2">
      <div class="t">Et aussi.</div>
      <div class="also">${ALSO.map((a) => `<div>${a}</div>`).join("")}</div>
    </section>
  </div>
  <div class="foot"><span>Euclide 0.4 · octobre 2026</span><span>Windows · Linux · portable sur clé USB</span></div>
</body></html>`;

writeFileSync(resolve(dirname(out), "recap.html"), html);
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(`file://${resolve(dirname(out), "recap.html")}`);
await page.evaluate(() => globalThis.document.fonts.ready);
await page.waitForTimeout(300);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log("✓", out);
