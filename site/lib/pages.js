// The site's pages, as HTML strings. Everything that comes from outside
// (GitHub, the app's reports) goes through escape() or markdown.inline().

import { escape, inline, render } from "./markdown.js";
import { ago, date, duration, number, shortDay, size } from "./format.js";
import { rawUrl, repoUrl } from "./github.js";

// Pictures of the app come from the repository as it is now.
const shot = (path) => rawUrl("main", path);

const NAV = [
  { href: "/telecharger", label: "Télécharger" },
  { href: "/nouveautes", label: "Nouveautés" },
];

function layout({ title, description, path, body, admin = false }) {
  const nav = admin
    ? `<form method="post" action="/admin/logout"><button class="link">Se déconnecter</button></form>`
    : NAV.map(
        (n) => `<a href="${n.href}"${path === n.href ? ' aria-current="page"' : ""}>${n.label}</a>`,
      ).join("") + `<a href="${repoUrl}" rel="noopener">GitHub</a>`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
${description ? `<meta name="description" content="${escape(description)}">` : ""}
${admin ? '<meta name="robots" content="noindex, nofollow">' : ""}
<meta name="color-scheme" content="light dark">
<link rel="icon" href="/assets/logo.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/plex-sans-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/style.css?v=1">
</head>
<body${admin ? ' class="admin"' : ""}>
<header class="top">
  <div class="wrap top-row">
    <a class="brand" href="${admin ? "/admin" : "/"}"><img src="/assets/logo.svg" alt="" width="28" height="28"><span>EUCLIDE</span>${admin ? "<em>admin</em>" : ""}</a>
    <nav>${nav}</nav>
  </div>
</header>
<main>
${body}
</main>
${
  admin
    ? ""
    : `<footer class="foot"><div class="wrap foot-row">
  <span>Euclide, le bureau d'enseignement.</span>
  <span><a href="/telecharger">Télécharger</a> · <a href="/nouveautes">Nouveautés</a> · <a href="/confidentialite">Confidentialité</a> · <a href="${repoUrl}" rel="noopener">Code source</a></span>
</div></footer>`
}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Downloads

export function systemOf(userAgent = "") {
  if (/Android|iPhone|iPad|iPod/i.test(userAgent)) return "mobile";
  if (/Windows/i.test(userAgent)) return "windows";
  if (/Mac OS X|Macintosh/i.test(userAgent)) return "macos";
  if (/Linux|X11|CrOS/i.test(userAgent)) return "linux";
  return "windows";
}

const PLATFORMS = {
  "windows-portable": {
    system: "windows",
    title: "Windows, sur une clé USB",
    note: "Recommandé. Décompressez le dossier sur la clé, puis lancez euclide.exe : rien à installer, et les mises à jour se font toutes seules.",
    button: "Télécharger pour Windows",
  },
  "windows-installer": {
    system: "windows",
    title: "Windows, installé sur ce PC",
    note: "Installe Euclide dans le menu Démarrer de cet ordinateur.",
    button: "Télécharger l'installateur",
  },
  linux: {
    system: "linux",
    title: "Linux",
    note: "Un seul fichier AppImage : rendez-le exécutable, puis lancez-le.",
    button: "Télécharger pour Linux",
  },
  macos: {
    system: "macos",
    title: "macOS (Apple Silicon)",
    note: "Pour les Mac à puce M1 ou plus récente. Décompressez, puis ouvrez Euclide.",
    button: "Télécharger pour macOS",
  },
};

const ORDER = ["windows-portable", "windows-installer", "linux", "macos"];

/** The files of a release worth offering, in order, with what each is for. */
export function downloadsOf(release) {
  if (!release) return [];
  const find = (platform) =>
    release.assets.find((a) => a.platform === platform) ??
    (platform === "linux" ? release.assets.find((a) => a.platform === "linux-versioned") : undefined);
  return ORDER.map((p) => ({ id: p, asset: find(p), ...PLATFORMS[p] })).filter((d) => d.asset);
}

function primaryFor(system, downloads) {
  const wanted = system === "mobile" ? "windows" : system;
  return downloads.find((d) => d.system === wanted) ?? downloads[0];
}

const SYSTEM_NAMES = { windows: "Windows", linux: "Linux", macos: "macOS" };

function cta(release, system) {
  const downloads = downloadsOf(release);
  const primary = primaryFor(system, downloads);
  if (!release || !primary) {
    return `<div class="cta"><a class="btn btn-primary" href="${repoUrl}/releases/latest" rel="noopener">Télécharger Euclide</a></div>`;
  }
  const facts = [
    `Version ${escape(release.version)}`,
    SYSTEM_NAMES[primary.system],
    size(primary.asset.size),
    primary.id === "windows-portable" ? "sans installation" : "",
  ].filter(Boolean);
  return `<div class="cta">
  <a class="btn btn-primary" href="${escape(primary.asset.url)}">${download()} ${escape(primary.button)}</a>
  <a class="btn btn-ghost" href="/telecharger">Autres systèmes</a>
</div>
<p class="cta-meta">${facts.join(" · ")}</p>
${system === "mobile" ? '<p class="cta-meta">Euclide se lance sur un ordinateur : Windows, Linux ou Mac.</p>' : ""}`;
}

const download = () =>
  `<svg class="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ---------------------------------------------------------------------------
// Landing page

const FEATURES = [
  {
    title: "Annoter les PDF",
    text: "Stylo, surligneur, formes et notes de texte, enregistrés dans le PDF lui-même. Un scan ou une photo s'annote de la même façon.",
    img: "docs/changelog/0.6.0/annoter.jpg",
    alt: "Une évaluation annotée au stylo et au surligneur",
  },
  {
    title: "Présenter",
    text: "Une page en plein écran pour la classe. La télécommande tourne les pages, et on écrit dessus en direct.",
    img: "docs/changelog/0.6.0/presenter.jpg",
    alt: "Une page présentée en plein écran",
  },
  {
    title: "Tableau blanc",
    text: "Règle, équerre, compas et rapporteur, courbes de fonctions et formules : la géométrie au tableau, comme à la main.",
    img: "docs/changelog/0.5.0/tableau-formules.jpg",
    alt: "Le tableau blanc avec une courbe et une formule",
  },
  {
    title: "Python",
    text: "Un éditeur fait pour la classe : la tortue, les graphiques, et des exercices qui se vérifient tout seuls.",
    img: "docs/changelog/0.4.0/python-verifier.jpg",
    alt: "Un exercice Python vérifié",
  },
  {
    title: "En classe",
    text: "Tirer un nom au sort, faire des groupes, un minuteur et un QR code, en grand pour le vidéoprojecteur.",
    img: "docs/changelog/0.5.0/tirage.jpg",
    alt: "Un nom tiré au sort, en plein écran",
  },
  {
    title: "Pronote",
    text: "L'emploi du temps, le cahier de textes et les élèves de chaque classe, repris depuis Pronote.",
    img: "docs/changelog/0.4.0/cahier-de-textes.jpg",
    alt: "Le cahier de textes d'une classe",
  },
];

const POINTS = [
  ["Sur une clé USB", "Rien à installer : Euclide et ses données passent d'un PC de la salle à l'autre."],
  ["Hors ligne", "Tout marche sans réseau. Pronote se met à jour quand la connexion revient."],
  ["Pour le vidéoprojecteur", "Le mode projection agrandit le texte et renforce les contrastes."],
  ["Sauvegardé chaque jour", "Une copie des données chaque jour, et dans un second dossier au choix."],
];

/** The latest release's first points, for the landing page. */
function highlights(body, limit = 4) {
  return body
    .split(/\r?\n/)
    .filter((l) => /^\s*-\s+/.test(l))
    .slice(0, limit)
    .map((l) => `<li>${inline(l.replace(/^\s*-\s+/, ""), null)}</li>`)
    .join("");
}

export function landing({ release, latestNotes, system }) {
  const features = FEATURES.map(
    (f) => `<article class="feature">
  <img src="${escape(shot(f.img))}" alt="${escape(f.alt)}" loading="lazy" decoding="async" width="1440" height="900">
  <h3>${escape(f.title)}</h3>
  <p>${escape(f.text)}</p>
</article>`,
  ).join("\n");
  const points = POINTS.map(
    ([t, p]) => `<li><strong>${escape(t)}</strong><span>${escape(p)}</span></li>`,
  ).join("");
  const news =
    release && latestNotes
      ? `<section class="wrap band news">
  <div>
    <p class="eyebrow">Nouveautés · ${escape(date(release.publishedAt))}</p>
    <h2>Ce qui change dans la ${escape(release.version)}</h2>
  </div>
  <ul class="ticks">${highlights(latestNotes)}</ul>
  <a class="more" href="/nouveautes#v${escape(release.version)}">Toutes les nouveautés →</a>
</section>`
      : "";
  return layout({
    title: "Euclide, le bureau d'enseignement",
    description:
      "Cours, PDF annotés, tableau blanc, Python et Pronote, dans une application qui tourne depuis une clé USB, même sans connexion.",
    path: "/",
    body: `<section class="wrap hero">
  <p class="eyebrow">Pour les professeurs</p>
  <h1>Le bureau d'enseignement</h1>
  <p class="lead">Les cours et leur progression, les documents et les PDF annotés, un tableau blanc de géométrie, Python et Pronote. Tout tient sur une clé USB, et marche sans connexion.</p>
  ${cta(release, system)}
</section>
<figure class="wrap hero-shot">
  <img src="${escape(shot("docs/changelog/0.4.0/tableau-de-bord.jpg"))}" alt="Le tableau de bord d'Euclide : le cours en cours, l'emploi du temps du jour et les rappels" width="1440" height="900" decoding="async">
</figure>
<section class="wrap section">
  <h2 class="section-title">Tout ce qu'un cours demande, au même endroit</h2>
  <div class="features">
${features}
  </div>
</section>
<section class="wrap band">
  <h2>Pensé pour la salle de classe</h2>
  <ul class="points">${points}</ul>
</section>
${news}
<section class="wrap closing">
  <h2>Prêt pour le prochain cours</h2>
  ${cta(release, system)}
</section>`,
  });
}

// ---------------------------------------------------------------------------
// Downloads page

export function downloads({ releases: list, system }) {
  const release = list[0];
  const files = downloadsOf(release);
  const primary = primaryFor(system, files);
  const cards = files
    .map(
      (d) => `<article class="dl${d === primary ? " dl-primary" : ""}">
  <div>
    <h3>${escape(d.title)}${d === primary ? ' <span class="tag">Pour cet ordinateur</span>' : ""}</h3>
    <p>${escape(d.note)}</p>
    <p class="mono">${escape(d.asset.name)} · ${size(d.asset.size)}</p>
  </div>
  <a class="btn ${d === primary ? "btn-primary" : "btn-ghost"}" href="${escape(d.asset.url)}">${download()} Télécharger</a>
</article>`,
    )
    .join("\n");
  const older = list
    .slice(1, 11)
    .map((r) => {
      const offered = downloadsOf(r)
        .map(
          (d) =>
            `<a href="${escape(d.asset.url)}">${escape(SYSTEM_NAMES[d.system])}${d.id === "windows-installer" ? " (installateur)" : ""}</a>`,
        )
        .join(" · ");
      return `<tr><td class="mono"><a href="/nouveautes#v${escape(r.version)}">${escape(r.version)}</a></td><td>${escape(date(r.publishedAt))}</td><td>${offered || `<a href="${escape(r.url)}" rel="noopener">GitHub</a>`}</td></tr>`;
    })
    .join("");
  return layout({
    title: "Télécharger Euclide",
    description: "Euclide pour Windows (clé USB ou installateur), Linux et macOS.",
    path: "/telecharger",
    body: `<section class="wrap page-head">
  <h1>Télécharger Euclide</h1>
  <p class="lead">${
    release
      ? `Version ${escape(release.version)}, publiée le ${escape(date(release.publishedAt))}. <a href="/nouveautes#v${escape(release.version)}">Ce qui a changé</a>.`
      : `Les versions sont sur <a href="${repoUrl}/releases" rel="noopener">GitHub</a>.`
  }</p>
</section>
<section class="wrap downloads">
${cards}
</section>
<section class="wrap band notes">
  <h2>Au premier lancement</h2>
  <ul class="ticks">
    <li>Windows peut afficher « Windows a protégé votre ordinateur » : cliquez sur « Informations complémentaires », puis « Exécuter quand même ».</li>
    <li>Les données restent à côté d'Euclide, dans le dossier Euclide-Data : sur la clé, elles voyagent avec lui.</li>
    <li>Une nouvelle version s'installe toute seule, après avoir enregistré le travail ouvert.</li>
  </ul>
</section>
${
  older
    ? `<section class="wrap section">
  <h2 class="section-title">Versions précédentes</h2>
  <table class="table"><thead><tr><th>Version</th><th>Publiée le</th><th>Fichiers</th></tr></thead><tbody>${older}</tbody></table>
  ${list.length > 11 ? `<p class="more-versions"><a href="${repoUrl}/releases" rel="noopener">Toutes les versions sur GitHub →</a></p>` : ""}
</section>`
    : ""
}`,
  });
}

// ---------------------------------------------------------------------------
// Changelog

export function changelog({ entries, releases: list, tag }) {
  const published = new Map(list.map((r) => [r.version, r]));
  const resolve = (path) => rawUrl(tag, path.replace(/^\.?\//, ""));
  const sections = entries
    .map((e) => {
      const r = published.get(e.version);
      return `<section class="release" id="v${escape(e.version)}">
  <header><h2>Version ${escape(e.version)}</h2>${r ? `<p class="mono">${escape(date(r.publishedAt))}</p>` : ""}</header>
  <div class="prose">${render(e.body, resolve)}</div>
</section>`;
    })
    .join("\n");
  const index = entries.map((e) => `<a href="#v${escape(e.version)}">${escape(e.version)}</a>`).join("");
  return layout({
    title: "Nouveautés d'Euclide",
    description: "Ce qui change d'une version d'Euclide à l'autre.",
    path: "/nouveautes",
    body: `<section class="wrap page-head">
  <h1>Nouveautés</h1>
  <p class="lead">Ce qui change d'une version d'Euclide à l'autre.</p>
  <nav class="versions" aria-label="Versions">${index}</nav>
</section>
<div class="wrap changelog">
${sections || '<p class="lead">Le journal des versions est momentanément indisponible.</p>'}
</div>`,
  });
}

export function privacy() {
  return layout({
    title: "Confidentialité · Euclide",
    description: "Ce qu'Euclide et ce site envoient, et ce qu'ils gardent.",
    path: "/confidentialite",
    body: `<section class="wrap page-head">
  <h1>Confidentialité</h1>
  <p class="lead">Les cours, les documents, les notes et les élèves restent sur l'ordinateur ou la clé USB, dans le dossier Euclide-Data. Ils ne sont envoyés nulle part.</p>
</section>
<section class="wrap band notes">
  <h2>Les statistiques de l'application</h2>
  <ul class="ticks">
    <li>Une fois par jour, Euclide envoie le temps passé dans chaque partie de l'application (PDF, notes, tableau blanc…) et le nombre de fois où certaines actions ont été faites : une note enregistrée, un fichier importé, un script Python lancé, une présentation.</li>
    <li>Avec un identifiant tiré au hasard pour chaque copie d'Euclide, sa version et son système (Windows, Linux ou macOS). Rien qui désigne une personne : ni nom, ni titre, ni fichier, ni adresse e-mail.</li>
    <li>Elles servent à savoir ce qui sert, pour améliorer ce qui compte. Elles ne sont ni vendues ni partagées.</li>
    <li>Dans Réglages, Données : « Voir ce qui est envoyé » montre le prochain envoi tel quel, et un interrupteur les coupe.</li>
  </ul>
</section>
<section class="wrap band notes">
  <h2>Ce site</h2>
  <ul class="ticks">
    <li>Il compte combien de fois chaque page est vue, par jour. Sans cookie, sans adresse IP gardée, sans outil de mesure extérieur.</li>
    <li>Les fichiers à télécharger et les captures d'écran viennent de GitHub, qui reçoit donc ces demandes.</li>
  </ul>
</section>
<section class="wrap section">
  <p class="lead">Une question : <a href="${repoUrl}/issues" rel="noopener">écrire sur GitHub</a>.</p>
</section>`,
  });
}

export function unavailable() {
  return layout({
    title: "Euclide",
    path: "",
    body: `<section class="wrap page-head"><h1>Un instant</h1><p class="lead">GitHub ne répond pas pour le moment. Les versions d'Euclide sont sur <a href="${repoUrl}/releases" rel="noopener">GitHub</a>.</p></section>`,
  });
}

