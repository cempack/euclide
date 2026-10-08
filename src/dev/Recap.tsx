import type { CSSProperties, ReactNode } from "react";
import {
  ArchiveRestore,
  ArrowUpCircle,
  CalendarRange,
  ChartSpline,
  CircleStop,
  Clock3,
  Contrast,
  Download,
  FileText,
  Gauge,
  Grid3x3,
  History,
  KeyRound,
  Keyboard,
  LayoutTemplate,
  Magnet,
  MonitorPlay,
  PencilLine,
  Pin,
  Power,
  Presentation,
  Settings2,
  ShieldCheck,
  Timer,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useAppearance } from "../lib/theme";
import { BUILT_IN, LEVELS } from "../features/python/templates";
import { Icon } from "../ui/Icon";
import { Logo } from "../ui/Logo";
import "./recap.css";

/**
 * What changes in Euclide 0.4 (?recap), on 16:9 slides in the app's own
 * look: its fonts, colours, panels and the stage it projects on. One change
 * per slide, said in a short sentence, and a real screenshot from
 * scripts/changelog/capture.mjs (served from scripts/changelog/shots); the
 * overview lists every change on one page. scripts/changelog/recap.mjs
 * photographs each slide and binds the PDF.
 */

const shot = (name: string) => `/scripts/changelog/shots/${name}.png`;
/** Parts capture.mjs also takes in the dark theme, for the dark overview. */
const DARK_TOO = new Set(["part-maintenant", "part-verifications", "part-modeles"]);

/** A full screen's size: 1440 × 900 at twice the pixels. */
const SCREEN: [number, number] = [2880, 1800];

type Box = { left?: number; top?: number; right?: number; bottom?: number; width?: number; height?: number };

/**
 * A screenshot in a frame placed on the slide. With `crop` ([x, y, w, h]
 * in the picture's own pixels, of a picture `size` big) the frame shows
 * exactly that part, scaled to the frame's width; otherwise the picture
 * covers the frame (or fits it, `contain`), anchored at `focus`.
 */
function Shot({
  src,
  box,
  crop,
  size = SCREEN,
  focus = "50% 50%",
  contain,
  paper,
  bleed = "",
  className = "",
  style,
}: {
  src: string;
  box: Box;
  crop?: [number, number, number, number];
  size?: [number, number];
  focus?: string;
  contain?: boolean;
  /** A drawing: on white paper whatever the slide. */
  paper?: boolean;
  /** Edges that run off the slide: no border, no rounding there. */
  bleed?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const dark = useAppearance().resolved === "dark";
  const url = `url(${shot(dark && DARK_TOO.has(src) ? `${src}-dark` : src)})`;
  const classes = `k-shot ${paper ? "paper" : ""} ${bleed
    .split(" ")
    .filter(Boolean)
    .map((b) => `bleed-${b}`)
    .join(" ")} ${className}`;
  if (crop && box.width) {
    // Scaled to the frame's width; or, when its height is set too, fitted
    // inside it and centred, the rest of the frame left as paper.
    const k = box.height ? Math.min(box.width / crop[2], box.height / crop[3]) : box.width / crop[2];
    const height = box.height ?? Math.round(crop[3] * k);
    const pic: CSSProperties = {
      left: (box.width - crop[2] * k) / 2,
      top: (height - crop[3] * k) / 2,
      width: crop[2] * k,
      height: crop[3] * k,
      backgroundImage: url,
      backgroundSize: `${size[0] * k}px ${size[1] * k}px`,
      backgroundPosition: `${-crop[0] * k}px ${-crop[1] * k}px`,
    };
    return (
      <div className={classes} style={{ ...box, height, ...style }}>
        <div className="k-shot-pic" style={pic} />
      </div>
    );
  }
  return (
    <div
      className={classes}
      style={{
        ...box,
        backgroundImage: url,
        backgroundRepeat: "no-repeat",
        backgroundSize: contain ? "contain" : "cover",
        backgroundPosition: focus,
        ...style,
      }}
    />
  );
}

function Slide({
  name,
  stage,
  className = "",
  children,
}: {
  name: string;
  stage?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`k-slide ${stage ? "stage" : ""} ${className}`} data-name={name}>
      {children}
    </section>
  );
}

