import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { tr } from "../../lib/i18n";
import {
  CM,
  MM,
  dist,
  distToSegment,
  newId,
  projectOnLine,
  type Arc,
  type Circle,
  type P,
  type View,
} from "./model";

export type InstrumentKind = "ruler" | "square" | "protractor" | "compass";

/**
 * An instrument on the board. `at` is its anchor in world units: the
 * ruler's zero, the set square's right angle, the protractor's centre, the
 * compass's needle. `angle` turns it (radians, clockwise on screen).
 */
export interface Instrument {
  kind: InstrumentKind;
  at: P;
  angle: number;
  /** Compass: the opening, in world units. */
  radius: number;
  /** Protractor: the angle the needle reads (radians, 0 to π). */
  reading: number;
}

const RULER = { length: 20 * CM, width: 3 * CM, end: 0.6 * CM };
/** Legs of 12 cm, graduated to 10; the hollow leaves a band of 2.6 cm. */
const SQUARE = { size: 12 * CM, scale: 10, band: 2.6 * CM };
/** A strip below the base line, as on a real protractor. */
const PROTRACTOR = { radius: 6.5 * CM, foot: 0.6 * CM };

/** On screen, in pixels: grips, their touch area, close buttons, room around a body. */
const GRIP = 9;
const HIT = 15;
const CLOSE = 8;
const GAP = 8;
/** The tool palette covers this much of the board's left edge. */
const PALETTE = 64;

/** The compass's hinge and the top of its handle, for an opening. */
function compassShape(radius: number) {
  const h = Math.max(2.4 * CM, radius * 0.55);
  return { hinge: { x: radius / 2, y: -h }, top: -h - 1.4 * CM };
}

/** Text printed on an instrument: its real size, never under 8 px on screen. */
const printed = (size: number, zoom: number) => Math.max(size, 8 / zoom);
/** How wide a number is in the instrument's face (tabular digits). */
const numberWidth = (n: number, font: number) => String(n).length * 0.6 * font;
/** The first step that leaves 4 px between labels `pitch` apart (pixels). */
const labelStep = (pitch: number, width: number, steps: number[]) =>
  steps.find((s) => pitch * s >= width + 4) ?? steps[steps.length - 1];
const range = (from: number, to: number, step: number) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

const rot = (p: P, a: number): P => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a),
});
const toWorld = (inst: Instrument, local: P): P => {
  const r = rot(local, inst.angle);
  return { x: inst.at.x + r.x, y: inst.at.y + r.y };
};

type Box = { x0: number; y0: number; x1: number; y1: number };

/** What an instrument covers, in its own frame. */
function localBox(kind: InstrumentKind, radius: number): Box {
  if (kind === "ruler") return { x0: -RULER.end, y0: 0, x1: RULER.length + RULER.end, y1: RULER.width };
  if (kind === "square") return { x0: 0, y0: 0, x1: SQUARE.size, y1: SQUARE.size };
  if (kind === "protractor") {
    const r = PROTRACTOR.radius;
    return { x0: -r, y0: -r, x1: r, y1: PROTRACTOR.foot };
  }
  return { x0: -0.5 * CM, y0: compassShape(radius).top, x1: radius + 0.5 * CM, y1: 0.8 * CM };
}

