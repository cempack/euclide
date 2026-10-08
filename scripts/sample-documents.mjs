// The dev data set's documents (src/dev/mock-backend.ts): real pages, so
// that browser mode, the visual tests and the changelog's screenshots show
// documents as a teacher's look — a chapter, exercises, a TP, a DM — and
// the Documents grid their previews.
//
//   node scripts/sample-documents.mjs        (no dev server needed)
//
// Writes src/dev/fixtures/docs/<id>.pdf and src/dev/fixtures/thumbs/<id>.jpg
// (page 1, 320 px wide, as the app's thumbnailer draws it).
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = resolve(root, "src/dev/fixtures/docs");
const thumbsDir = resolve(root, "src/dev/fixtures/thumbs");
mkdirSync(docsDir, { recursive: true });
mkdirSync(thumbsDir, { recursive: true });

const CSS = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { font: 11.5pt/1.45 "C059", "Nimbus Roman", "Liberation Serif", serif; color: #1a1a1a; }
  .page { width: 210mm; height: 297mm; padding: 16mm 18mm; overflow: hidden; position: relative; background: #fff; }
  .page + .page { break-before: page; }
  .head { display: flex; justify-content: space-between; align-items: baseline;
    font: 600 8.5pt/1 "Nimbus Sans", "Liberation Sans", sans-serif; letter-spacing: .12em; text-transform: uppercase;
    color: #5f5d58; border-bottom: .6pt solid #c9c5bd; padding-bottom: 2.5mm; margin-bottom: 7mm; }
  h1 { font: 700 21pt/1.15 "Nimbus Sans", "Liberation Sans", sans-serif; margin: 0 0 1.5mm; letter-spacing: -.01em; }
  .sub { font: 400 10.5pt/1.3 "Nimbus Sans", "Liberation Sans", sans-serif; color: #5f5d58; margin: 0 0 7mm; }
  h2 { font: 700 13pt/1.2 "Nimbus Sans", "Liberation Sans", sans-serif; margin: 6mm 0 2.5mm; color: #0f4fa8; }
  h3 { font: 700 11pt/1.2 "Nimbus Sans", "Liberation Sans", sans-serif; margin: 4.5mm 0 1.5mm; }
  p { margin: 0 0 2.2mm; text-align: justify; hyphens: auto; }
  .box { border: .8pt solid #0f4fa8; border-left-width: 3pt; border-radius: 1.5mm; padding: 2.5mm 4mm; margin: 3mm 0; background: #f3f7fd; }
  .box.warm { border-color: #c2410c; background: #fdf5f0; }
  .box.ok { border-color: #116b2e; background: #f1f8f3; }
  .tag { font: 700 9pt/1 "Nimbus Sans", "Liberation Sans", sans-serif; text-transform: uppercase; letter-spacing: .08em; color: #0f4fa8; margin-right: 2mm; }
  .warm .tag { color: #c2410c; } .ok .tag { color: #116b2e; }
  .ex { margin: 4mm 0 1.5mm; font: 700 11pt/1.2 "Nimbus Sans", "Liberation Sans", sans-serif; }
  .ex span { font-weight: 400; color: #5f5d58; }
  i.m { font-family: "C059", serif; font-style: italic; }
  table { border-collapse: collapse; margin: 2mm 0 3mm; font-size: 10.5pt; }
  td, th { border: .6pt solid #9c978d; padding: 1.4mm 3.2mm; text-align: center; min-width: 9mm; }
  th { background: #f1efea; font-weight: 600; }
  pre { font: 9.5pt/1.45 "Nimbus Mono PS", "Liberation Mono", monospace; background: #f6f5f1; border: .6pt solid #dedbd4;
    border-radius: 1.5mm; padding: 2.5mm 4mm; margin: 2mm 0 3mm; white-space: pre; }
  .kw { color: #7c3aed; } .fn { color: #0f4fa8; } .st { color: #116b2e; } .cm { color: #8a877f; }
  ol, ul { margin: 0 0 2.5mm; padding-left: 6mm; } li { margin-bottom: 1mm; }
  .cols { display: flex; gap: 7mm; align-items: flex-start; } .cols > * { flex: 1; }
  .foot { position: absolute; left: 18mm; right: 18mm; bottom: 10mm; display: flex; justify-content: space-between;
    font: 8pt/1 "Nimbus Sans", "Liberation Sans", sans-serif; color: #8a877f; }
  .lines { height: 6.5mm; border-bottom: .5pt dotted #b5b1a8; }
  figure { margin: 2mm 0 3mm; text-align: center; } figcaption { font-size: 9pt; color: #5f5d58; margin-top: 1mm; }
`;

/** A repère with a curve: f maps x to y; the window [x0, x1] × [y0, y1]. */
function graph(f, [x0, x1], [y0, y1], { w = 300, h = 220, label = "", color = "#0f4fa8" } = {}) {
  const X = (x) => ((x - x0) / (x1 - x0)) * w;
  const Y = (y) => h - ((y - y0) / (y1 - y0)) * h;
  let grid = "";
  for (let x = Math.ceil(x0); x <= x1; x++)
    grid += `<line x1="${X(x)}" y1="0" x2="${X(x)}" y2="${h}" stroke="#e4e1da" stroke-width="0.8"/>`;
  for (let y = Math.ceil(y0); y <= y1; y++)
    grid += `<line x1="0" y1="${Y(y)}" x2="${w}" y2="${Y(y)}" stroke="#e4e1da" stroke-width="0.8"/>`;
  const pts = [];
  for (let i = 0; i <= 200; i++) {
    const x = x0 + ((x1 - x0) * i) / 200;
    const y = f(x);
    if (Number.isFinite(y) && y >= y0 - 2 && y <= y1 + 2)
      pts.push(`${pts.length ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`);
    else if (pts.length && pts[pts.length - 1] !== "") pts.push("");
  }
  const d = pts
    .join(" ")
    .split("  ")
    .map((seg, i) => (i ? seg.replace(/^L/, "M") : seg))
    .join(" ");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="overflow:visible">${grid}
    <line x1="0" y1="${Y(0)}" x2="${w}" y2="${Y(0)}" stroke="#1a1a1a" stroke-width="1.1"/>
    <line x1="${X(0)}" y1="0" x2="${X(0)}" y2="${h}" stroke="#1a1a1a" stroke-width="1.1"/>
    <text x="${X(1) - 3}" y="${Y(0) + 13}" font-size="10" font-family="Nimbus Sans">1</text>
    <text x="${X(0) - 10}" y="${Y(1) + 4}" font-size="10" font-family="Nimbus Sans">1</text>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>
    ${label}</svg>`;
}

const head = (left, right) => `<div class="head"><span>${left}</span><span>${right}</span></div>`;
const foot = (left, n) => `<div class="foot"><span>${left}</span><span>${n}</span></div>`;

const DOCS = {
  // Chapitre 3 — Fonctions de référence
  1: `<div class="page">${head("Seconde · Mathématiques", "Chapitre 3")}
    <h1>Fonctions de référence</h1><p class="sub">La fonction carré, la fonction inverse, la fonction racine carrée.</p>
    <h2>I. La fonction carré</h2>
    <div class="box"><span class="tag">Définition</span>La <b>fonction carré</b> est la fonction <i class="m">f</i> définie sur ℝ par <i class="m">f</i>(<i class="m">x</i>) = <i class="m">x</i>².</div>
    <div class="cols"><div>
      <p>Sa courbe représentative dans un repère orthogonal est une <b>parabole</b> de sommet l'origine O du repère.</p>
      <div class="box ok"><span class="tag">Propriété</span>Pour tout réel <i class="m">x</i>, <i class="m">x</i>² ⩾ 0 et (−<i class="m">x</i>)² = <i class="m">x</i>² : la courbe est symétrique par rapport à l'axe des ordonnées.</div>
      <table><tr><th><i class="m">x</i></th><td>−∞</td><td>0</td><td>+∞</td></tr><tr><th><i class="m">f</i>(<i class="m">x</i>)</th><td>↘</td><td>0</td><td>↗</td></tr></table>
    </div><figure>${graph((x) => x * x, [-3.2, 3.2], [-1, 9.5], { w: 250, h: 250, label: '<text x="196" y="40" font-size="12" font-style="italic" fill="#0f4fa8" font-family="C059">𝒞f</text>' })}<figcaption>La parabole 𝒞f d'équation y = x².</figcaption></figure></div>
    <h3>Démonstration : la fonction carré est croissante sur [0 ; +∞[</h3>
    <p>Soient <i class="m">a</i> et <i class="m">b</i> deux réels tels que 0 ⩽ <i class="m">a</i> &lt; <i class="m">b</i>. Alors <i class="m">b</i>² − <i class="m">a</i>² = (<i class="m">b</i> − <i class="m">a</i>)(<i class="m">b</i> + <i class="m">a</i>). Or <i class="m">b</i> − <i class="m">a</i> &gt; 0 et <i class="m">b</i> + <i class="m">a</i> &gt; 0, donc <i class="m">b</i>² − <i class="m">a</i>² &gt; 0, c'est-à-dire <i class="m">a</i>² &lt; <i class="m">b</i>².</p>
    <h2>II. La fonction inverse</h2>
    <div class="box"><span class="tag">Définition</span>La <b>fonction inverse</b> est la fonction <i class="m">g</i> définie sur ℝ* = ]−∞ ; 0[ ∪ ]0 ; +∞[ par <i class="m">g</i>(<i class="m">x</i>) = 1/<i class="m">x</i>.</div>
    <p>Sa courbe est une <b>hyperbole</b>, symétrique par rapport à l'origine du repère : pour tout réel <i class="m">x</i> non nul, <i class="m">g</i>(−<i class="m">x</i>) = −<i class="m">g</i>(<i class="m">x</i>).</p>
    ${foot("Fonctions de référence", "1")}</div>`,

  // Exercices — Fonction carré
  2: `<div class="page">${head("Seconde · Mathématiques", "Feuille d'exercices")}
    <h1>Exercices — La fonction carré</h1><p class="sub">Calculer, résoudre, comparer, programmer.</p>
    <div class="ex">Exercice 1 <span>· Tableau de valeurs</span></div>
    <p>Compléter le tableau de valeurs de la fonction carré.</p>
    <table><tr><th><i class="m">x</i></th><td>−3</td><td>−2</td><td>−1,5</td><td>−1</td><td>0</td><td>0,5</td><td>1</td><td>2</td><td>3</td></tr>
    <tr><th><i class="m">x</i>²</th><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr></table>
    <div class="ex">Exercice 2 <span>· Équations</span></div>
    <p>Résoudre dans ℝ les équations suivantes.</p>
    <ol type="a"><li><i class="m">x</i>² = 16</li><li><i class="m">x</i>² = −4</li><li>(<i class="m">x</i> − 1)² = 9</li><li>3<i class="m">x</i>² − 12 = 0</li></ol>
    <div class="ex">Exercice 3 <span>· Comparer sans calculatrice</span></div>
    <p>Comparer les nombres suivants en justifiant à l'aide du sens de variation de la fonction carré.</p>
    <ol type="a"><li>1,3² et 1,31²</li><li>(−2,5)² et (−2,05)²</li><li>(√2 − 1)² et (√2 + 1)²</li></ol>
    <div class="ex">Exercice 4 <span>· Python</span></div>
    <p>On considère la fonction Python suivante.</p>
<pre><span class="kw">def</span> <span class="fn">mystere</span>(n):
    s = <span class="st">0</span>
    <span class="kw">for</span> k <span class="kw">in</span> <span class="fn">range</span>(<span class="st">1</span>, n + <span class="st">1</span>):
        s = s + k ** <span class="st">2</span>
    <span class="kw">return</span> s</pre>
    <ol><li>Que renvoie <code>mystere(3)</code> ? Détailler les étapes.</li><li>Conjecturer une formule pour <code>mystere(n)</code>.</li></ol>
    <div class="ex">Exercice 5 <span>· Problème</span></div>
    <p>Un carré a pour côté <i class="m">x</i> cm. On augmente son côté de 2 cm : son aire augmente de 24 cm². Quelle était la longueur du côté ?</p>
    <div class="lines"></div><div class="lines"></div><div class="lines"></div>
    ${foot("Exercices — Fonction carré", "1")}</div>`,

  // TP — Piles et files
  3: `<div class="page">${head("Terminale · NSI", "TP n° 4")}
    <h1>Piles et files</h1><p class="sub">Deux structures linéaires, une même interface, deux comportements.</p>
    <div class="box"><span class="tag">Objectifs</span>Implémenter une pile puis une file avec une classe Python ; distinguer l'interface (ce que l'on peut faire) de l'implémentation (comment on le fait).</div>
    <h2>Partie A — La pile</h2>
    <p>Une <b>pile</b> (<i>stack</i>) suit le principe « dernier entré, premier sorti » (LIFO) : comme une pile d'assiettes, on ne peut prendre que celle du dessus.</p>
<pre><span class="kw">class</span> <span class="fn">Pile</span>:
    <span class="kw">def</span> <span class="fn">__init__</span>(self):
        self.contenu = []

    <span class="kw">def</span> <span class="fn">est_vide</span>(self):
        <span class="kw">return</span> self.contenu == []

    <span class="kw">def</span> <span class="fn">empiler</span>(self, x):
        self.contenu.append(x)

    <span class="kw">def</span> <span class="fn">depiler</span>(self):
        <span class="kw">assert</span> <span class="kw">not</span> self.est_vide(), <span class="st">"pile vide"</span>
        <span class="kw">return</span> self.contenu.pop()</pre>
    <ol><li>Écrire une méthode <code>sommet</code> qui renvoie l'élément du dessus sans le retirer.</li>
    <li>Écrire une fonction <code>est_bien_parenthesee(texte)</code> qui utilise une pile.</li>
    <li>Quelle est la complexité de <code>empiler</code> et de <code>depiler</code> ?</li></ol>
    <h2>Partie B — La file</h2>
    <p>Une <b>file</b> (<i>queue</i>) suit le principe « premier entré, premier sorti » (FIFO), comme une file d'attente.</p>
    <svg width="520" height="64" viewBox="0 0 520 64">${[0, 1, 2, 3, 4]
      .map(
        (i) =>
          `<rect x="${110 + i * 60}" y="12" width="52" height="40" rx="4" fill="#f3f7fd" stroke="#0f4fa8" stroke-width="1.4"/><text x="${136 + i * 60}" y="38" text-anchor="middle" font-family="Nimbus Mono PS" font-size="15">${[12, 7, 31, 5, 18][i]}</text>`,
      )
      .join("")}
      <text x="96" y="38" text-anchor="end" font-family="Nimbus Sans" font-size="12" fill="#5f5d58">défiler ←</text>
      <text x="424" y="38" font-family="Nimbus Sans" font-size="12" fill="#5f5d58">← enfiler</text></svg>
    <ol start="4"><li>Implémenter une classe <code>File</code> à l'aide de deux piles.</li><li>Simuler la file d'attente d'une imprimante partagée.</li></ol>
    ${foot("TP — Piles et files", "1")}</div>`,

  // Cours — Arbres binaires
  4: `<div class="page">${head("Terminale · NSI", "Chapitre 5")}
    <h1>Arbres binaires</h1><p class="sub">Vocabulaire, mesures et parcours.</p>
    <div class="cols"><div>
    <div class="box"><span class="tag">Définition</span>Un <b>arbre binaire</b> est soit vide, soit formé d'un nœud, la <b>racine</b>, et de deux arbres binaires : ses sous-arbres <b>gauche</b> et <b>droit</b>.</div>
    <ul><li>Un nœud sans enfant est une <b>feuille</b>.</li><li>La <b>taille</b> est le nombre de nœuds.</li><li>La <b>hauteur</b> est le nombre de nœuds du plus long chemin de la racine à une feuille.</li></ul>
    </div><figure><svg width="250" height="200" viewBox="0 0 250 200">
      ${[
        [125, 22, 60, 82],
        [125, 22, 190, 82],
        [60, 82, 28, 148],
        [60, 82, 96, 148],
        [190, 82, 222, 148],
        [96, 148, 120, 190],
      ]
        .map(
          ([a, b, c, d]) =>
            `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="#5f5d58" stroke-width="1.4"/>`,
        )
        .join("")}
      ${[
        [125, 22, "A"],
        [60, 82, "B"],
        [190, 82, "C"],
        [28, 148, "D"],
        [96, 148, "E"],
        [222, 148, "F"],
        [120, 190, "G"],
      ]
        .map(
          ([x, y, t]) =>
            `<circle cx="${x}" cy="${y}" r="15" fill="${t === "A" ? "#0f4fa8" : "#fff"}" stroke="#0f4fa8" stroke-width="1.6"/><text x="${x}" y="${Number(y) + 5}" text-anchor="middle" font-family="Nimbus Sans" font-weight="700" font-size="13" fill="${t === "A" ? "#fff" : "#1a1a1a"}">${t}</text>`,
        )
        .join("")}
    </svg><figcaption>Un arbre de taille 7 et de hauteur 4.</figcaption></figure></div>
    <h2>I. Mesurer un arbre</h2>
<pre><span class="kw">def</span> <span class="fn">taille</span>(arbre):
    <span class="kw">if</span> arbre <span class="kw">is</span> <span class="kw">None</span>:
        <span class="kw">return</span> <span class="st">0</span>
    <span class="kw">return</span> <span class="st">1</span> + taille(arbre.gauche) + taille(arbre.droit)</pre>
    <h2>II. Parcourir un arbre</h2>
    <table><tr><th>Parcours</th><th>Ordre de visite</th><th>Sur l'exemple</th></tr>
    <tr><td>Préfixe</td><td>racine, gauche, droit</td><td>A B D E G C F</td></tr>
    <tr><td>Infixe</td><td>gauche, racine, droit</td><td>D B E G A C F</td></tr>
    <tr><td>Suffixe</td><td>gauche, droit, racine</td><td>D G E B F C A</td></tr>
    <tr><td>En largeur</td><td>niveau par niveau</td><td>A B C D E F G</td></tr></table>
    <div class="box ok"><span class="tag">À retenir</span>Un arbre binaire de hauteur <i class="m">h</i> a au plus 2<sup><i class="m">h</i></sup> − 1 nœuds.</div>
    ${foot("Cours — Arbres binaires", "1")}</div>`,

  // Programme de seconde (a reading of the official text, for the class)
  5: `<div class="page">${head("Mathématiques", "Classe de seconde")}
    <h1>Programme de mathématiques</h1><p class="sub">Classe de seconde générale et technologique — notes de lecture.</p>
    <h2>Intentions majeures</h2>
    <p>L'enseignement des mathématiques de la classe de seconde est conçu à partir des intentions suivantes : permettre à chaque élève de consolider les acquis du collège et une culture mathématique de base, de développer son goût des mathématiques, d'en apprécier les démarches et les objets ; préparer au choix de l'orientation ; assurer les bases mathématiques nécessaires à toutes les poursuites d'études.</p>
    <h2>Compétences mathématiques</h2>
    <ul><li><b>Chercher</b>, expérimenter — en particulier à l'aide d'outils logiciels ;</li><li><b>modéliser</b>, faire une simulation, valider ou invalider un modèle ;</li><li><b>représenter</b>, choisir un cadre, changer de registre ;</li><li><b>raisonner</b>, démontrer, trouver des résultats partiels ;</li><li><b>calculer</b>, appliquer des techniques et mettre en œuvre des algorithmes ;</li><li><b>communiquer</b> un résultat par oral ou par écrit.</li></ul>
    <h2>Organisation du programme</h2>
    <table style="width:100%"><tr><th>Partie</th><th>Contenus</th></tr>
    <tr><td>Nombres et calculs</td><td style="text-align:left">Ensembles de nombres, multiples et diviseurs, puissances, calcul littéral</td></tr>
    <tr><td>Géométrie</td><td style="text-align:left">Vecteurs, repérage, droites, géométrie dans le plan</td></tr>
    <tr><td>Fonctions</td><td style="text-align:left">Fonctions de référence, variations, extremums, signe</td></tr>
    <tr><td>Statistiques et probabilités</td><td style="text-align:left">Indicateurs, échantillonnage, modèles probabilistes</td></tr>
    <tr><td>Algorithmique et programmation</td><td style="text-align:left">Variables, boucles, fonctions en Python</td></tr></table>
    <h2>Algorithmique et programmation</h2>
    <p>La démarche algorithmique est une composante essentielle de l'activité mathématique. Le langage choisi est Python : les élèves écrivent des fonctions simples, programment des boucles bornées et non bornées, et lisent, comprennent, modifient ou complètent des programmes plus complexes.</p>
    ${foot("Programme de seconde", "1")}</div>`,

  // DM 2 — Congruences
  7: `<div class="page">${head("Terminale · Maths expertes", "À rendre le 14 octobre")}
    <h1>Devoir maison n° 2</h1><p class="sub">Congruences et divisibilité.</p>
    <div class="ex">Exercice 1 <span>· Restes</span></div>
    <p>Recopier et compléter la table des restes de la division euclidienne de <i class="m">n</i>² par 7.</p>
    <table><tr><th><i class="m">n</i> ≡ … [7]</th><td>0</td><td>1</td><td>2</td><td>3</td><td>4</td><td>5</td><td>6</td></tr>
    <tr><th><i class="m">n</i>² ≡ … [7]</th><td>0</td><td>1</td><td>4</td><td></td><td></td><td></td><td></td></tr></table>
    <p>En déduire les entiers <i class="m">n</i> tels que <i class="m">n</i>² + 3 soit divisible par 7.</p>
    <div class="ex">Exercice 2 <span>· Puissances</span></div>
    <ol><li>Montrer que 2³ ≡ 1 [7].</li><li>En déduire le reste de la division euclidienne de 2<sup>2026</sup> par 7.</li><li>Pour quels entiers naturels <i class="m">n</i> le nombre 2<sup><i class="m">n</i></sup> − 1 est-il divisible par 7 ?</li></ol>
    <div class="ex">Exercice 3 <span>· Une clé de contrôle</span></div>
    <p>Le numéro ISBN-10 d'un livre s'écrit <i class="m">a</i>₁<i class="m">a</i>₂…<i class="m">a</i>₉<i class="m">k</i>, où la clé <i class="m">k</i> est choisie pour que</p>
    <div class="box">10<i class="m">a</i>₁ + 9<i class="m">a</i>₂ + 8<i class="m">a</i>₃ + … + 2<i class="m">a</i>₉ + <i class="m">k</i> ≡ 0 [11].</div>
    <ol><li>Calculer la clé du numéro 2-07-036024-<i class="m">k</i>.</li><li>Montrer qu'une erreur sur un seul chiffre est toujours détectée.</li></ol>
    <div class="ex">Exercice 4 <span>· Python</span></div>
    <p>Écrire une fonction <code>reste_puissance(a, n, m)</code> qui renvoie le reste de <i class="m">a</i><sup><i class="m">n</i></sup> modulo <i class="m">m</i> sans calculer <i class="m">a</i><sup><i class="m">n</i></sup>.</p>
    ${foot("DM 2 — Congruences", "1")}</div>`,

  // Fiche méthode — Suites
  9: `<div class="page">${head("Première · Mathématiques", "Fiche méthode")}
    <h1>Suites : les méthodes</h1><p class="sub">Arithmétique, géométrique, sens de variation.</p>
    <div class="box"><span class="tag">Méthode 1</span><b>Montrer qu'une suite est arithmétique.</b> On calcule <i class="m">u</i><sub><i class="m">n</i>+1</sub> − <i class="m">u</i><sub><i class="m">n</i></sub> pour tout <i class="m">n</i> : si le résultat est une constante <i class="m">r</i>, la suite est arithmétique de raison <i class="m">r</i>.</div>
    <p><i>Exemple.</i> <i class="m">u</i><sub><i class="m">n</i></sub> = 3<i class="m">n</i> − 2 : <i class="m">u</i><sub><i class="m">n</i>+1</sub> − <i class="m">u</i><sub><i class="m">n</i></sub> = 3(<i class="m">n</i> + 1) − 2 − (3<i class="m">n</i> − 2) = 3. La suite est arithmétique de raison 3.</p>
    <div class="box"><span class="tag">Méthode 2</span><b>Montrer qu'une suite est géométrique.</b> Pour une suite à termes non nuls, on calcule <i class="m">u</i><sub><i class="m">n</i>+1</sub> / <i class="m">u</i><sub><i class="m">n</i></sub> : si c'est une constante <i class="m">q</i>, la suite est géométrique de raison <i class="m">q</i>.</div>
    <div class="box warm"><span class="tag">Attention</span>Calculer les trois premiers termes ne suffit pas : cela permet seulement de <b>conjecturer</b>, ou de montrer qu'une suite n'est <b>pas</b> arithmétique.</div>
    <h2>Formules à connaître</h2>
    <table style="width:100%"><tr><th></th><th>Arithmétique de raison <i class="m">r</i></th><th>Géométrique de raison <i class="m">q</i></th></tr>
    <tr><th>Terme général</th><td><i class="m">u</i><sub><i class="m">n</i></sub> = <i class="m">u</i><sub>0</sub> + <i class="m">nr</i></td><td><i class="m">u</i><sub><i class="m">n</i></sub> = <i class="m">u</i><sub>0</sub> × <i class="m">q</i><sup><i class="m">n</i></sup></td></tr>
    <tr><th>Somme</th><td>1 + 2 + … + <i class="m">n</i> = <i class="m">n</i>(<i class="m">n</i> + 1)/2</td><td>1 + <i class="m">q</i> + … + <i class="m">q</i><sup><i class="m">n</i></sup> = (1 − <i class="m">q</i><sup><i class="m">n</i>+1</sup>)/(1 − <i class="m">q</i>)</td></tr></table>
    <div class="box ok"><span class="tag">Méthode 3</span><b>Étudier le sens de variation.</b> On étudie le signe de <i class="m">u</i><sub><i class="m">n</i>+1</sub> − <i class="m">u</i><sub><i class="m">n</i></sub>, ou on compare <i class="m">u</i><sub><i class="m">n</i>+1</sub> / <i class="m">u</i><sub><i class="m">n</i></sub> à 1 pour une suite à termes strictement positifs.</div>
    <h2>Avec Python : le seuil</h2>
<pre>u, n = <span class="st">1000</span>, <span class="st">0</span>
<span class="kw">while</span> u &gt;= <span class="st">600</span>:
    u = <span class="st">0.9</span> * u + <span class="st">50</span>
    n = n + <span class="st">1</span>
<span class="fn">print</span>(n)   <span class="cm"># le premier rang où u passe sous 600</span></pre>
    ${foot("Fiche méthode — Suites", "1")}</div>`,

  // Sujet de bac NSI (a practice paper in the exam's format)
  10: `<div class="page">${head("Terminale · NSI", "Sujet d'entraînement")}
    <h1>Épreuve de NSI — Sujet type</h1><p class="sub">Durée : 3 h 30 · Trois exercices indépendants · Calculatrice non autorisée.</p>
    <div class="ex">Exercice 1 <span>· Bases de données (6 points)</span></div>
    <p>Une médiathèque gère ses emprunts avec la base suivante.</p>
    <table><tr><th colspan="4">Livre</th></tr><tr><td><u>id</u></td><td>titre</td><td>auteur</td><td>annee</td></tr>
    <tr><td>17</td><td>Les Misérables</td><td>Hugo</td><td>1862</td></tr><tr><td>23</td><td>Germinal</td><td>Zola</td><td>1885</td></tr></table>
    <ol><li>Écrire une requête SQL qui donne les titres des livres parus avant 1870.</li><li>Expliquer le rôle de la clé étrangère <code>id_livre</code> de la table <code>Emprunt</code>.</li></ol>
<pre><span class="kw">SELECT</span> titre <span class="kw">FROM</span> Livre <span class="kw">WHERE</span> annee &lt; <span class="st">1870</span> <span class="kw">ORDER BY</span> titre;</pre>
    <div class="ex">Exercice 2 <span>· Programmation objet et récursivité (8 points)</span></div>
    <p>On représente un arbre binaire de recherche par la classe <code>Noeud</code>.</p>
<pre><span class="kw">class</span> <span class="fn">Noeud</span>:
    <span class="kw">def</span> <span class="fn">__init__</span>(self, valeur, gauche=<span class="kw">None</span>, droit=<span class="kw">None</span>):
        self.valeur = valeur
        self.gauche = gauche
        self.droit = droit</pre>
    <ol><li>Écrire une fonction récursive <code>inserer(arbre, v)</code>.</li><li>Justifier que le parcours infixe d'un ABR donne ses valeurs triées.</li></ol>
    <div class="ex">Exercice 3 <span>· Réseaux et routage (6 points)</span></div>
    <p>Un réseau de cinq routeurs utilise le protocole RIP. Déterminer la table de routage du routeur A et le chemin suivi par un paquet de A vers E.</p>
    ${foot("Sujet type — NSI", "1 / 6")}</div>`,

  // Évaluation — Statistiques
  12: `<div class="page">${head("Seconde · Mathématiques", "Évaluation · 55 min")}
    <h1>Évaluation — Statistiques</h1><p class="sub">Nom : ........................................ Prénom : ........................................ Classe : 2nde 7</p>
    <div class="box warm"><span class="tag">Consignes</span>Calculatrice autorisée en mode examen. Toute réponse doit être justifiée ; la qualité de la rédaction est prise en compte.</div>
    <div class="ex">Exercice 1 <span>· Les notes du devoir (6 points)</span></div>
    <p>Voici les notes obtenues par une classe de 28 élèves.</p>
    <table><tr><th>Note</th><td>6</td><td>8</td><td>9</td><td>10</td><td>11</td><td>12</td><td>14</td><td>15</td><td>17</td></tr>
    <tr><th>Effectif</th><td>2</td><td>3</td><td>4</td><td>5</td><td>4</td><td>3</td><td>4</td><td>2</td><td>1</td></tr></table>
    <ol><li>Calculer la moyenne de la série, arrondie au dixième.</li><li>Déterminer la médiane et les quartiles <i class="m">Q</i>₁ et <i class="m">Q</i>₃.</li><li>Construire le diagramme en boîte de la série.</li></ol>
    <div class="ex">Exercice 2 <span>· Comparer deux classes (8 points)</span></div>
    <figure><svg width="520" height="96" viewBox="0 0 520 96">
      <line x1="20" y1="80" x2="500" y2="80" stroke="#1a1a1a" stroke-width="1"/>
      ${Array.from({ length: 11 }, (_, i) => `<line x1="${20 + i * 48}" y1="77" x2="${20 + i * 48}" y2="83" stroke="#1a1a1a"/><text x="${20 + i * 48}" y="94" text-anchor="middle" font-size="9" font-family="Nimbus Sans">${i * 2}</text>`).join("")}
      <g stroke="#0f4fa8" stroke-width="1.6" fill="#f3f7fd"><line x1="92" y1="22" x2="164" y2="22"/><rect x="164" y="12" width="120" height="20"/><line x1="224" y1="12" x2="224" y2="32"/><line x1="284" y1="22" x2="380" y2="22"/></g>
      <g stroke="#c2410c" stroke-width="1.6" fill="#fdf5f0"><line x1="140" y1="56" x2="212" y2="56"/><rect x="212" y="46" width="72" height="20"/><line x1="248" y1="46" x2="248" y2="66"/><line x1="284" y1="56" x2="428" y2="56"/></g>
      <text x="390" y="26" font-size="10" font-family="Nimbus Sans" fill="#0f4fa8">2nde 7</text><text x="438" y="60" font-size="10" font-family="Nimbus Sans" fill="#c2410c">2nde 3</text></svg></figure>
    <ol start="4"><li>Lire la médiane et l'écart interquartile de chaque classe.</li><li>Quelle classe a les résultats les plus homogènes ? Justifier.</li></ol>
    <div class="ex">Exercice 3 <span>· Python (6 points)</span></div>
<pre><span class="kw">def</span> <span class="fn">moyenne</span>(notes):
    <span class="kw">return</span> <span class="fn">sum</span>(notes) / <span class="fn">len</span>(notes)</pre>
    <ol start="6"><li>Écrire une fonction <code>ecart_type(notes)</code>.</li><li>Que renvoie <code>moyenne([12, 15, 9])</code> ?</li></ol>
    ${foot("Évaluation — Statistiques", "1 / 2")}</div>`,

  // Activité — Algorithmes gloutons
  13: `<div class="page">${head("Première · NSI", "Activité débranchée")}
    <h1>Algorithmes gloutons</h1><p class="sub">Rendre la monnaie, remplir un sac : faire le meilleur choix… à chaque étape.</p>
    <div class="box"><span class="tag">Principe</span>Un algorithme <b>glouton</b> construit une solution pas à pas en faisant, à chaque étape, le choix qui semble le meilleur sur le moment, sans jamais revenir en arrière.</div>
    <h2>1. Le rendu de monnaie</h2>
    <p>Un distributeur doit rendre 87 centimes avec le moins de pièces possible. Il dispose de pièces de 50, 20, 10, 5, 2 et 1 centimes.</p>
    <figure><svg width="520" height="74" viewBox="0 0 520 74">${[
      [50, 34],
      [20, 30],
      [10, 26],
      [5, 24],
      [2, 22],
    ]
      .map(
        ([v, r], i) =>
          `<circle cx="${50 + i * 100}" cy="37" r="${r}" fill="${v >= 10 ? "#e9c46a" : "#d4a373"}" stroke="#8a5300" stroke-width="1.5"/><text x="${50 + i * 100}" y="42" text-anchor="middle" font-family="Nimbus Sans" font-weight="700" font-size="14">${v}</text>`,
      )
      .join("")}</svg><figcaption>87 = 50 + 20 + 10 + 5 + 2 : cinq pièces.</figcaption></figure>
    <ol><li>Appliquer la méthode gloutonne pour rendre 63 c, puis 99 c.</li><li>Avec des pièces de 1, 3 et 4 c, rendre 6 c. Le glouton est-il optimal ?</li></ol>
    <h2>2. Le sac à dos</h2>
    <table style="width:100%"><tr><th>Objet</th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></tr>
    <tr><th>Masse (kg)</th><td>12</td><td>4</td><td>2</td><td>1</td><td>1</td></tr>
    <tr><th>Valeur (€)</th><td>4</td><td>10</td><td>2</td><td>2</td><td>1</td></tr>
    <tr><th>Valeur / masse</th><td>0,33</td><td>2,5</td><td>1</td><td>2</td><td>1</td></tr></table>
    <ol start="3"><li>Le sac supporte 15 kg. Choisir les objets par valeur/masse décroissante.</li><li>Trouver une meilleure solution : que conclure ?</li></ol>
<pre><span class="kw">def</span> <span class="fn">rendu</span>(somme, pieces):
    rendues = []
    <span class="kw">for</span> p <span class="kw">in</span> pieces:            <span class="cm"># de la plus grande à la plus petite</span>
        <span class="kw">while</span> somme &gt;= p:
            rendues.append(p)
            somme = somme - p
    <span class="kw">return</span> rendues</pre>
    ${foot("Activité — Algorithmes gloutons", "1")}</div>`,

  // Plan de travail — Vecteurs
  14: `<div class="page">${head("Seconde · Mathématiques", "Plan de travail · 2 semaines")}
    <h1>Plan de travail — Vecteurs</h1><p class="sub">Je coche quand c'est fait, je demande quand je bloque.</p>
    <table style="width:100%"><tr><th style="width:9mm">✓</th><th style="text-align:left">Étape</th><th>Où</th><th>Niveau</th></tr>
    <tr><td>☐</td><td style="text-align:left">Regarder la capsule « Translation et vecteur »</td><td>ENT</td><td>★</td></tr>
    <tr><td>☐</td><td style="text-align:left">Définition et égalité de deux vecteurs</td><td>Cours p. 2</td><td>★</td></tr>
    <tr><td>☐</td><td style="text-align:left">Exercices 1 à 4 : lire et construire des vecteurs</td><td>Fiche A</td><td>★</td></tr>
    <tr><td>☐</td><td style="text-align:left">Somme de deux vecteurs, relation de Chasles</td><td>Cours p. 3</td><td>★★</td></tr>
    <tr><td>☐</td><td style="text-align:left">Exercices 5 à 9 : construire une somme</td><td>Fiche B</td><td>★★</td></tr>
    <tr><td>☐</td><td style="text-align:left">Coordonnées d'un vecteur dans un repère</td><td>Cours p. 4</td><td>★★</td></tr>
    <tr><td>☐</td><td style="text-align:left">Colinéarité : déterminant de deux vecteurs</td><td>Cours p. 5</td><td>★★★</td></tr>
    <tr><td>☐</td><td style="text-align:left">Défi : démontrer qu'un quadrilatère est un parallélogramme</td><td>Fiche C</td><td>★★★</td></tr></table>
    <div class="cols"><div>
      <div class="box ok"><span class="tag">À savoir faire</span>
      <ul style="margin:1mm 0 0"><li>Lire les coordonnées d'un vecteur</li><li>Construire <i class="m">u</i>⃗ + <i class="m">v</i>⃗ et <i class="m">k u</i>⃗</li><li>Utiliser la relation de Chasles</li><li>Tester la colinéarité</li></ul></div>
    </div><figure><svg width="230" height="150" viewBox="0 0 230 150">
      ${Array.from({ length: 16 }, (_, i) => `<line x1="${i * 15}" y1="0" x2="${i * 15}" y2="150" stroke="#e4e1da"/>`).join("")}${Array.from({ length: 11 }, (_, i) => `<line x1="0" y1="${i * 15}" x2="230" y2="${i * 15}" stroke="#e4e1da"/>`).join("")}
      <defs><marker id="v" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs>
      <g stroke-width="2.4" fill="none"><line x1="30" y1="120" x2="120" y2="60" stroke="#0f4fa8" marker-end="url(#v)"/><line x1="120" y1="60" x2="195" y2="105" stroke="#c2410c" marker-end="url(#v)"/><line x1="30" y1="120" x2="195" y2="105" stroke="#116b2e" marker-end="url(#v)"/></g>
      <text x="62" y="82" font-style="italic" fill="#0f4fa8">u⃗</text><text x="162" y="74" font-style="italic" fill="#c2410c">v⃗</text><text x="100" y="128" font-style="italic" fill="#116b2e">u⃗ + v⃗</text></svg></figure></div>
    <h2>Mon bilan</h2>
    <p>Ce que j'ai compris :</p><div class="lines"></div><div class="lines"></div>
    <p style="margin-top:3mm">Ce que je dois revoir :</p><div class="lines"></div><div class="lines"></div>
    ${foot("Plan de travail — Vecteurs", "1")}</div>`,

  // Corrigé — DS 1 Second degré
  15: `<div class="page">${head("Première · Spécialité maths", "Corrigé")}
    <h1>Corrigé — DS 1 Second degré</h1><p class="sub">Les erreurs les plus fréquentes sont signalées en orange.</p>
    <div class="ex">Exercice 1 <span>· Forme canonique</span></div>
    <p><i class="m">f</i>(<i class="m">x</i>) = 2<i class="m">x</i>² − 8<i class="m">x</i> + 6 = 2(<i class="m">x</i>² − 4<i class="m">x</i>) + 6 = 2[(<i class="m">x</i> − 2)² − 4] + 6 = <b>2(<i class="m">x</i> − 2)² − 2</b>.</p>
    <p>Le sommet de la parabole est S(2 ; −2) ; comme <i class="m">a</i> = 2 &gt; 0, <i class="m">f</i> admet un minimum égal à −2, atteint en <i class="m">x</i> = 2.</p>
    <div class="box warm"><span class="tag">Attention</span>Ne pas oublier de multiplier le −4 par 2 en sortant des crochets.</div>
    <div class="ex">Exercice 2 <span>· Racines et factorisation</span></div>
    <div class="cols"><div>
    <p>Δ = <i class="m">b</i>² − 4<i class="m">ac</i> = 64 − 48 = 16 &gt; 0 : deux racines réelles.</p>
    <p><i class="m">x</i>₁ = (8 − 4)/4 = 1 et <i class="m">x</i>₂ = (8 + 4)/4 = 3.</p>
    <p>Donc <b><i class="m">f</i>(<i class="m">x</i>) = 2(<i class="m">x</i> − 1)(<i class="m">x</i> − 3)</b>.</p>
    <table><tr><th><i class="m">x</i></th><td>−∞</td><td>1</td><td>3</td><td>+∞</td></tr><tr><th><i class="m">f</i>(<i class="m">x</i>)</th><td>+</td><td>0</td><td>0</td><td>+</td></tr></table>
    <p style="font-size:10pt">(signe : − entre les racines)</p>
    </div><figure>${graph((x) => 2 * (x - 2) ** 2 - 2, [-0.6, 4.6], [-3, 6.5], { w: 220, h: 200, color: "#7c3aed" })}<figcaption>La parabole et son sommet S(2 ; −2).</figcaption></figure></div>
    <div class="ex">Exercice 3 <span>· Problème</span></div>
    <p>L'aire du rectangle vaut <i class="m">x</i>(10 − <i class="m">x</i>) = 21, soit <i class="m">x</i>² − 10<i class="m">x</i> + 21 = 0 : Δ = 16, <i class="m">x</i> = 3 ou <i class="m">x</i> = 7. Les dimensions sont 3 cm et 7 cm.</p>
    <div class="box ok"><span class="tag">Barème</span>Ex. 1 : 6 pts · Ex. 2 : 8 pts · Ex. 3 : 6 pts — moyenne de la classe : 12,4 / 20.</div>
    ${foot("Corrigé — DS 1", "1 / 2")}</div>`,
};

/** A board's preview: vectors drawn on Seyès paper. */
const BOARD = `<div style="width:1200px;height:800px;background:#fff;position:relative;overflow:hidden">
  <svg width="1200" height="800" viewBox="0 0 1200 800">
    ${Array.from({ length: 50 }, (_, i) => `<line x1="0" y1="${i * 16}" x2="1200" y2="${i * 16}" stroke="${i % 4 === 0 ? "#9db8e8" : "#d6e2f6"}" stroke-width="${i % 4 === 0 ? 1.2 : 0.8}"/>`).join("")}
    ${Array.from({ length: 19 }, (_, i) => `<line x1="${i * 64}" y1="0" x2="${i * 64}" y2="800" stroke="#9db8e8" stroke-width="1"/>`).join("")}
    <line x1="128" y1="0" x2="128" y2="800" stroke="#e57373" stroke-width="2"/>
    <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="context-stroke"/></marker></defs>
    <g stroke-width="5" stroke-linecap="round" fill="none">
      <line x1="320" y1="560" x2="640" y2="368" stroke="#0f4fa8" marker-end="url(#a)"/>
      <line x1="640" y1="368" x2="896" y2="496" stroke="#c2410c" marker-end="url(#a)"/>
      <line x1="320" y1="560" x2="896" y2="496" stroke="#116b2e" marker-end="url(#a)"/>
      <line x1="320" y1="560" x2="576" y2="688" stroke="#c2410c" stroke-dasharray="14 10" marker-end="url(#a)"/>
      <line x1="576" y1="688" x2="896" y2="496" stroke="#0f4fa8" stroke-dasharray="14 10" marker-end="url(#a)"/>
    </g>
    <g font-family="Nimbus Sans" font-size="40" font-style="italic">
      <text x="440" y="440" fill="#0f4fa8">u⃗</text><text x="780" y="400" fill="#c2410c">v⃗</text>
      <text x="560" y="510" fill="#116b2e">u⃗ + v⃗</text>
    </g>
    <text x="180" y="120" font-family="Nimbus Sans" font-size="44" fill="#1a1a1a">Somme de deux vecteurs</text>
    <text x="180" y="176" font-family="Nimbus Sans" font-size="30" fill="#5f5d58">Relation de Chasles : AB⃗ + BC⃗ = AC⃗</text>
  </svg></div>`;

/** A board's preview: the trigonometric circle on squared paper. */
const CIRCLE = `<div style="width:1200px;height:800px;background:#fff;overflow:hidden">
  <svg width="1200" height="800" viewBox="0 0 1200 800">
    ${Array.from({ length: 61 }, (_, i) => `<line x1="${i * 20}" y1="0" x2="${i * 20}" y2="800" stroke="#e3e8f0" stroke-width="1"/>`).join("")}
    ${Array.from({ length: 41 }, (_, i) => `<line x1="0" y1="${i * 20}" x2="1200" y2="${i * 20}" stroke="#e3e8f0" stroke-width="1"/>`).join("")}
    <line x1="260" y1="400" x2="940" y2="400" stroke="#1a1a1a" stroke-width="2"/><line x1="600" y1="80" x2="600" y2="720" stroke="#1a1a1a" stroke-width="2"/>
    <circle cx="600" cy="400" r="280" fill="none" stroke="#0f4fa8" stroke-width="5"/>
    ${[30, 45, 60, 120, 135, 150, 210, 225, 240, 300, 315, 330]
      .map((a) => {
        const r = (a * Math.PI) / 180;
        return `<circle cx="${600 + 280 * Math.cos(r)}" cy="${400 - 280 * Math.sin(r)}" r="7" fill="#c2410c"/>`;
      })
      .join("")}
    <line x1="600" y1="400" x2="${600 + 280 * Math.cos(Math.PI / 3)}" y2="${400 - 280 * Math.sin(Math.PI / 3)}" stroke="#116b2e" stroke-width="4"/>
    <line x1="${600 + 280 * Math.cos(Math.PI / 3)}" y1="${400 - 280 * Math.sin(Math.PI / 3)}" x2="${600 + 280 * Math.cos(Math.PI / 3)}" y2="400" stroke="#116b2e" stroke-width="3" stroke-dasharray="10 8"/>
    <path d="M660 400 A60 60 0 0 0 630 348" fill="none" stroke="#116b2e" stroke-width="3"/>
    <g font-family="Nimbus Sans" font-size="34" fill="#1a1a1a">
      <text x="760" y="140">π/3</text><text x="890" y="390">0</text><text x="612" y="104">π/2</text><text x="276" y="390">π</text>
      <text x="676" y="372" fill="#116b2e" font-size="30">π/3</text><text x="700" y="440" fill="#116b2e" font-size="30">cos = 1/2</text>
    </g>
    <text x="40" y="70" font-family="Nimbus Sans" font-size="40" fill="#1a1a1a">Le cercle trigonométrique</text>
  </svg></div>`;

/** The board photo (the dev data set's image file). */
const PHOTO = `<div style="width:800px;height:500px">
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#2f4f3f"/>
  <text x="60" y="120" font-family="serif" font-size="48" fill="#f2f0e6">f(x) = x²</text>
  <path d="M60 420 Q 400 -120 740 420" stroke="#f2f0e6" stroke-width="4" fill="none"/></svg></div>`;

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);
const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });

for (const [id, body] of Object.entries(DOCS)) {
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.setContent(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`,
  );
  await page.evaluate(() => globalThis.document.fonts.ready);
  await page.pdf({
    path: resolve(docsDir, `${id}.pdf`),
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
  });
  // Page 1, 320 px wide: what the thumbnailer would keep.
  const small = await browser.newPage({
    viewport: { width: 794, height: 1123 },
    deviceScaleFactor: 320 / 794,
  });
  await small.setContent(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`,
  );
  await small.evaluate(() => globalThis.document.fonts.ready);
  await small.screenshot({
    path: resolve(thumbsDir, `${id}.jpg`),
    type: "jpeg",
    quality: 82,
    clip: { x: 0, y: 0, width: 794, height: 1123 },
  });
  await small.close();
  console.log("✓", id);
}
for (const [id, html, w, h] of [
  [6, BOARD, 1200, 800],
  [16, CIRCLE, 1200, 800],
  [8, PHOTO, 800, 500],
]) {
  const small = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 320 / w });
  await small.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}</style></head><body>${html}</body></html>`,
  );
  await small.screenshot({ path: resolve(thumbsDir, `${id}.jpg`), type: "jpeg", quality: 82 });
  await small.close();
  console.log("✓", id);
}
await browser.close();
