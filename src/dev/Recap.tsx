import type { CSSProperties, ReactNode } from "react";
import {
  ArchiveRestore,
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
// The overview: every change on one page (also the changelog's picture).
// ---------------------------------------------------------------------------

/** One part of Euclide: a picture, its name, what changed in it. */
function Part({ title, lines, children }: { title: string; lines: string[]; children: ReactNode }) {
  return (
    <section className="k-part">
      <div className="k-part-pic">{children}</div>
      <h2 className="k-part-title">{title}</h2>
      <ul className="k-part-list">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

/** A part's picture: the strip across its top, or half of it. */
const STRIP = { width: 448, height: 170 };
const HALF = { width: 224, height: 170 };

function Overview() {
  return (
    <Slide name="vue-d-ensemble" className="k-summary">
      <header className="k-summary-head">
        <Logo size={64} />
        <h1 className="k-summary-title">
          Euclide <span>0.4</span>
        </h1>
        <p className="k-summary-sub">Tout ce qui change dans cette version.</p>
      </header>
      <div className="k-summary-grid">
        <Part
          title="En classe"
          lines={[
            "Minuteur et horloge en plein écran.",
            "Minutes au clavier : 1 à 9, + et −.",
            "La séance du jour s'ouvre en un clic.",
            "« Séance faite » passe à l'étape suivante.",
            "L'écran reste allumé pendant les cours.",
          ].map(fr)}
        >
          <Shot
            src="minuteur"
            box={{ left: 0, top: 0, ...STRIP }}
            crop={[700, 533, 1480, 562]}
            className="flat borderless"
          />
        </Part>
        <Part
          title="Tableau blanc"
          lines={[
            "Règle, équerre, rapporteur et compas.",
            "Feuille infinie, avec zoom.",
            "Fonds Seyès, carreaux, points ou repère.",
            "Tracés aimantés et courbes de fonctions.",
            "Export en PNG et en PDF.",
          ].map(fr)}
        >
          <Shot
            src="part-tableau"
            size={[2416, 1584]}
            box={{ left: 0, top: 0, ...STRIP }}
            crop={[150, 760, 2100, 797]}
            paper
            className="flat borderless"
          />
        </Part>
        <Part
          title="Python"
          lines={[
            `${BUILT_IN.length} modèles, de la Seconde à la NSI.`,
            "turtle et matplotlib intégrés.",
            "« Vérifier » corrige les exercices.",
            "input(), bouton Stop, limite de temps.",
            "Nouvel éditeur, avec complétion.",
          ].map(fr)}
        >
          <Shot
            src="part-koch"
            size={[1944, 738]}
            box={{ left: 0, top: 0, ...HALF }}
            crop={[652, 2, 640, 734]}
            paper
            className="flat borderless"
          />
          <Shot
            src="part-mandelbrot"
            size={[1284, 742]}
            box={{ left: 224, top: 0, ...HALF }}
            crop={[500, 80, 620, 560]}
            paper
            className="flat borderless"
          />
        </Part>
        <Part
          title="Notes"
          lines={[
            "Une note devient un diaporama (F5).",
            "Export en PDF au format A4.",
            "Modèles : cours, exercices, évaluation…",
            "Toute note peut servir de modèle.",
            "Les formules seules sont centrées.",
          ].map(fr)}
        >
          <Shot
            src="part-diapo"
            box={{ left: 0, top: 0, ...STRIP }}
            crop={[200, 150, 2450, 790]}
            paper
            className="flat borderless"
          />
        </Part>
        <Part
          title="Documents"
          lines={[
            "Aperçu de la première page.",
            "La recherche lit le texte des PDF.",
            "Ctrl K propose d'abord les récents.",
            "PDF annotés, avec leurs versions.",
            "Tout au clavier : ↑ ↓ Entrée F2 Suppr.",
          ].map(fr)}
        >
          <Shot
            src="part-apercus"
            size={[2416, 1752]}
            box={{ left: 0, top: 0, ...STRIP }}
            crop={[188, 540, 1380, 524]}
            className="flat borderless"
          />
        </Part>
        <Part
          title="Pronote"
          lines={[
            "Cahier de textes rangé par semaine.",
            "Sur 4 semaines, 3 mois ou l'année.",
            "Le texte se sélectionne et se copie.",
            "Emploi du temps en une seule requête.",
            "Le mot de passe n'est plus redemandé.",
          ].map(fr)}
        >
          <Shot
            src="cahier-de-textes"
            box={{ left: 0, top: 0, ...STRIP }}
            crop={[620, 200, 1700, 645]}
            className="flat borderless"
          />
        </Part>
        <Part
          title="Interface"
          lines={[
            "Nouveau logo et nouveau design.",
            "Thème clair ou sombre.",
            "Onglets déplaçables et épinglables.",
            "Raccourcis adaptés au clavier français.",
            "Mises à jour dans la barre d'état.",
          ].map(fr)}
        >
          <Shot
            src="tableau-de-bord"
            box={{ left: 0, top: 0, ...HALF }}
            crop={[464, 80, 1240, 941]}
            className="flat borderless"
          />
          <Shot
            src="tableau-de-bord-sombre"
            box={{ left: 224, top: 0, ...HALF }}
            crop={[464, 80, 1240, 941]}
            className="flat borderless"
          />
        </Part>
        <Part
          title="Données"
          lines={[
            "Sauvegardes quotidiennes, restaurables.",
            "Rien n'est perdu à la fermeture.",
            "Copie de la base avant une mise à niveau.",
            "Python s'arrête avec Euclide.",
            "Démarrage et onglets plus rapides.",
          ].map(fr)}
        >
          <Shot
            src="sauvegardes"
            size={[2240, 1720]}
            box={{ left: 0, top: 0, ...STRIP }}
            crop={[500, 200, 1700, 645]}
            className="flat borderless"
          />
        </Part>
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