function worldBox(inst: Instrument): Box {
  const b = localBox(inst.kind, inst.radius);
  const corners = [
    { x: b.x0, y: b.y0 },
    { x: b.x1, y: b.y0 },
    { x: b.x0, y: b.y1 },
    { x: b.x1, y: b.y1 },
  ].map((p) => toWorld(inst, p));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
  Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** Where a new instrument may go, as fractions of the visible board, best first. */
const SPOTS: [number, number][] = [
  [0.5, 0.5],
  [0.3, 0.32],
  [0.7, 0.32],
  [0.3, 0.7],
  [0.7, 0.7],
  [0.5, 0.25],
  [0.5, 0.78],
  [0.22, 0.5],
  [0.78, 0.5],
];

/**
 * A new instrument where it covers the fewest others and stays on screen:
 * the middle of the board first, then around it.
 */
export function placeInstrument(
  kind: InstrumentKind,
  view: View,
  w: number,
  h: number,
  others: Instrument[] = [],
): Instrument {
  const base: Instrument = { kind, at: { x: 0, y: 0 }, angle: 0, radius: 4 * CM, reading: Math.PI / 3 };
  const box = localBox(kind, base.radius);
  const visible: Box = {
    x0: view.x + PALETTE / view.zoom,
    y0: view.y,
    x1: view.x + w / view.zoom,
    y1: view.y + h / view.zoom,
  };
  const taken = others.map(worldBox);
  const margin = 0.5 * CM;
  let best = base;
  let bestCost = Infinity;
  for (const [fx, fy] of SPOTS) {
    const cx = visible.x0 + (visible.x1 - visible.x0) * fx;
    const cy = visible.y0 + (visible.y1 - visible.y0) * fy;
    const at = { x: cx - (box.x0 + box.x1) / 2, y: cy - (box.y0 + box.y1) / 2 };
    const here: Box = {
      x0: at.x + box.x0 - margin,
      y0: at.y + box.y0 - margin,
      x1: at.x + box.x1 + margin,
      y1: at.y + box.y1 + margin,
    };
    const area = (here.x1 - here.x0) * (here.y1 - here.y0);
    const cost = taken.reduce((sum, t) => sum + overlap(here, t), 0) + (area - overlap(here, visible));
    if (cost < bestCost - 1) {
      best = { ...base, at };
      bestCost = cost;
    }
    if (cost < 1) break;
  }
  return best;
}

/** The edges a pen can follow: the ruler's graduated edge, the square's three sides. */
export function edgesOf(inst: Instrument): [P, P][] {
  if (inst.kind === "ruler")
    return [[toWorld(inst, { x: 0, y: 0 }), toWorld(inst, { x: RULER.length, y: 0 })]];
  if (inst.kind === "square") {
    const o = toWorld(inst, { x: 0, y: 0 });
    const a = toWorld(inst, { x: SQUARE.size, y: 0 });
    const b = toWorld(inst, { x: 0, y: SQUARE.size });
    return [
      [o, a],
      [o, b],
      [a, b],
    ];
  }
  return [];
}

/** The edge a pen near it follows (within `tolerance`, world units). */
export function edgeNear(p: P, instruments: Instrument[], tolerance: number): [P, P] | null {
  let best: [P, P] | null = null;
  let bestD = tolerance;
  for (const inst of instruments)
    for (const e of edgesOf(inst)) {
      const d = distToSegment(p, e[0], e[1]);
      if (d <= bestD) {
        best = e;
        bestD = d;
      }
    }
  return best;
}

/** A point held on an edge: its projection, kept within the edge. */
export function alongEdge(p: P, [a, b]: [P, P]): P {
  const q = projectOnLine(p, a, b);
  const len = dist(a, b);
  const t = Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / (len * len)));
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/** Within 2° of a multiple of 15°, the angle settles on it. */
function settle(angle: number): number {
  const step = Math.PI / 12;
  const near = Math.round(angle / step) * step;
  return Math.abs(angle - near) < (2 * Math.PI) / 180 ? near : angle;
}

const degrees = (a: number) => Math.round((a * 180) / Math.PI);
const cm = (units: number) => (units / CM).toFixed(1).replace(".", ",");

type Drag =
  | { mode: "move"; start: P; from: P }
  /** Turns by as much as the pointer turns around the anchor: no jump. */
  | { mode: "rotate"; pointer0: number; angle0: number }
  | { mode: "reading" }
  | { mode: "pencil" }
  /** The compass turns with the pointer; the pencil draws from `start`. */
  | { mode: "draw"; start: number; last: number; sweep: number };

/** How a grip looks: arrows to move, a turn arrow, or a ring that shows the point under it. */
type GripLook = "move" | "turn" | "ring" | "pencil";
const GLYPHS: Partial<Record<GripLook, string>> = {
  move: "M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3",
  turn: "M20 12a8 8 0 1 1-2.35-5.65M20 4v4.5h-4.5",
};

/**
 * The instruments over the board, in an SVG that follows the view. They are
 * drawn at their real size, the numbers printed on them too (never under
 * 8 px, and fewer of them when zoomed out, so they never run together).
 * Their bodies let the pen through (drawing over a protractor works);
 * grips, kept off the graduations, move and turn them. The compass: the
 * needle moves it, the pencil opens it, the handle on top draws.
 */
