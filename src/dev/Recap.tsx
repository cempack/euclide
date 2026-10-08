import { useAppearance } from "../lib/theme";
import "./recap.css";

/**
 * The release recap (?recap): one 16:9 board, in the manner of Apple's
 * « everything new » slides, made of the app's own surfaces. Its pictures
 * are real screenshots from scripts/changelog/capture.mjs (served from
 * scripts/changelog/shots); scripts/changelog/recap.mjs photographs it.
 */
/** Parts capture.mjs also takes in the dark theme, for the dark recap. */
const DARK_TOO = new Set(["part-maintenant", "part-verifications", "part-modeles"]);
const shot = (name: string, dark: boolean) =>
  `/scripts/changelog/shots/${name}${dark && DARK_TOO.has(name) ? "-dark" : ""}.png`;

/** The mark, in the theme's ink and accent (Proposition I until the logo is chosen). */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="8.5" cy="12.6" r="7" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="15.5" cy="12.6" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8.5 12.6 15.5 12.6 12 6.54Z"
        fill="var(--color-accent)"
        stroke="var(--color-accent)"
        strokeWidth="1.2"
      />
    </svg>
  );
}

/** A tile placed on the 12 × 6 grid. */
function Tile({
  col,
  row,
  tone,
  className = "",
  children,
}: {
  col: string;
  row: string;
  tone?: "stage" | "accent";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`recap-tile ${tone ?? ""} ${className}`} style={{ gridColumn: col, gridRow: row }}>
      {children}
    </section>
  );
}

/**
 * A screenshot at a place in its tile (px from the tile's edges). `zoom`
 * enlarges it past the frame (× the frame's width) and `focus` picks the
 * point of the picture that stays in view, as CSS background-position.
 */
function Shot({
  src,
  style,
  bleed,
  zoom,
  size,
  focus = "left top",
  contain,
  ui,
}: {
  src: string;
  style: React.CSSProperties;
  bleed?: boolean;
  zoom?: number;
  /** A raw background-size, when the picture must fill the frame's height. */
  size?: string;
  focus?: string;
  contain?: boolean;
  /** The picture is the app's UI (not paper): its frame takes the panel colour. */
  ui?: boolean;
}) {
  const dark = useAppearance().resolved === "dark";
  return (
    <div
      className={`recap-shot ${bleed ? "bleed" : ""}`}
      style={{
        ...style,
        backgroundImage: `url(${shot(src, dark)})`,
        backgroundColor: ui ? "var(--color-panel)" : undefined,
        backgroundSize: size ?? (zoom ? `${zoom * 100}% auto` : contain ? "contain" : "cover"),
        backgroundPosition: focus,
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}

export default function Recap() {
  return (
    <main className="recap">
      <Tile col="1 / 5" row="1 / 3" className="recap-hero">
        <div className="recap-brand">
          <Mark size={44} />
          <span className="recap-word">EUCLIDE</span>
        </div>
        <div>
          <h1 className="recap-title">
            Euclide <span>0.4</span>
          </h1>
          <p className="recap-promise">Notre plus grande mise à jour, pour la classe.</p>
        </div>
      </Tile>

      <Tile col="5 / 10" row="1 / 5">
        <span className="recap-eyebrow">Tableau blanc</span>
        <h2 className="recap-h wide">Règle, équerre, rapporteur et compas.</h2>
        <Shot src="part-tableau" bleed style={{ left: 28, top: 140, right: 0, bottom: 0 }} focus="8% 62%" />
      </Tile>

      <Tile col="10 / 13" row="1 / 3" tone="stage">
        <span className="recap-eyebrow">Vidéoprojecteur</span>
        <h2 className="recap-h">L’horloge de classe.</h2>
        <Shot
          src="horloge"
          bleed
          style={{ left: 0, right: 0, top: 150, bottom: 0, border: 0, borderRadius: 0, boxShadow: "none" }}
          zoom={1.5}
          focus="50% 40%"
        />
      </Tile>

      <Tile col="1 / 5" row="3 / 5">
        <span className="recap-eyebrow">Tableau de bord</span>
        <h2 className="recap-h">Le cours démarre en un clic.</h2>
        <Shot src="part-maintenant" bleed ui style={{ left: 28, top: 150, right: 0, bottom: 0 }} />
      </Tile>

      <Tile col="10 / 13" row="3 / 5">
        <span className="recap-eyebrow">Python</span>
        <h2 className="recap-h">Python dessine.</h2>
        <Shot
          src="part-tortue"
          style={{ left: 28, top: 128, width: 196, height: 196 }}
          zoom={3.4}
          focus="50% 50%"
        />
        <Shot src="part-courbe" style={{ right: 28, top: 158, width: 210, height: 150 }} contain />
      </Tile>

      <Tile col="1 / 5" row="5 / 7" tone="stage">
        <span className="recap-eyebrow">Notes</span>
        <h2 className="recap-h">Vos notes, en diaporama.</h2>
        <div className="recap-keys">
          <kbd>F5</kbd>
        </div>
        <Shot
          src="part-diapo"
          bleed
          style={{ left: 300, top: 26, right: 0, bottom: 0, border: 0 }}
          zoom={1.5}
          focus="0% 18%"
        />
      </Tile>

      <Tile col="5 / 7" row="5 / 7">
        <span className="recap-eyebrow">Exercices</span>
        <h2 className="recap-h">Corrigé en un clic.</h2>
        <Shot
          src="part-verifications"
          bleed
          ui
          style={{ left: 28, top: 150, right: 0, bottom: 0 }}
          zoom={3}
          focus="0% 0%"
        />
      </Tile>

      <Tile col="7 / 10" row="5 / 7">
        <div className="recap-number">14</div>
        <h2 className="recap-h">modèles pour démarrer en Python.</h2>
        <Shot
          src="part-modeles"
          bleed
          ui
          style={{ left: 300, top: 28, right: 0, bottom: 0 }}
          size="auto 132%"
          focus="0% 14%"
        />
      </Tile>

      <Tile col="10 / 13" row="5 / 7" tone="stage">
        <span className="recap-eyebrow">Thème sombre</span>
        <h2 className="recap-h">Soigné jusqu’au soir.</h2>
        <Shot
          src="tableau-de-bord-sombre"
          bleed
          ui
          style={{ left: 28, top: 150, right: 0, bottom: 0, borderColor: "var(--color-stage-line)" }}
          zoom={2.1}
          focus="30% 22%"
        />
      </Tile>
    </main>
  );
}
