import { Fragment, type CSSProperties, type ReactNode } from "react";
import {
  ArchiveRestore,
  ArrowUpDown,
  CalendarRange,
  ChartSpline,
  CircleStop,
  Clock3,
  Contrast,
  DatabaseBackup,
  Download,
  FileCheck2,
  FileText,
  Gauge,
  Grid3x3,
  History,
  ImageDown,
  Keyboard,
  LayoutTemplate,
  ListChecks,
  ListCollapse,
  Magnet,
  MessageSquareText,
  MonitorPlay,
  PencilLine,
  Pin,
  Power,
  Presentation,
  Settings2,
  ShieldCheck,
  TextSelect,
  Timer,
  Undo2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useAppearance } from "../lib/theme";
import { BUILT_IN, LEVELS } from "../features/python/templates";
import { Icon } from "../ui/Icon";
import { Logo } from "../ui/Logo";
import "./recap.css";

/**
 * The release keynote (?recap): Euclide 0.4 told the way Apple tells a
 * release — one idea per 16:9 slide, a short sentence, the real thing on
 * screen — in the app's own design language: its fonts, colours, panels
 * and the stage it projects on. The pictures are real screenshots from
 * scripts/changelog/capture.mjs (served from scripts/changelog/shots);
 * scripts/changelog/recap.mjs photographs each slide and binds the PDF.
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
// The overview: everything new on one board (also the release's picture).
// ---------------------------------------------------------------------------

function Tile({
  col,
  row,
  stage,
  className = "",
  children,
}: {
  col: string;
  row: string;
  stage?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`k-tile ${stage ? "stage" : ""} ${className}`} style={{ gridColumn: col, gridRow: row }}>
      {children}
    </div>
  );
}

function Overview() {
  return (
    <Slide name="vue-d-ensemble" className="k-overview">
      <Tile col="1 / 5" row="1 / 3" className="k-hero">
        <div className="flex items-center gap-4">
          <Logo size={56} />
          <span className="k-wordmark">EUCLIDE</span>
        </div>
        <div>
          <h1 className="k-hero-title">
            Euclide <span>0.4</span>
          </h1>
          <p className="k-hero-promise">Notre plus grande mise à jour, pensée pour la classe.</p>
        </div>
      </Tile>

      <Tile col="5 / 10" row="1 / 5">
        <Eyebrow>Tableau blanc</Eyebrow>
        <h2 className="k-tile-title wide">Règle, équerre, rapporteur et compas.</h2>
        <Shot
          src="part-tableau"
          size={[2416, 1584]}
          box={{ left: 28, top: 150, right: 0, bottom: 0 }}
          focus="12% 64%"
          bleed="right bottom"
          paper
        />
      </Tile>

      <Tile col="10 / 13" row="1 / 3" stage>
        <Eyebrow>Vidéoprojecteur</Eyebrow>
        <h2 className="k-tile-title">Le minuteur, en grand.</h2>
        <Shot
          src="minuteur"
          box={{ left: 0, right: 0, top: 124, bottom: 0 }}
          style={{ backgroundSize: "490px auto", backgroundPosition: "-21px -38px" }}
          className="flat borderless"
        />
      </Tile>

      <Tile col="1 / 5" row="3 / 5">
        <Eyebrow>Tableau de bord</Eyebrow>
        <h2 className="k-tile-title">La séance démarre en un clic.</h2>
        <Shot
          src="part-maintenant"
          size={[2032, 474]}
          box={{ left: 28, top: 156, right: 0, bottom: 0 }}
          focus="0% 0%"
          bleed="right bottom"
        />
      </Tile>

      <Tile col="10 / 13" row="3 / 5" stage>
        <Eyebrow>Python</Eyebrow>
        <h2 className="k-tile-title">Python dessine.</h2>
        <Shot
          src="part-koch"
          size={[1944, 738]}
          box={{ left: 24, top: 118, width: 168, height: 196 }}
          crop={[652, 2, 640, 734]}
          paper
        />
        <Shot
          src="part-mandelbrot"
          size={[1284, 742]}
          box={{ right: 24, top: 118, width: 168, height: 196 }}
          crop={[495, 84, 540, 560]}
          paper
        />
      </Tile>

      <Tile col="1 / 5" row="5 / 7" stage>
        <Eyebrow>Notes</Eyebrow>
        <h2 className="k-tile-title">Vos notes, en diaporama.</h2>
        <Keys keys={[["F5"]]} />
        <Shot
          src="part-diapo"
          box={{ left: 292, top: 28, right: 0, bottom: 0 }}
          focus="0% 20%"
          style={{ backgroundSize: "150% auto" }}
          bleed="right bottom"
          className="flat"
        />
      </Tile>

      <Tile col="5 / 7" row="5 / 7">
        <Eyebrow>Exercices</Eyebrow>
        <h2 className="k-tile-title">Corrigé en un clic.</h2>
        <Shot
          src="part-verifications"
          size={[1996, 922]}
          box={{ left: 28, top: 150, right: 0, bottom: 0 }}
          focus="0% 0%"
          style={{ backgroundSize: "300% auto" }}
          bleed="right bottom"
        />
      </Tile>

      <Tile col="7 / 10" row="5 / 7">
        <div className="k-number">{BUILT_IN.length}</div>
        <h2 className="k-tile-title">modèles Python, de la Seconde à la NSI.</h2>
        <Shot
          src="part-modeles"
          size={[2048, 1412]}
          box={{ left: 300, top: 28, right: 0, bottom: 0 }}
          focus="0% 12%"
          style={{ backgroundSize: "auto 140%" }}
          bleed="right bottom"
        />
      </Tile>

      <Tile col="10 / 13" row="5 / 7">
        <Eyebrow>Documents</Eyebrow>
        <h2 className="k-tile-title">Les aperçus, d'un coup d'œil.</h2>
        <Shot
          src="part-apercus"
          size={[2416, 1752]}
          box={{ left: 28, top: 150, width: 420, height: 173 }}
          crop={[188, 520, 1100, 452]}
          bleed="right bottom"
        />
      </Tile>
    </Slide>
  );
}

// ---------------------------------------------------------------------------
// The keynote.
// ---------------------------------------------------------------------------

function Cover() {
  return (
    <Slide name="couverture" stage>
      <div className="k-cover">
        <Logo size={128} />
        <h1 className="k-cover-title">
          Euclide <span>0.4</span>
        </h1>
        <p className="k-cover-sub">Le bureau du professeur de maths et de NSI, entièrement repensé.</p>
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
        <h2 className="k-title">Les instruments de géométrie, à l'écran.</h2>
        <p className="k-sub">
          Règle, équerre, rapporteur et compas, à leur vraie taille. Ils se posent, tournent et tracent, comme
          sur la table.
        </p>
      </Text>
      <div className="k-points k-points-2" style={{ left: 112, top: 730, width: 640 }}>
        <Point icon={Grid3x3} title="Seyès, carreaux, repère" />
        <Point icon={Magnet} title="Aimanté aux points" />
        <Point icon={ChartSpline} title="f(x) = … en direct" />
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
        <h2 className="k-title">Le minuteur, en grand.</h2>
        <p className="k-sub">
          Plein écran au vidéoprojecteur&nbsp;: l'anneau se vide, le cours en cours s'affiche, un carillon
          discret sonne la fin.
        </p>
      </Text>
      <div className="k-keyrows" style={{ left: 112, top: 690 }}>
        <div>
          <Keys keys={[["Ctrl", "Maj", "H"]]} />
          <span>l'horloge de classe</span>
        </div>
        <div>
          <Keys keys={[["1"], ["…"], ["9"]]} />
          <span>un minuteur de 1 à 9 minutes</span>
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
        <h2 className="k-title">La séance démarre en un clic.</h2>
        <p className="k-sub wide">
          Chaque étape de la progression garde ses documents, ses notes, son tableau et ses scripts.
          «&nbsp;Ouvrir la séance&nbsp;» ouvre tout&nbsp;; «&nbsp;Séance faite&nbsp;» passe à la suite.
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

function ClassBook() {
  return (
    <Slide name="cahier-de-textes">
      <Text box={{ left: 112, top: 140, width: 640 }}>
        <Eyebrow>Pronote</Eyebrow>
        <h2 className="k-title">Le cahier de textes, semaine par semaine.</h2>
        <p className="k-sub">
          Chaque séance avec son contenu, le travail donné et ses pièces jointes, rangée dans sa semaine.
        </p>
      </Text>
      <div className="k-points" style={{ left: 112, top: 720, width: 640 }}>
        <Point icon={CalendarRange} title="Sur 4 semaines, 3 mois ou l'année" />
        <Point icon={TextSelect} title="Le texte se sélectionne et se copie" />
        <Point icon={Zap} title="L'emploi du temps en une requête, au lieu de sept" />
      </div>
      <Shot
        src="cahier-de-textes"
        box={{ left: 800, width: 1120, top: 214 }}
        crop={[620, 120, 2080, 1610]}
        bleed="right bottom"
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
        <h2 className="k-title">
          {BUILT_IN.length} modèles.
          <br />
          Tout le programme.
        </h2>
        <p className="k-sub">
          De la Seconde à la Terminale, en Maths expertes et en NSI, rangés par niveau et par thème&nbsp;:
          prêts à projeter, prêts à modifier.
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

/** The names the wall lights up: the classics one looks for first. */
const CLASSICS = new Set([
  "Suite de Syracuse",
  "π par Monte-Carlo",
  "Méthode de Newton",
  "Algorithme de Briggs",
  "Planche de Galton",
  "Surréservation",
  "Euclide et Bézout",
  "Chiffrement de Hill",
  "RSA en petit",
  "PageRank",
  "Ensemble de Mandelbrot",
  "k plus proches voisins",
  "Recherche dichotomique",
  "Tours de Hanoï",
  "Tri fusion",
  "Flocon de Koch",
]);