/** A block of text placed on the slide. */
function Text({ box, align, children }: { box: Box; align?: "center"; children: ReactNode }) {
  return (
    <div className="k-text" style={{ ...box, textAlign: align }}>
      {children}
    </div>
  );
}

const Eyebrow = ({ children }: { children: ReactNode }) => <p className="k-eyebrow">{children}</p>;

function Keys({ keys }: { keys: string[][] }) {
  return (
    <div className="k-keys">
      {keys.map((group, i) => (
        <span key={i} className="k-keygroup">
          {group.map((k) => (
            <kbd key={k}>{k}</kbd>
          ))}
        </span>
      ))}
    </div>
  );
}

/** A feature in a few words, its glyph in a tile. */
function Point({ icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="k-point">
      <span className="k-point-icon">
        <Icon icon={icon} size={20} />
      </span>
      <span>
        <span className="k-point-title">{title}</span>
        {children && <span className="k-point-text">{children}</span>}
      </span>
    </div>
  );
}

/** The templates by level, counted from the catalogue itself. */
function templateCounts() {
  const count = (...ids: string[]) => BUILT_IN.filter((t) => ids.includes(t.level)).length;
  const label = (id: string) => LEVELS.find((l) => l.id === id)?.label ?? id;
  return [
    { n: count("seconde"), label: label("seconde") },
    { n: count("premiere"), label: label("premiere") },
    { n: count("terminale"), label: label("terminale") },
    { n: count("maths-expertes"), label: label("maths-expertes") },
    { n: count("nsi-premiere", "nsi-terminale"), label: "NSI, Première et Terminale" },
    { n: count("bases", "dessins"), label: "Premiers pas, dessins et graphiques" },
  ];
}

// ---------------------------------------------------------------------------
// The overview: everything new as a wall of tiles, one change each, as Apple
// shows a release (also the changelog's picture).
// ---------------------------------------------------------------------------

/** The wall's grid: 14 × 9 cells, larger than the slide, so the tiles at
 * its edges run off it. */
const GRID = { cols: 14, rows: 9, w: 132, h: 114, gap: 14 };
const BLEED = {
  x: (GRID.cols * GRID.w + (GRID.cols - 1) * GRID.gap - 1920) / 2,
  y: (GRID.rows * GRID.h + (GRID.rows - 1) * GRID.gap - 1080) / 2,
};
/** Room for a picture tile's caption, under its picture. */
const CAPTION = 50;

type At = [col: number, row: number, cols: number, rows: number];

/** A tile's size, and how much of each side runs off the slide. */
function geometry([col, row, cols, rows]: At) {
  return {
    width: cols * GRID.w + (cols - 1) * GRID.gap,
    height: rows * GRID.h + (rows - 1) * GRID.gap,
    left: col === 1 ? BLEED.x : 0,
    right: col + cols - 1 === GRID.cols ? BLEED.x : 0,
    top: row === 1 ? BLEED.y : 0,
    bottom: row + rows - 1 === GRID.rows ? BLEED.y : 0,
  };
}

/**
 * One tile of the wall: a picture (a crop of a screenshot) or anything
 * else, centred in what the slide shows of it, and a caption under it.
 */
function Cell({
  at,
  label,
  tone,
  row,
  pic,
  children,
}: {
  at: At;
  label?: string;
  tone?: "dark" | "accent";
  /** Side by side rather than stacked (a short tile). */
  row?: boolean;
  pic?: { src: string; crop: [number, number, number, number]; size?: [number, number]; paper?: boolean };
  children?: ReactNode;
}) {
  const g = geometry(at);
  const [col, line, cols, rows] = at;
  const style: CSSProperties = {
    gridColumn: `${col} / span ${cols}`,
    gridRow: `${line} / span ${rows}`,
    paddingLeft: g.left + 14,
    paddingRight: g.right + 14,
    paddingTop: g.top + 12,
    paddingBottom: g.bottom + 12,
  };
  return (
    <div className={`k-cell ${tone ?? ""} ${row ? "row" : ""} ${pic ? "pic" : ""}`} style={style}>
      {pic && (
        <Shot
          src={pic.src}
          size={pic.size}
          box={{
            left: g.left,
            top: g.top,
            width: g.width - g.left - g.right,
            height: g.height - g.top - g.bottom - CAPTION,
          }}
          crop={pic.crop}
          paper={pic.paper}
          className="flat borderless"
        />
      )}
      {children}
      {label && (
        <p className="k-cell-label" style={pic ? { bottom: g.bottom + 15 } : undefined}>
          {fr(label)}
        </p>
      )}
    </div>
  );
}