export function notFound() {
  return layout({
    title: "Page introuvable · Euclide",
    path: "",
    body: `<section class="wrap page-head"><h1>Page introuvable</h1><p class="lead"><a href="/">Retour à l'accueil</a></p></section>`,
  });
}

// ---------------------------------------------------------------------------
// Admin

export function login({ error, disabled }) {
  return layout({
    title: "Connexion · Euclide admin",
    path: "/admin",
    admin: true,
    body: `<section class="login">
  <h1>Tableau de bord</h1>
  ${
    disabled
      ? '<p class="lead">Le tableau de bord est fermé : ADMIN_PASSWORD n\'est pas défini.</p>'
      : `<form method="post" action="/admin/login">
    <label for="password">Mot de passe</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
    ${error ? `<p class="error" role="alert">${escape(error)}</p>` : ""}
    <button class="btn btn-primary" type="submit">Entrer</button>
  </form>`
  }
</section>`,
  });
}

const AREAS = {
  dashboard: "Tableau de bord",
  pdf: "PDF",
  image: "Images",
  note: "Notes",
  notes: "Notes",
  board: "Tableau blanc",
  whiteboard: "Tableau blanc",
  python: "Python",
  tools: "Outils",
  courses: "Cours",
  course: "Un cours",
  class: "Classe et cahier de textes",
  documents: "Documents",
  reminders: "Rappels",
  recap: "Bilan",
  settings: "Réglages",
  news: "Nouveautés",
  other: "Autre",
};