/** Every template by name, level after level: the catalogue as a wall. */
function TemplateWall() {
  const levels = LEVELS.filter((l) => l.id !== "mine");
  return (
    <Slide name="mur-des-modeles" stage>
      <Text box={{ left: 160, top: 96, width: 1600 }} align="center">
        <Eyebrow>Python</Eyebrow>
        <h2 className="k-title">
          Du premier <code>print()</code> au chiffrement RSA.
        </h2>
      </Text>
      <p className="k-names">
        {levels.map((level) => (
          <Fragment key={level.id}>
            <span className="k-names-level">{level.label}</span>{" "}
            {BUILT_IN.filter((t) => t.level === level.id && t.id !== "bases/script-vide").map((t) => (
              <Fragment key={t.id}>
                <span className={`k-name ${CLASSICS.has(t.name) ? "classic" : ""}`}>{t.name}</span>{" "}
              </Fragment>
            ))}
          </Fragment>
        ))}
      </p>
    </Slide>
  );
}

function PythonEditor() {
  return (
    <Slide name="python-editeur">
      <Text box={{ left: 112, top: 140, width: 640 }}>
        <Eyebrow>Python</Eyebrow>
        <h2 className="k-title">Écrire. Exécuter. Voir.</h2>
        <p className="k-sub">
          Un véritable éditeur, qui colore, complète et cherche. Le résultat s'affiche juste en dessous&nbsp;:
          console, dessin ou graphique.
        </p>
        <Keys keys={[["Ctrl", "Entrée"]]} />
      </Text>
      <div className="k-points" style={{ left: 112, top: 690, width: 640 }}>
        <Point icon={Keyboard} title="input() pose ses questions dans la console" />
        <Point icon={CircleStop} title="Stop arrête le script, à tout moment" />
        <Point icon={Timer} title="Une limite de temps coupe les boucles sans fin" />
        <Point icon={ImageDown} title="Le dessin s'enregistre dans la bibliothèque" />
      </div>
      <Shot
        src="python-courbe"
        box={{ left: 820, width: 1100, top: 183 }}
        crop={[870, 80, 2010, 1640]}
        bleed="right bottom"
        className="k-on-dark"
      />
    </Slide>
  );
}