/** A glyph in one of the app's colours. */
function Glyph({
  icon,
  tone = "accent",
}: {
  icon: LucideIcon;
  tone?: "accent" | "ok" | "warn" | "danger" | "ink";
}) {
  return (
    <span className={`k-cell-glyph ${tone}`}>
      <Icon icon={icon} size={20} />
    </span>
  );
}

/** The four paper backgrounds of the whiteboard, as swatches. */
function Papers() {
  return (
    <span className="k-papers">
      {["seyes", "squares", "dots", "axes"].map((p) => (
        <span key={p} className={`k-paper ${p}`} />
      ))}
    </span>
  );
}

function Overview() {
  return (
    <Slide name="vue-d-ensemble" className="k-wallpage">
      <div className="k-mosaic" style={{ left: -BLEED.x, top: -BLEED.y }}>
        <Cell
          at={[1, 1, 2, 2]}
          label="Dessins turtle"
          pic={{ src: "part-koch", size: [1944, 738], crop: [652, 2, 640, 734], paper: true }}
        />
        <Cell
          at={[3, 1, 3, 2]}
          tone="dark"
          label="Minuteur plein écran"
          pic={{ src: "minuteur", crop: [560, 480, 1760, 677] }}
        />
        <Cell at={[6, 1, 2, 2]} label="modèles Python">
          <span className="k-cell-number">{BUILT_IN.length}</span>
        </Cell>
        <Cell
          at={[8, 1, 4, 3]}
          label="Règle, équerre, rapporteur et compas"
          pic={{ src: "part-tableau", size: [2416, 1584], crop: [100, 400, 1760, 898], paper: true }}
        />
        <Cell at={[12, 1, 3, 1]} label="Seyès, carreaux, points, repère" row>
          <Papers />
        </Cell>
        <Cell at={[12, 2, 3, 1]} label="Courbes de fonctions" row>
          <span className="k-cell-math">
            f(x) = x<sup>2</sup> − 2x
          </span>
        </Cell>

        <Cell at={[1, 3, 2, 1]} label="Horloge de classe">
          <Keys keys={[["Ctrl", "Maj", "H"]]} />
        </Cell>
        <Cell
          at={[3, 3, 2, 2]}
          label="Graphiques matplotlib"
          pic={{ src: "part-mandelbrot", size: [1284, 742], crop: [500, 78, 600, 560], paper: true }}
        />
        <Cell at={[5, 3, 1, 1]} label="Écran allumé">
          <Glyph icon={MonitorPlay} />
        </Cell>
        <Cell at={[6, 3, 2, 1]} label="Recherche dans les PDF">
          <Keys keys={[["Ctrl", "K"]]} />
        </Cell>
        <Cell at={[12, 3, 3, 2]} label="Nouveau logo">
          <Logo size={96} />
        </Cell>

        <Cell
          at={[1, 4, 2, 2]}
          label="Planche de Galton"
          pic={{ src: "part-galton", size: [1284, 742], crop: [200, 80, 960, 620], paper: true }}
        />
        <Cell at={[5, 4, 1, 1]} label="Bouton Stop">
          <Glyph icon={CircleStop} tone="danger" />
        </Cell>
        <div
          className="k-cell accent k-cell-hero"
          style={{ gridColumn: "6 / span 4", gridRow: "4 / span 3" }}
        >
          <svg className="k-cell-hero-mark" viewBox="0 0 24 24" aria-hidden>
            <circle cx="8.5" cy="13.2" r="7" />
            <circle cx="15.5" cy="13.2" r="7" />
            <circle cx="12" cy="7.14" r="0.9" className="dot" />
          </svg>
          <h1>
            Euclide <span>0.4</span>
          </h1>
          <p>Les nouveautés</p>
        </div>
        <Cell
          at={[10, 4, 2, 2]}
          label="Cahier de textes par semaine"
          pic={{ src: "cahier-de-textes", crop: [640, 196, 1160, 800] }}
        />

        <Cell
          at={[3, 5, 3, 2]}
          label="« Vérifier » corrige"
          pic={{ src: "part-verifications", size: [1996, 922], crop: [10, 80, 860, 390] }}
        />
        <Cell
          at={[12, 5, 3, 2]}
          tone="dark"
          label="Thème sombre"
          pic={{ src: "tableau-de-bord-sombre", crop: [464, 80, 1400, 730] }}
        />
        <Cell at={[1, 6, 2, 1]} label="dans la console" row>
          <span className="k-cell-code">input()</span>
        </Cell>
        <Cell at={[10, 6, 2, 1]} label="requête Pronote au lieu de 7" row>
          <span className="k-cell-number small">1</span>
        </Cell>

        <Cell
          at={[1, 7, 3, 2]}
          label="Diaporama (F5)"
          pic={{ src: "diaporama", crop: [200, 150, 2300, 1094], paper: true }}
        />
        <Cell at={[4, 7, 1, 1]} label="Export PDF">
          <Glyph icon={FileText} tone="danger" />
        </Cell>
        <Cell at={[5, 7, 1, 1]} label="Modèles de notes">
          <Glyph icon={LayoutTemplate} tone="warn" />
        </Cell>
        <Cell
          at={[6, 7, 3, 2]}
          label="Aperçus des documents"
          pic={{ src: "part-apercus", size: [2416, 1752], crop: [188, 500, 1500, 680] }}
        />
        <Cell at={[9, 7, 2, 1]} label="Sauvegardes restaurables" row>
          <Glyph icon={ArchiveRestore} tone="ok" />
        </Cell>
        <Cell
          at={[11, 7, 4, 2]}
          label="La séance en un clic"
          pic={{ src: "part-maintenant", size: [2032, 474], crop: [20, 20, 1130, 421] }}
        />
        <Cell at={[4, 8, 2, 1]} label="Mises à jour dans la barre d'état">
          <span className="k-cell-update">
            <Icon icon={ArrowUpCircle} size={14} />
            Mise à jour 0.4.1
          </span>
        </Cell>
        <Cell at={[9, 8, 1, 1]} label="Pronote retient la connexion">
          <Glyph icon={KeyRound} tone="warn" />
        </Cell>
        <Cell at={[10, 8, 1, 1]} label="Contrastes AA">
          <Glyph icon={Contrast} tone="ink" />
        </Cell>

        <Cell at={[1, 9, 2, 1]} label="Onglets épinglés" row>
          <Glyph icon={Pin} tone="danger" />
        </Cell>
        <Cell at={[3, 9, 2, 1]} label="Clavier français" row>
          <Glyph icon={Keyboard} tone="ink" />
        </Cell>
        <Cell at={[5, 9, 2, 1]} label="Rien de perdu à la fermeture" row>
          <Glyph icon={ShieldCheck} tone="ok" />
        </Cell>
        <Cell at={[7, 9, 2, 1]} label="Python s'arrête avec Euclide" row>
          <Glyph icon={Power} tone="accent" />
        </Cell>
        <Cell at={[9, 9, 2, 1]} label="thèmes, par niveau" row>
          <span className="k-cell-number small">
            {LEVELS.filter((l) => l.id !== "mine").reduce((n, l) => n + l.themes.length, 0)}
          </span>
        </Cell>
        <Cell at={[11, 9, 2, 1]} label="Démarrage plus rapide" row>
          <Glyph icon={Gauge} tone="ok" />
        </Cell>
        <Cell at={[13, 9, 2, 1]} label="Réglages par sections" row>
          <Glyph icon={Settings2} tone="ink" />
        </Cell>
      </div>
    </Slide>
  );
}