const EVENTS = {
  note_write: "Notes enregistrées",
  note_export: "Notes exportées",
  note_rename: "Notes renommées",
  file_import: "Fichiers importés",
  file_open: "Fichiers ouverts",
  file_rename: "Fichiers renommés",
  demo_run: "Scripts Python lancés",
  whiteboard_save: "Tableaux enregistrés",
  reminder_done: "Rappels faits",
  scene_open: "Écran de classe ouvert",
  pdf_present: "PDF présentés",
  slides_present: "Notes présentées",
  pronote_sync: "Synchronisations Pronote",
};

const SYSTEM_LABELS = { windows: "Windows", linux: "Linux", macos: "macOS", other: "Autre" };

/** Bars per day, as an SVG drawn by attributes (no inline style: the CSP forbids it). */
function dayChart(days, key, format) {
  const w = 720;
  const h = 160;
  const max = Math.max(1, ...days.map((d) => d[key]));
  const step = w / days.length;
  const bar = Math.max(2, step * 0.72);
  const rects = days
    .map((d, i) => {
      const bh = d[key] ? Math.max(2, (d[key] / max) * (h - 8)) : 0;
      const x = i * step + (step - bar) / 2;
      return `<rect class="bar" x="${x.toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${bar.toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5"><title>${escape(shortDay(d.day))} : ${escape(format(d))}</title></rect>`;
    })
    .join("");
  const first = days[0] ? shortDay(days[0].day) : "";
  const last = days.at(-1) ? shortDay(days.at(-1).day) : "";
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Par jour">
  <line class="axis" x1="0" y1="${h - 0.5}" x2="${w}" y2="${h - 0.5}"/>${rects}
</svg>
<div class="chart-axis"><span>${escape(first)}</span><span>max ${escape(format({ [key]: max }))}</span><span>${escape(last)}</span></div>`;
}

/** Name, share bar and value, a row each. */
function shares(rows, label, format) {
  if (!rows.length) return '<p class="empty">Rien sur cette période.</p>';
  const max = Math.max(...rows.map(([, v]) => v));
  return `<table class="shares">${rows
    .map(
      ([k, v]) =>
        `<tr><th>${escape(label(k))}</th><td class="share"><svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect class="track" width="100" height="8" rx="2"/><rect class="bar" width="${((v / max) * 100).toFixed(1)}" height="8" rx="2"/></svg></td><td class="num">${escape(format(v))}</td></tr>`,
    )
    .join("")}</table>`;
}

function kpi(label, value, sub = "") {
  return `<div class="kpi"><p class="kpi-label">${escape(label)}</p><p class="kpi-value">${escape(value)}</p>${sub ? `<p class="kpi-sub">${escape(sub)}</p>` : ""}</div>`;
}

export function dashboard({ stats: s, releases: list, now = Date.now() }) {
  const spans = [7, 30, 90]
    .map((n) => `<a href="/admin?jours=${n}"${n === s.span ? ' aria-current="page"' : ""}>${n} jours</a>`)
    .join("");
  const totalDownloads = list.reduce(
    (sum, r) => sum + r.assets.filter((a) => a.platform).reduce((t, a) => t + a.downloads, 0),
    0,
  );
  const latest = list[0];
  const latestDownloads = latest
    ? latest.assets.filter((a) => a.platform).reduce((t, a) => t + a.downloads, 0)
    : 0;
  const perActiveDay = s.activeDays ? s.minutes / s.activeDays : 0;

  const installs = s.installs
    .map(
      (i) => `<tr>
  <td class="mono" title="${escape(i.id)}">${escape(i.id.slice(0, 8))}</td>
  <td class="mono">${escape(i.version)}</td>
  <td>${escape(SYSTEM_LABELS[i.os] ?? i.os)}${i.portable ? " · portable" : ""}</td>
  <td class="num">${escape(duration(i.period.minutes))}</td>
  <td class="num">${number(i.period.days)}</td>
  <td>${escape(date(i.first_seen, { day: "numeric", month: "short", year: "numeric" }))}</td>
  <td>${escape(ago(i.last_seen, now))}</td>
</tr>`,
    )
    .join("");

  const releaseRows = list
    .slice(0, 8)
    .map((r) => {
      const by = (p) =>
        r.assets.filter((a) => a.platform?.startsWith(p)).reduce((t, a) => t + a.downloads, 0);
      const all = r.assets.filter((a) => a.platform).reduce((t, a) => t + a.downloads, 0);
      return `<tr><td class="mono">${escape(r.version)}</td><td>${escape(date(r.publishedAt, { day: "numeric", month: "short" }))}</td><td class="num">${number(by("windows"))}</td><td class="num">${number(by("linux"))}</td><td class="num">${number(by("macos"))}</td><td class="num"><strong>${number(all)}</strong></td></tr>`;
    })
    .join("");

  return layout({
    title: "Tableau de bord · Euclide admin",
    path: "/admin",
    admin: true,
    body: `<div class="wrap admin-wrap">
<header class="admin-head">
  <div>
    <h1>Tableau de bord</h1>
    <p class="mono">Du ${escape(shortDay(s.from))} au ${escape(shortDay(s.today))} · dernière activité ${escape(ago(s.lastSeen, now))}</p>
  </div>
  <nav class="seg" aria-label="Période">${spans}</nav>
</header>

<section class="kpis">
  ${kpi("Copies d'Euclide", number(s.totalInstalls), `${number(s.activeInstalls)} active${s.activeInstalls > 1 ? "s" : ""} sur la période`)}
  ${kpi("Temps d'utilisation", duration(s.minutes), s.activeDays ? `${duration(perActiveDay)} par jour d'usage` : "")}
  ${kpi("Jours d'usage", number(s.activeDays), "jours où une copie a servi")}
  ${kpi("Téléchargements", number(totalDownloads), latest ? `${number(latestDownloads)} pour la ${latest.version}` : "")}
  ${kpi("Visites du site", number(s.viewsTotal), "pages vues sur la période")}
</section>

<section class="card">
  <h2>Temps d'utilisation par jour</h2>
  ${dayChart(s.days, "minutes", (d) => duration(d.minutes))}
</section>

<div class="grid-2">
  <section class="card">
    <h2>Temps par partie de l'app</h2>
    ${shares(s.areas, (k) => AREAS[k] ?? k, duration)}
  </section>
  <section class="card">
    <h2>Actions</h2>
    ${shares(s.events, (k) => EVENTS[k] ?? k, number)}
  </section>
</div>

<div class="grid-3">
  <section class="card">
    <h2>Versions en service</h2>
    ${shares(
      s.versions,
      (k) => k,
      (v) => `${number(v)} copie${v > 1 ? "s" : ""}`,
    )}
  </section>
  <section class="card">
    <h2>Systèmes</h2>
    ${shares(
      s.systems,
      (k) => SYSTEM_LABELS[k] ?? k,
      (v) => `${number(v)}`,
    )}
    <p class="muted">${number(s.portable)} portable${s.portable > 1 ? "s" : ""} sur ${number(s.totalInstalls)}</p>
  </section>
  <section class="card">
    <h2>Pages du site</h2>
    ${shares(s.views, (k) => k, number)}
  </section>
</div>

<section class="card">
  <h2>Copies d'Euclide</h2>
  ${
    installs
      ? `<div class="scroll"><table class="table"><thead><tr><th>Copie</th><th>Version</th><th>Système</th><th class="num">Temps</th><th class="num">Jours</th><th>Première fois</th><th>Dernière fois</th></tr></thead><tbody>${installs}</tbody></table></div>`
      : '<p class="empty">Aucune copie n\'a encore envoyé de statistiques.</p>'
  }
</section>

<section class="card">
  <h2>Téléchargements par version</h2>
  ${
    releaseRows
      ? `<div class="scroll"><table class="table"><thead><tr><th>Version</th><th>Publiée</th><th class="num">Windows</th><th class="num">Linux</th><th class="num">macOS</th><th class="num">Total</th></tr></thead><tbody>${releaseRows}</tbody></table></div>`
      : '<p class="empty">GitHub ne répond pas.</p>'
  }
</section>

<section class="card">
  <h2>Visites du site par jour</h2>
  ${dayChart(s.viewsByDay, "views", (d) => `${number(d.views)} page${d.views > 1 ? "s" : ""}`)}
</section>
</div>`,
  });
}