export function InstrumentLayer({
  instruments,
  view,
  onChange,
  onClose,
  onDraw,
  snapPoint,
  color,
  width,
}: {
  instruments: Instrument[];
  view: View;
  onChange: (index: number, next: Instrument) => void;
  onClose: (index: number) => void;
  /** The compass drew: an arc, or a full circle. */
  onDraw: (item: Arc | Circle) => void;
  snapPoint: (p: P) => P;
  color: string;
  width: number;
}) {
  const drag = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const preview = useRef<SVGPathElement>(null);

  const worldOf = (e: ReactPointerEvent): P => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: view.x + (e.clientX - r.left) / view.zoom, y: view.y + (e.clientY - r.top) / view.zoom };
  };

  const begin = (e: ReactPointerEvent, d: Drag) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = d;
  };

  const handlers = (index: number) => {
    const inst = instruments[index];
    return {
      onPointerMove: (e: ReactPointerEvent) => {
        const d = drag.current;
        if (!d) return;
        const p = worldOf(e);
        if (d.mode === "move") {
          let at = { x: d.from.x + p.x - d.start.x, y: d.from.y + p.y - d.start.y };
          if (inst.kind === "compass" || inst.kind === "protractor") at = snapPoint(at);
          onChange(index, { ...inst, at });
        } else if (d.mode === "rotate") {
          const a = Math.atan2(p.y - inst.at.y, p.x - inst.at.x);
          onChange(index, { ...inst, angle: settle(d.angle0 + a - d.pointer0) });
        } else if (d.mode === "reading") {
          const local = rot({ x: p.x - inst.at.x, y: p.y - inst.at.y }, -inst.angle);
          const a = Math.atan2(-local.y, local.x);
          onChange(index, {
            ...inst,
            reading: settle(Math.max(0, Math.min(Math.PI, a < -Math.PI / 2 ? Math.PI : a))),
          });
        } else if (d.mode === "pencil") {
          const q = snapPoint(p);
          onChange(index, {
            ...inst,
            radius: Math.max(0.3 * CM, dist(inst.at, q)),
            angle: Math.atan2(q.y - inst.at.y, q.x - inst.at.x),
          });
        } else if (d.mode === "draw") {
          const a = Math.atan2(p.y - inst.at.y, p.x - inst.at.x);
          let step = a - d.last;
          if (step > Math.PI) step -= 2 * Math.PI;
          if (step < -Math.PI) step += 2 * Math.PI;
          d.sweep = Math.max(-2 * Math.PI, Math.min(2 * Math.PI, d.sweep + step));
          d.last = a;
          onChange(index, { ...inst, angle: d.start + d.sweep });
          const path = preview.current;
          if (path) {
            const r = inst.radius;
            const end = d.start + d.sweep;
            const x0 = inst.at.x + r * Math.cos(d.start);
            const y0 = inst.at.y + r * Math.sin(d.start);
            const x1 = inst.at.x + r * Math.cos(end);
            const y1 = inst.at.y + r * Math.sin(end);
            const large = Math.abs(d.sweep) > Math.PI ? 1 : 0;
            const sweepFlag = d.sweep > 0 ? 1 : 0;
            path.setAttribute(
              "d",
              Math.abs(d.sweep) >= 2 * Math.PI - 0.01
                ? `M ${inst.at.x + r} ${inst.at.y} a ${r} ${r} 0 1 1 ${-2 * r} 0 a ${r} ${r} 0 1 1 ${2 * r} 0`
                : `M ${x0} ${y0} A ${r} ${r} 0 ${large} ${sweepFlag} ${x1} ${y1}`,
            );
          }
        }
      },
      onPointerUp: () => {
        const d = drag.current;
        drag.current = null;
        if (d?.mode === "draw") {
          preview.current?.setAttribute("d", "");
          if (Math.abs(d.sweep) < 0.02) return;
          const base = { id: newId(), color, width, c: { ...inst.at }, r: inst.radius };
          onDraw(
            Math.abs(d.sweep) >= 2 * Math.PI - 0.05
              ? { ...base, kind: "circle" }
              : { ...base, kind: "arc", start: d.start, sweep: d.sweep },
          );
        }
      },
    };
  };

  const z = view.zoom;
  return (
    <svg ref={svgRef} className="eu-board-instruments" aria-hidden={instruments.length === 0}>
      <g transform={`scale(${z}) translate(${-view.x} ${-view.y})`}>
        <path ref={preview} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" />
        {instruments.map((inst, i) => {
          const h = handlers(i);
          const grip = (local: P, label: string, mode: Drag["mode"], look: GripLook) => {
            const p = toWorld(inst, local);
            const glyph = GLYPHS[look];
            const s = 0.42 / z;
            return (
              <g className={`eu-board-grip eu-board-grip-${look}`}>
                <circle cx={p.x} cy={p.y} r={GRIP / z} className="eu-board-grip-knob" />
                {glyph && (
                  <path
                    d={glyph}
                    transform={`translate(${p.x - 12 * s} ${p.y - 12 * s}) scale(${s})`}
                    className="eu-board-grip-glyph"
                  />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={HIT / z}
                  className="eu-board-grip-hit"
                  aria-label={label}
                  onPointerDown={(e) => {
                    const q = worldOf(e);
                    const pointer = Math.atan2(q.y - inst.at.y, q.x - inst.at.x);
                    if (mode === "move") begin(e, { mode, start: q, from: inst.at });
                    else if (mode === "rotate") begin(e, { mode, pointer0: pointer, angle0: inst.angle });
                    else if (mode === "draw") begin(e, { mode, start: inst.angle, last: pointer, sweep: 0 });
                    else begin(e, { mode } as Drag);
                  }}
                  {...h}
                >
                  <title>{label}</title>
                </circle>
              </g>
            );
          };
          const close = (local: P) => {
            const p = toWorld(inst, local);
            const x = 3 / z;
            return (
              <g className="eu-board-close">
                <circle cx={p.x} cy={p.y} r={CLOSE / z} className="eu-board-close-knob" />
                <path
                  d={`M ${p.x - x} ${p.y - x} L ${p.x + x} ${p.y + x} M ${p.x + x} ${p.y - x} L ${p.x - x} ${p.y + x}`}
                  className="eu-board-close-x"
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={(CLOSE + 4) / z}
                  className="eu-board-close-hit"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onClose(i);
                  }}
                >
                  <title>{tr("board.closeInstrument")}</title>
                </circle>
              </g>
            );
          };
          /** What sits just outside a body, `side` px further along local x. */
          const beyond = (x: number, side: number, y = 0): P => ({ x: x + side / z, y });
          const frame = `translate(${inst.at.x} ${inst.at.y}) rotate(${(inst.angle * 180) / Math.PI})`;

          if (inst.kind === "ruler") {
            const { length, width: w, end } = RULER;
            const knob = beyond(length + end, GRIP + GAP, w / 2);
            return (
              <g key={`${inst.kind}-${i}`}>
                <g transform={frame}>
                  <RulerFace zoom={z} />
                </g>
                {grip({ x: length / 2, y: rulerGripY(z) }, tr("board.move"), "move", "move")}
                {grip(knob, tr("board.rotate"), "rotate", "turn")}
                {close(beyond(-end, -(CLOSE + GAP), w / 2))}
                <AngleReadout
                  inst={inst}
                  at={toWorld(inst, { x: knob.x, y: knob.y + (GRIP + 14) / z })}
                  zoom={z}
                />
              </g>
            );
          }

          if (inst.kind === "square") {
            const knob = beyond(SQUARE.size, GRIP + GAP);
            return (
              <g key={`${inst.kind}-${i}`}>
                <g transform={frame}>
                  <SquareFace zoom={z} />
                </g>
                {grip(squareGrip(z), tr("board.move"), "move", "move")}
                {grip(knob, tr("board.rotate"), "rotate", "turn")}
                {close({ x: 0, y: SQUARE.size + (CLOSE + GAP) / z })}
                <AngleReadout
                  inst={inst}
                  at={toWorld(inst, { x: knob.x, y: knob.y + (GRIP + 14) / z })}
                  zoom={z}
                />
              </g>
            );
          }

          if (inst.kind === "protractor") {
            const r = PROTRACTOR.radius;
            const needle = {
              x: (r + 0.5 * CM) * Math.cos(inst.reading),
              y: -(r + 0.5 * CM) * Math.sin(inst.reading),
            };
            // The reading sits between the base line and the needle, inside the scales.
            const mid = Math.max(inst.reading / 2, Math.PI / 14);
            const knob = beyond(r, GRIP + GAP);
            return (
              <g key={`${inst.kind}-${i}`}>
                <g transform={frame}>
                  <ProtractorFace zoom={z} />
                  <line
                    x1={0}
                    y1={0}
                    x2={needle.x}
                    y2={needle.y}
                    className="eu-board-needle"
                    strokeWidth={1.5 / z}
                  />
                  <circle cx={0} cy={0} r={2.5 / z} className="eu-board-needle-dot" />
                </g>
                <Readout
                  at={toWorld(inst, { x: 0.42 * r * Math.cos(mid), y: -0.42 * r * Math.sin(mid) })}
                  zoom={z}
                  size={15}
                >
                  {degrees(inst.reading)}°
                </Readout>
                {grip({ x: 0, y: 0 }, tr("board.move"), "move", "ring")}
                {grip(knob, tr("board.rotate"), "rotate", "turn")}
                {grip(needle, tr("board.reading"), "reading", "pencil")}
                {close(beyond(-r, -(CLOSE + GAP)))}
                <AngleReadout
                  inst={inst}
                  at={toWorld(inst, { x: knob.x, y: knob.y + (GRIP + 14) / z })}
                  zoom={z}
                />
              </g>
            );
          }

          // Compass: needle at `at`, pencil `radius` away at `angle`.
          const { top } = compassShape(inst.radius);
          return (
            <g key={`${inst.kind}-${i}`}>
              <g transform={frame}>
                <CompassFace radius={inst.radius} zoom={z} color={color} />
              </g>
              <Readout at={toWorld(inst, { x: inst.radius / 2, y: 18 / z })} zoom={z}>
                {`${cm(inst.radius)} cm`}
              </Readout>
              {grip({ x: 0, y: 0 }, tr("board.needle"), "move", "ring")}
              {grip({ x: inst.radius, y: 0 }, tr("board.pencil"), "pencil", "pencil")}
              {grip({ x: inst.radius / 2, y: top }, tr("board.drawArc"), "draw", "turn")}
              {close(beyond(inst.radius / 2, GRIP + GAP + CLOSE, top))}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

/** A value read off an instrument: upright, with a paper halo over the lines under it. */
function Readout({
  at,
  zoom,
  size = 13,
  children,
}: {
  at: P;
  zoom: number;
  size?: number;
  children: ReactNode;
}) {
  return (
    <text
      x={at.x}
      y={at.y}
      fontSize={size / zoom}
      strokeWidth={4 / zoom}
      className="eu-board-readout"
      textAnchor="middle"
      dominantBaseline="central"
    >
      {children}
    </text>
  );
}

/** How far an instrument is turned, by its turn grip; nothing when straight. */
function AngleReadout({ inst, at, zoom }: { inst: Instrument; at: P; zoom: number }) {
  const a = ((-degrees(inst.angle) % 360) + 360) % 360;
  if (a === 0) return null;
  return (
    <Readout at={at} zoom={zoom} size={12}>
      {a}°
    </Readout>
  );
}

/** Millimetre, half-centimetre and centimetre ticks along x, `[mm, length]` each. */
function ticks(count: number, zoom: number, lengths: [number, number, number]) {
  const out: [number, number][] = [];
  for (let mm = 0; mm <= count; mm++) {
    const major = mm % 10 === 0;
    const half = mm % 5 === 0;
    // Only what stands at least 3 px apart.
    if (!half && MM * zoom < 3) continue;
    if (!major && 5 * MM * zoom < 3) continue;
    out.push([mm, major ? lengths[2] : half ? lengths[1] : lengths[0]]);
  }
  return out;
}

const RULER_TICK = 0.6 * CM;
const rulerFont = (zoom: number) => printed(0.3 * CM, zoom);
/** The ruler's numbers end here; its move grip goes below them. */
const rulerGripY = (zoom: number) =>
  Math.max(RULER.width * 0.64, RULER_TICK + 0.12 * CM + 0.72 * rulerFont(zoom) + (GRIP + 5) / zoom);

function RulerFace({ zoom }: { zoom: number }) {
  const { length, width, end } = RULER;
  const font = rulerFont(zoom);
  const step = labelStep(CM * zoom, numberWidth(20, font) * zoom, [1, 2, 5, 10]);
  const marks = ticks(200, zoom, [0.25 * CM, 0.4 * CM, RULER_TICK]);
  const baseline = RULER_TICK + 0.12 * CM + 0.72 * font;
  return (
    <>
      <rect
        x={-end}
        y={0}
        width={length + 2 * end}
        height={width}
        rx={0.12 * CM}
        className="eu-board-instrument"
        strokeWidth={1 / zoom}
      />
      <path
        d={marks.map(([mm, len]) => `M ${mm * MM} 0 V ${len}`).join(" ")}
        className="eu-board-ticks"
        strokeWidth={1 / zoom}
      />
      {range(0, 20, step).map((n) => (
        <text
          key={n}
          x={n * CM}
          y={baseline}
          fontSize={font}
          textAnchor="middle"
          className="eu-board-tick-label"
        >
          {n}
        </text>
      ))}
      <text
        x={step === 1 ? 0.5 * CM : 0.3 * CM + numberWidth(0, font)}
        y={baseline}
        fontSize={font * 0.72}
        textAnchor={step === 1 ? "middle" : "start"}
        className="eu-board-tick-label eu-board-tick-unit"
      >
        cm
      </text>
    </>
  );
}

const SQUARE_TICK = 0.45 * CM;
const squareFont = (zoom: number) => printed(0.28 * CM, zoom);
/** The move grip: in the band along the top leg, under its numbers. */
function squareGrip(zoom: number): P {
  const numbers = SQUARE_TICK + 0.1 * CM + 0.72 * squareFont(zoom);
  return { x: SQUARE.size * 0.42, y: (numbers + SQUARE.band) / 2 };
}

function SquareFace({ zoom }: { zoom: number }) {
  const { size, band, scale } = SQUARE;
  const font = squareFont(zoom);
  const step = labelStep(CM * zoom, numberWidth(10, font) * zoom, [1, 2, 5, 10]);
  const marks = ticks(scale * 10, zoom, [0.2 * CM, 0.32 * CM, SQUARE_TICK]);
  const inner = size - band - 0.8 * CM;
  const across = SQUARE_TICK + 0.1 * CM + 0.72 * font;
  return (
    <>
      <path
        d={`M 0 0 L ${size} 0 L 0 ${size} Z M ${band} ${band} L ${inner} ${band} L ${band} ${inner} Z`}
        fillRule="evenodd"
        className="eu-board-instrument"
        strokeWidth={1 / zoom}
      />
      <path
        d={marks.map(([mm, len]) => `M ${mm * MM} 0 V ${len} M 0 ${mm * MM} H ${len}`).join(" ")}
        className="eu-board-ticks"
        strokeWidth={1 / zoom}
      />
      {range(step, scale, step).map((n) => (
        <text
          key={`x${n}`}
          x={n * CM}
          y={across}
          fontSize={font}
          textAnchor="middle"
          className="eu-board-tick-label"
        >
          {n}
        </text>
      ))}
      {range(step, scale, step)
        // Near the right angle, the two rows of numbers would meet.
        .filter((n) => n * CM - 0.36 * font > across + 2 / zoom)
        .map((n) => (
          <text
            key={`y${n}`}
            x={SQUARE_TICK + 0.1 * CM}
            y={n * CM + 0.36 * font}
            fontSize={font}
            className="eu-board-tick-label"
          >
            {n}
          </text>
        ))}
    </>
  );
}

function ProtractorFace({ zoom }: { zoom: number }) {
  const { radius: r, foot } = PROTRACTOR;
  const marks: string[] = [];
  const unit = (r * zoom * Math.PI) / 180;
  for (let d = 0; d <= 180; d++) {
    if (d % 5 !== 0 && unit < 2.5) continue;
    if (d % 10 !== 0 && unit * 5 < 3) continue;
    const len = d % 10 === 0 ? 0.7 * CM : d % 5 === 0 ? 0.45 * CM : 0.25 * CM;
    const a = (d * Math.PI) / 180;
    const c = Math.cos(a);
    const s = -Math.sin(a);
    marks.push(`M ${r * c} ${r * s} L ${(r - len) * c} ${(r - len) * s}`);
  }
  // Two rows of numbers: 0 to 180 from the right outside, 180 to 0 inside.
  const outerFont = printed(0.27 * CM, zoom);
  const outerR = r - 0.8 * CM - 0.36 * outerFont;
  const pitch = (radius: number) => (radius * zoom * Math.PI) / 18;
  const outerStep = 10 * labelStep(pitch(outerR), numberWidth(180, outerFont) * zoom, [1, 2, 3, 9]);
  const innerFont = printed(0.22 * CM, zoom);
  const innerR = outerR - 0.36 * outerFont - 0.1 * CM - 0.36 * innerFont;
  const innerStep = 10 * labelStep(pitch(innerR), numberWidth(180, innerFont) * zoom, [1, 2, 3, 9]);
  const label = (d: number, radius: number, font: number, text: number, inner: boolean) => {
    const a = (d * Math.PI) / 180;
    return (
      <text
        key={`${inner ? "i" : "o"}${d}`}
        transform={`translate(${radius * Math.cos(a)} ${-radius * Math.sin(a)}) rotate(${90 - d})`}
        y={0.36 * font}
        fontSize={font}
        textAnchor="middle"
        className={inner ? "eu-board-tick-label eu-board-tick-inner" : "eu-board-tick-label"}
      >
        {text}
      </text>
    );
  };
  const guide = r - 0.7 * CM;
  return (
    <>
      <path
        d={`M ${-r} ${foot} L ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0 L ${r} ${foot} Z`}
        className="eu-board-instrument"
        strokeWidth={1 / zoom}
      />
      <path d={marks.join(" ")} className="eu-board-ticks" strokeWidth={1 / zoom} />
      <path
        d={`M ${-guide} 0 A ${guide} ${guide} 0 0 1 ${guide} 0`}
        className="eu-board-ticks eu-board-guide"
        strokeWidth={1 / zoom}
      />
      <path
        d={`M ${-r} 0 H ${r} M 0 ${-0.4 * CM} V ${foot}`}
        className="eu-board-ticks"
        strokeWidth={1 / zoom}
      />
      {range(0, 180, outerStep).map((d) => label(d, outerR, outerFont, d, false))}
      {innerStep <= 30 && range(0, 180, innerStep).map((d) => label(d, innerR, innerFont, 180 - d, true))}
    </>
  );
}

/** Two tapered legs from the hinge, a steel needle, a pencil lead in the ink's colour. */
function CompassFace({ radius, zoom, color }: { radius: number; zoom: number; color: string }) {
  const { hinge, top } = compassShape(radius);
  const leg = (tip: P, point: number) => {
    const len = dist(hinge, tip);
    const u = { x: (tip.x - hinge.x) / len, y: (tip.y - hinge.y) / len };
    const n = { x: -u.y, y: u.x };
    const foot = { x: tip.x - u.x * point, y: tip.y - u.y * point };
    const [w0, w1] = [0.2 * CM, 0.07 * CM];
    return {
      body: `M ${hinge.x + n.x * w0} ${hinge.y + n.y * w0} L ${foot.x + n.x * w1} ${foot.y + n.y * w1} L ${foot.x - n.x * w1} ${foot.y - n.y * w1} L ${hinge.x - n.x * w0} ${hinge.y - n.y * w0} Z`,
      lead: `M ${foot.x + n.x * w1} ${foot.y + n.y * w1} L ${tip.x} ${tip.y} L ${foot.x - n.x * w1} ${foot.y - n.y * w1} Z`,
      foot,
    };
  };
  const needle = leg({ x: 0, y: 0 }, 0.6 * CM);
  const pencil = leg({ x: radius, y: 0 }, 0.5 * CM);
  return (
    <>
      <path d={`${needle.body} ${pencil.body}`} className="eu-board-leg" strokeWidth={1 / zoom} />
      <line
        x1={needle.foot.x}
        y1={needle.foot.y}
        x2={0}
        y2={0}
        className="eu-board-steel"
        strokeWidth={1.4 / zoom}
      />
      <path d={pencil.lead} fill={color} className="eu-board-lead" strokeWidth={1 / zoom} />
      <rect
        x={hinge.x - 0.14 * CM}
        y={top}
        width={0.28 * CM}
        height={hinge.y - top}
        rx={0.1 * CM}
        className="eu-board-hinge"
      />
      <circle cx={hinge.x} cy={hinge.y} r={0.32 * CM} className="eu-board-hinge" />
    </>
  );
}