/** French spacing in a sentence written here: no sign starts a line. */
function fr(text: string): string {
  return text
    .replace(/ ([:;!?])/g, " $1")
    .replace(/« /g, "« ")
    .replace(/ »/g, " »");
}

// ---------------------------------------------------------------------------
// The slides.
// ---------------------------------------------------------------------------

function Cover() {
  return (
    <Slide name="couverture" stage>
      <div className="k-cover">
        <Logo size={128} />
        <h1 className="k-cover-title">
          Euclide <span>0.4</span>
        </h1>
        <p className="k-cover-sub">Les nouveautés de la version 0.4.</p>
      </div>
      <Shot
        src="tableau-de-bord"
        box={{ left: 270, width: 1380, top: 640 }}
        crop={[0, 0, 2880, 1800]}
        bleed="bottom"
        className="k-rise"
      />
    </Slide>
  );
}

function Whiteboard() {
  return (
    <Slide name="tableau-blanc">
      <Text box={{ left: 112, top: 132, width: 640 }}>
        <Eyebrow>Tableau blanc</Eyebrow>
        <h2 className="k-title">Le tableau blanc a des instruments de géométrie.</h2>
        <p className="k-sub">
          Règle, équerre, rapporteur et compas, à taille réelle. Ils se déplacent et tournent à la souris.
        </p>
      </Text>
      <div className="k-points k-points-2" style={{ left: 112, top: 760, width: 640 }}>
        <Point icon={Grid3x3} title="Fonds Seyès, carreaux, points, repère" />
        <Point icon={Magnet} title="Tracés aimantés aux points" />
        <Point icon={ChartSpline} title="Courbes f(x) = …" />
        <Point icon={Download} title="Export PNG et PDF" />
      </div>
      <Shot
        src="part-tableau"
        size={[2416, 1584]}
        box={{ left: 820, top: 112, right: 0, bottom: 0 }}
        focus="0% 70%"
        bleed="right bottom"
        paper
      />
    </Slide>
  );
}