function PythonDraws() {
  return (
    <Slide name="python-dessine" stage>
      <Text box={{ left: 160, top: 110, width: 1600 }} align="center">
        <Eyebrow>Python</Eyebrow>
        <h2 className="k-title">Python dessine. Et trace.</h2>
        <p className="k-sub center">
          turtle et matplotlib sont intégrés&nbsp;: les figures s'affichent dans Euclide, sans rien installer.
        </p>
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
        <h2 className="k-title">Corrigé en un clic.</h2>
        <p className="k-sub">
          «&nbsp;Vérifier&nbsp;» rejoue les exemples écrits sous chaque fonction&nbsp;: ce qui est juste, et
          sinon l'attendu face à l'obtenu.
        </p>
        <Keys keys={[["Ctrl", "Maj", "Entrée"]]} />
      </Text>
      <div className="k-points" style={{ left: 112, top: 700, width: 640 }}>
        <Point icon={ListChecks} title="Les exemples >>> deviennent des tests" />
        <Point icon={FileCheck2} title="Ou un fichier à part, nom.checks.py" />
        <Point icon={PencilLine} title="Des exercices prêts, à compléter" />
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

function Notes() {
  return (
    <Slide name="notes">
      <Text box={{ left: 112, top: 104, width: 1696 }}>
        <Eyebrow>Notes</Eyebrow>
        <h2 className="k-title">Les maths s'écrivent comme au tableau.</h2>
        <p className="k-sub full">
          Le texte et les formules LaTeX d'un côté, le rendu de l'autre, au fil de la frappe. Une formule
          seule sur sa ligne se centre d'elle-même.
        </p>
      </Text>
      <Shot
        src="note"
        box={{ left: 112, width: 1696, top: 400 }}
        crop={[464, 80, 2416, 1260]}
        bleed="bottom"
      />
    </Slide>
  );
}

function SlidesFromNotes() {
  return (
    <Slide name="diaporama" stage>
      <Text box={{ left: 112, top: 130, width: 560 }}>
        <Eyebrow>Notes</Eyebrow>
        <h2 className="k-title">Vos notes deviennent un diaporama.</h2>
        <p className="k-sub">
          F5, et le cours passe en grand&nbsp;: titres, formules et code s'ajustent à l'écran.
        </p>
        <Keys keys={[["F5"], ["←"], ["→"], ["B"]]} />
      </Text>
      <div className="k-points" style={{ left: 112, top: 720, width: 560 }}>
        <Point icon={Presentation} title="Les télécommandes de présentation aussi" />
        <Point icon={LayoutTemplate} title="Modèles de cours, d'exercices, d'évaluation" />
        <Point icon={FileText} title="Export en vrai PDF, format A4" />
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
        <h2 className="k-title">Tous vos documents, d'un coup d'œil.</h2>
        <p className="k-sub wide">
          Les aperçus des PDF, une recherche qui lit dans les documents, et l'annotation au stylo comme au
          surligneur.
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

function Search() {
  return (
    <Slide name="recherche" stage>
      <Text box={{ left: 160, top: 104, width: 1600 }} align="center">
        <Eyebrow>Recherche</Eyebrow>
        <h2 className="k-title">Ctrl K. Et tout est là.</h2>
        <p className="k-sub center">
          Un cours, un document, une note&nbsp;: quelques lettres suffisent. Même à l'intérieur des PDF.
        </p>
      </Text>
      <Shot
        src="part-recherche"
        size={[1152, 572]}
        box={{ left: 384, width: 1152, top: 430 }}
        crop={[0, 0, 1152, 572]}
      />
    </Slide>
  );
}

function Backups() {
  return (
    <Slide name="sauvegardes">
      <Text box={{ left: 112, top: 140, width: 620 }}>
        <Eyebrow>Vos données</Eyebrow>
        <h2 className="k-title">Vos cours, à l'abri.</h2>
        <p className="k-sub">
          Chaque jour, une copie complète de vos données sur la clé. Et une autre ailleurs, si vous le
          voulez&nbsp;: une clé peut se perdre.
        </p>
      </Text>
      <div className="k-points" style={{ left: 112, top: 640, width: 620 }}>
        <Point icon={ShieldCheck} title="Les données vérifiées à chaque démarrage" />
        <Point icon={History} title="Les 7 derniers jours, puis une copie par semaine" />
        <Point icon={ArchiveRestore} title="Revenir à un jour choisi, sans rien effacer" />
      </div>
      <Shot
        src="sauvegardes"
        size={[2240, 1720]}
        box={{ left: 780, width: 1100, top: 190 }}
        crop={[500, 180, 1700, 1130]}
      />
    </Slide>
  );
}

function NewLook() {
  return (
    <Slide name="nouveau-visage">
      <Text box={{ left: 160, top: 110, width: 1600 }} align="center">
        <Eyebrow>Interface</Eyebrow>
        <h2 className="k-title">Un nouveau visage. Clair, ou sombre.</h2>
        <p className="k-sub center">
          Les mêmes couleurs, plus lisibles jusque dans les détails. Et un thème sombre soigné, pour le soir.
        </p>
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
        <Eyebrow>Identité</Eyebrow>
        <h2 className="k-title">Un nouveau logo.</h2>
        <p className="k-sub center">
          Deux cercles tracés au compas, et le point où ils se coupent&nbsp;: la toute première construction
          des Éléments d'Euclide.
        </p>
      </div>
    </Slide>
  );
}

/** The release in numbers, each one counted or checked in the code. */
function Figures() {
  const themes = LEVELS.filter((l) => l.id !== "mine").reduce((n, l) => n + l.themes.length, 0);
  const figures: [number, string][] = [
    [BUILT_IN.length, "modèles Python, tous testés"],
    [themes, "thèmes, rangés niveau par niveau"],
    [4, "instruments de géométrie, à leur vraie taille"],
    [5, "fonds de feuille, du Seyès au repère"],
    [5, "modèles de notes, du cours à l'évaluation"],
    [9, "minuteurs, chacun sur sa touche"],
    [1, "requête à Pronote pour toute la semaine, au lieu de 7"],
    [0, "logiciel à installer pour dessiner en Python"],
  ];
  return (
    <Slide name="en-chiffres">
      <Text box={{ left: 160, top: 110, width: 1600 }} align="center">
        <h2 className="k-title">Euclide 0.4, en chiffres.</h2>
      </Text>
      <div className="k-figures">
        {figures.map(([n, label]) => (
          <div key={label}>
            <span className="k-figure-n">{n}</span>
            <span className="k-figure-label">{label}</span>
          </div>
        ))}
      </div>
    </Slide>
  );
}

function AndMore() {
  const items: [LucideIcon, string][] = [
    [Pin, "Onglets qu'on glisse et qu'on épingle"],
    [ListCollapse, "Un menu pour les onglets qui débordent"],
    [Keyboard, "Raccourcis pensés pour le clavier français"],
    [ArrowUpDown, "Les documents au clavier\u00a0: ↑ ↓ Entrée F2 Suppr"],
    [Undo2, "Rappels\u00a0: modifier sur place, annuler d'un clic"],
    [History, "Les versions des PDF annotés"],
    [Clock3, "La palette propose d'abord les documents récents"],
    [ShieldCheck, "Rien n'est perdu à la fermeture"],
    [MonitorPlay, "L'écran reste allumé pendant les cours"],
    [Power, "Sous Windows, Python s'arrête avec Euclide"],
    [DatabaseBackup, "Une copie de la base avant chaque mise à niveau"],
    [Contrast, "Contrastes conformes WCAG AA"],
    [MessageSquareText, "Des infobulles partout"],
    [Settings2, "Réglages rangés par sections"],
    [Gauge, "Chaque écran se charge à sa première ouverture"],
  ];
  return (
    <Slide name="et-plus">
      <Text box={{ left: 160, top: 110, width: 1600 }} align="center">
        <h2 className="k-title">Et bien plus encore.</h2>
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
          Disponible maintenant&nbsp;: la mise à jour s'annonce dans la barre d'état d'Euclide.
        </p>
      </div>
    </Slide>
  );
}

/** The slides, in order; the overview alone is the release's picture. */
export default function Recap() {
  return (
    <main className="k-deck">
      <Cover />
      <Overview />
      <Whiteboard />
      <ClassTimer />
      <Lesson />
      <ClassBook />
      <Templates />
      <TemplateWall />
      <PythonEditor />
      <PythonDraws />
      <Checks />
      <Notes />
      <SlidesFromNotes />
      <Documents />
      <Search />
      <Backups />
      <NewLook />
      <NewMark />
      <Figures />
      <AndMore />
      <Closing />
    </main>
  );
}