function ClassTimer() {
  return (
    <Slide name="minuteur" stage>
      <Text box={{ left: 112, top: 150, width: 620 }}>
        <Eyebrow>En classe</Eyebrow>
        <h2 className="k-title">Un minuteur en plein écran.</h2>
        <p className="k-sub">
          Pour le vidéoprojecteur&nbsp;: il montre le temps restant et le cours en cours, puis sonne à la fin.
        </p>
      </Text>
      <div className="k-keyrows" style={{ left: 112, top: 690 }}>
        <div>
          <Keys keys={[["Ctrl", "Maj", "H"]]} />
          <span>ouvre l'horloge</span>
        </div>
        <div>
          <Keys keys={[["1"], ["…"], ["9"]]} />
          <span>lance 1 à 9 minutes</span>
        </div>
        <div>
          <Keys keys={[["Espace"]]} />
          <span>pause</span>
          <Keys keys={[["+"], ["−"]]} />
          <span>une minute</span>
        </div>
      </div>
      <Shot
        src="minuteur"
        box={{ left: 800, top: 196, width: 1008, height: 630 }}
        focus="50% 50%"
        className="k-screen"
      />
    </Slide>
  );
}

function Lesson() {
  return (
    <Slide name="seance">
      <Text box={{ left: 112, top: 120, width: 1100 }}>
        <Eyebrow>Tableau de bord</Eyebrow>
        <h2 className="k-title">Chaque étape garde ses documents.</h2>
        <p className="k-sub wide">
          «&nbsp;Ouvrir la séance&nbsp;» ouvre les documents, notes, tableaux et scripts de l'étape.
          «&nbsp;Séance faite&nbsp;» passe à l'étape suivante.
        </p>
      </Text>
      <Shot
        src="tableau-de-bord"
        box={{ left: 112, width: 1060, top: 470 }}
        crop={[464, 80, 2416, 1400]}
        bleed="bottom"
      />
      <Shot
        src="part-progression"
        size={[2032, 1616]}
        box={{ left: 1010, top: 560, width: 800 }}
        crop={[0, 0, 2032, 1616]}
        bleed="bottom"
      />
    </Slide>
  );
}

function Templates() {
  const counts = templateCounts();
  return (
    <Slide name="modeles-python">
      <Text box={{ left: 112, top: 120, width: 700 }}>
        <Eyebrow>Python</Eyebrow>
        <h2 className="k-title">{BUILT_IN.length} modèles de scripts.</h2>
        <p className="k-sub">
          Rangés par niveau et par thème, de la Seconde à la Terminale, en Maths expertes et en NSI. Chacun
          fonctionne tel quel.
        </p>
      </Text>
      <div className="k-counts" style={{ left: 112, top: 640, width: 700 }}>
        {counts.map((c) => (
          <div key={c.label}>
            <span className="k-count-n">{c.n}</span>
            <span className="k-count-label">{c.label}</span>
          </div>
        ))}
      </div>
      <Shot
        src="part-modeles"
        size={[2048, 1412]}
        box={{ left: 860, top: 150, width: 1000 }}
        crop={[0, 0, 2048, 1412]}
      />
    </Slide>
  );
}

function PythonDraws() {
  return (
    <Slide name="python-dessine" stage>
      <Text box={{ left: 160, top: 110, width: 1600 }} align="center">
        <Eyebrow>Python</Eyebrow>
        <h2 className="k-title">turtle et matplotlib fonctionnent dans Euclide.</h2>
        <p className="k-sub center">Les figures s'affichent sous le script, sans rien installer.</p>
      </Text>
      <figure className="k-sheet" style={{ left: 112, top: 470 }}>
        <Shot
          src="part-koch"
          size={[1944, 738]}
          box={{ left: 0, top: 0, width: 540, height: 430 }}
          crop={[652, 2, 640, 734]}
          paper
          className="flat"
        />
        <figcaption>turtle · Flocon de Koch</figcaption>
      </figure>
      <figure className="k-sheet" style={{ left: 690, top: 470 }}>
        <Shot
          src="part-mandelbrot"
          size={[1284, 742]}
          box={{ left: 0, top: 0, width: 540, height: 430 }}
          crop={[12, 12, 1260, 718]}
          paper
          className="flat"
        />
        <figcaption>matplotlib · Ensemble de Mandelbrot</figcaption>
      </figure>
      <figure className="k-sheet" style={{ left: 1268, top: 470 }}>
        <Shot
          src="part-galton"
          size={[1284, 742]}
          box={{ left: 0, top: 0, width: 540, height: 430 }}
          crop={[16, 16, 1252, 710]}
          paper
          className="flat"
        />
        <figcaption>matplotlib · Planche de Galton</figcaption>
      </figure>
    </Slide>
  );
}

function Checks() {
  return (
    <Slide name="verifier">
      <Text box={{ left: 112, top: 140, width: 640 }}>
        <Eyebrow>Exercices</Eyebrow>
        <h2 className="k-title">«&nbsp;Vérifier&nbsp;» corrige un exercice.</h2>
        <p className="k-sub">
          Le bouton exécute les exemples écrits sous chaque fonction, et montre ce qui est juste ou ce qui
          était attendu.
        </p>
        <Keys keys={[["Ctrl", "Maj", "Entrée"]]} />
      </Text>
      <div className="k-points" style={{ left: 112, top: 770, width: 640 }}>
        <Point icon={Keyboard} title="input() pose ses questions dans la console" />
        <Point icon={CircleStop} title="Le bouton Stop arrête le script" />
        <Point icon={Timer} title="Une limite de temps arrête les boucles sans fin" />
      </div>
      <Shot
        src="python-verifier"
        box={{ left: 820, width: 1100, top: 190 }}
        crop={[884, 80, 1996, 1200]}
        bleed="right"
      />
    </Slide>
  );
}

function SlidesFromNotes() {
  return (
    <Slide name="diaporama" stage>
      <Text box={{ left: 112, top: 130, width: 560 }}>
        <Eyebrow>Notes</Eyebrow>
        <h2 className="k-title">Une note se présente en diaporama.</h2>
        <p className="k-sub">F5 lance la présentation. Titres, formules et code s'adaptent à l'écran.</p>
        <Keys keys={[["F5"], ["←"], ["→"], ["B"]]} />
      </Text>
      <div className="k-points" style={{ left: 112, top: 720, width: 560 }}>
        <Point icon={Presentation} title="Les télécommandes de présentation marchent" />
        <Point icon={LayoutTemplate} title="Modèles de cours, d'exercices, d'évaluation" />
        <Point icon={FileText} title="Export en PDF, format A4" />
      </div>
      <Shot
        src="diaporama"
        box={{ left: 740, top: 150, width: 1180 }}
        crop={[0, 0, 2880, 1800]}
        bleed="right"
        className="k-screen"
      />
    </Slide>
  );
}

function Documents() {
  return (
    <Slide name="documents">
      <Text box={{ left: 112, top: 120, width: 1200 }}>
        <Eyebrow>Documents</Eyebrow>
        <h2 className="k-title">Les documents ont un aperçu.</h2>
        <p className="k-sub wide">
          La grille montre la première page de chaque document. La recherche lit aussi le texte des PDF, et
          les PDF s'annotent au stylo ou au surligneur.
        </p>
      </Text>
      <Shot src="documents" box={{ left: 112, width: 1120, top: 500 }} crop={[464, 80, 2416, 940]} />
      <Shot
        src="pdf"
        box={{ left: 1180, width: 640, top: 330 }}
        crop={[464, 80, 2416, 1720]}
        bleed="bottom"
      />
    </Slide>
  );
}

function NewLook() {
  return (
    <Slide name="nouveau-visage">
      <Text box={{ left: 160, top: 110, width: 1600 }} align="center">
        <Eyebrow>Interface</Eyebrow>
        <h2 className="k-title">L'interface a été redessinée.</h2>
        <p className="k-sub center">Les mêmes couleurs, en plus lisible. Un thème sombre est disponible.</p>
      </Text>
      <Shot src="tableau-de-bord" box={{ left: 96, width: 852, top: 470 }} crop={[0, 0, 2880, 1800]} />
      <Shot
        src="tableau-de-bord-sombre"
        box={{ left: 972, width: 852, top: 470 }}
        crop={[0, 0, 2880, 1800]}
        className="k-on-dark"
      />
    </Slide>
  );
}

function NewMark() {
  return (
    <Slide name="logo" stage>
      <div className="k-cover end">
        <Logo size={220} />
        <Eyebrow>Logo</Eyebrow>
        <h2 className="k-title">Un nouveau logo.</h2>
        <p className="k-sub center">
          Deux cercles tracés au compas et leur point d'intersection&nbsp;: la première construction des
          Éléments d'Euclide.
        </p>
      </div>
    </Slide>
  );
}

function AndMore() {
  const items: [LucideIcon, string][] = [
    [Pin, "Onglets déplaçables et épinglables"],
    [Keyboard, "Raccourcis adaptés au clavier français"],
    [Clock3, "Ctrl K propose d'abord les documents récents"],
    [CalendarRange, "Cahier de textes Pronote rangé par semaine"],
    [KeyRound, "Pronote ne redemande plus le mot de passe"],
    [Zap, "Emploi du temps Pronote en une requête"],
    [PencilLine, "Les rappels se modifient sur place"],
    [History, "Les versions des PDF annotés sont gardées"],
    [ArchiveRestore, "Sauvegardes restaurables dans les Réglages"],
    [ShieldCheck, "Rien n'est perdu à la fermeture"],
    [MonitorPlay, "L'écran reste allumé pendant les cours"],
    [Power, "Sous Windows, Python s'arrête avec Euclide"],
    [Contrast, "Contrastes conformes WCAG AA"],
    [Settings2, "Réglages rangés par sections"],
    [Gauge, "Démarrage et onglets plus rapides"],
  ];
  return (
    <Slide name="et-plus">
      <Text box={{ left: 160, top: 110, width: 1600 }} align="center">
        <h2 className="k-title">Autres changements.</h2>
      </Text>
      <div className="k-wall">
        {items.map(([icon, text]) => (
          <div key={text} className="k-chip">
            <Icon icon={icon} size={20} />
            <span>{text}</span>
          </div>
        ))}
      </div>
    </Slide>
  );
}

function Closing() {
  return (
    <Slide name="fin" stage>
      <div className="k-cover end">
        <Logo size={160} />
        <h1 className="k-cover-title">
          Euclide <span>0.4</span>
        </h1>
        <p className="k-cover-sub">
          Euclide propose la mise à jour à son ouverture. Il se ferme une fois la mise à jour installée&nbsp;:
          il suffit de le rouvrir.
        </p>
      </div>
    </Slide>
  );
}

/** The slides, in order; the overview alone is the changelog's picture. */
export default function Recap() {
  return (
    <main className="k-deck">
      <Cover />
      <Overview />
      <Whiteboard />
      <ClassTimer />
      <Lesson />
      <Templates />
      <PythonDraws />
      <Checks />
      <SlidesFromNotes />
      <Documents />
      <NewLook />
      <NewMark />
      <AndMore />
      <Closing />
    </main>
  );
}
