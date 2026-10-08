import { useRef, type PointerEvent as ReactPointerEvent } from "react";
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

const RULER = { length: 20 * CM, width: 3 * CM };
const SQUARE = 12 * CM;
const PROTRACTOR = 6.5 * CM;

/** A new instrument in the middle of what is on screen. */
export function placeInstrument(kind: InstrumentKind, view: View, w: number, h: number): Instrument {
  const c = { x: view.x + w / 2 / view.zoom, y: view.y + h / 2 / view.zoom };
  const at =
    kind === "ruler"
      ? { x: c.x - RULER.length / 2, y: c.y - RULER.width / 2 }
      : kind === "square"
        ? { x: c.x - SQUARE / 3, y: c.y - SQUARE / 3 }
        : kind === "protractor"
          ? { x: c.x, y: c.y + PROTRACTOR / 2 }
          : { x: c.x - 2 * CM, y: c.y + 2 * CM };
  return { kind, at, angle: 0, radius: 4 * CM, reading: Math.PI / 3 };
}

const rot = (p: P, a: number): P => ({
  x: p.x * Math.cos(a) - p.y * Math.sin(a),
  y: p.x * Math.sin(a) + p.y * Math.cos(a),
});
const toWorld = (inst: Instrument, local: P): P => {
  const r = rot(local, inst.angle);
  return { x: inst.at.x + r.x, y: inst.at.y + r.y };
};

/** The edges a pen can follow: the ruler's graduated edge, the square's three sides. */
export function edgesOf(inst: Instrument): [P, P][] {
  if (inst.kind === "ruler")
    return [[toWorld(inst, { x: 0, y: 0 }), toWorld(inst, { x: RULER.length, y: 0 })]];
  if (inst.kind === "square") {
    const o = toWorld(inst, { x: 0, y: 0 });
    const a = toWorld(inst, { x: SQUARE, y: 0 });
    const b = toWorld(inst, { x: 0, y: SQUARE });
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

/**
 * The instruments over the board, in an SVG that follows the view. Their
 * bodies let the pen through (drawing over a protractor works); grips move
 * them, knobs turn them. The compass: the needle moves it, the pencil
 * opens it, the knob on top draws.
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
          const grip = (local: P, label: string, mode: Drag["mode"]) => {
            const p = toWorld(inst, local);
            return (
              <circle
                cx={p.x}
                cy={p.y}
                r={11 / z}
                className={`eu-board-handle eu-board-handle-${mode}`}
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
            );
          };
          const close = (local: P) => {
            const p = toWorld(inst, local);
            return (
              <g
                className="eu-board-close"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onClose(i);
                }}
              >
                <circle cx={p.x} cy={p.y} r={9 / z} />
                <path
                  d={`M ${p.x - 3.5 / z} ${p.y - 3.5 / z} L ${p.x + 3.5 / z} ${p.y + 3.5 / z} M ${p.x + 3.5 / z} ${p.y - 3.5 / z} L ${p.x - 3.5 / z} ${p.y + 3.5 / z}`}
                  strokeWidth={1.5 / z}
                />
                <title>{tr("board.closeInstrument")}</title>
              </g>
            );
          };
          const frame = `translate(${inst.at.x} ${inst.at.y}) rotate(${(inst.angle * 180) / Math.PI})`;

          if (inst.kind === "ruler") {
            return (
              <g key={`${inst.kind}-${i}`}>
                <g transform={frame}>
                  <rect
                    x={-0.6 * CM}
                    y={0}
                    width={RULER.length + 1.2 * CM}
                    height={RULER.width}
                    rx={0.15 * CM}
                    className="eu-board-instrument"
                    strokeWidth={1 / z}
                  />
                  <RulerTicks length={RULER.length} zoom={z} />
                </g>
                {grip({ x: RULER.length / 2, y: RULER.width * 0.62 }, tr("board.move"), "move")}
                {grip({ x: RULER.length + 0.1 * CM, y: RULER.width * 0.62 }, tr("board.rotate"), "rotate")}
                {close({ x: -0.15 * CM, y: RULER.width * 0.62 })}
                <AngleLabel
                  inst={inst}
                  at={toWorld(inst, { x: RULER.length - 1.4 * CM, y: RULER.width * 0.62 })}
                  zoom={z}
                />
              </g>
            );
          }

          if (inst.kind === "square") {
            return (
              <g key={`${inst.kind}-${i}`}>
                <g transform={frame}>
                  <path
                    d={`M 0 0 L ${SQUARE} 0 L 0 ${SQUARE} Z M ${2.6 * CM} ${2.6 * CM} L ${SQUARE - 3.4 * CM} ${2.6 * CM} L ${2.6 * CM} ${SQUARE - 3.4 * CM} Z`}
                    fillRule="evenodd"
                    className="eu-board-instrument"
                    strokeWidth={1 / z}
                  />
                  <SquareTicks size={SQUARE} zoom={z} />
                  <path
                    d={`M ${0.7 * CM} 0 L ${0.7 * CM} ${0.7 * CM} L 0 ${0.7 * CM}`}
                    fill="none"
                    className="eu-board-ticks"
                    strokeWidth={1 / z}
                  />
                </g>
                {grip({ x: 1.6 * CM, y: 1.6 * CM }, tr("board.move"), "move")}
                {grip({ x: SQUARE * 0.5, y: SQUARE * 0.5 }, tr("board.rotate"), "rotate")}
                {close({ x: SQUARE - 0.9 * CM, y: 0.45 * CM })}
                <AngleLabel inst={inst} at={toWorld(inst, { x: 2.2 * CM, y: 3.4 * CM })} zoom={z} />
              </g>
            );
          }

          if (inst.kind === "protractor") {
            const r = PROTRACTOR;
            const needle = {
              x: (r + 0.4 * CM) * Math.cos(inst.reading),
              y: -(r + 0.4 * CM) * Math.sin(inst.reading),
            };
            return (
              <g key={`${inst.kind}-${i}`}>
                <g transform={frame}>
                  <path
                    d={`M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0 Z`}
                    className="eu-board-instrument"
                    strokeWidth={1 / z}
                  />
                  <ProtractorTicks radius={r} zoom={z} />
                  <line
                    x1={0}
                    y1={0}
                    x2={needle.x}
                    y2={needle.y}
                    className="eu-board-needle"
                    strokeWidth={1.5 / z}
                  />
                  <circle cx={0} cy={0} r={2.5 / z} className="eu-board-needle-dot" />
                  <text
                    x={needle.x * 0.62}
                    y={needle.y * 0.62 - 6 / z}
                    fontSize={15 / z}
                    className="eu-board-reading"
                    textAnchor="middle"
                  >
                    {degrees(inst.reading)}°
                  </text>
                </g>
                {grip({ x: 0, y: -r * 0.32 }, tr("board.move"), "move")}
                {grip({ x: r + 0.55 * CM, y: 0 }, tr("board.rotate"), "rotate")}
                {grip(needle, tr("board.reading"), "reading")}
                {close({ x: -r - 0.55 * CM, y: 0 })}
              </g>
            );
          }

          // Compass: needle at `at`, pencil `radius` away at `angle`.
          const pencil = toWorld(inst, { x: inst.radius, y: 0 });
          const hingeLocal = { x: inst.radius / 2, y: -Math.max(2.4 * CM, inst.radius * 0.55) };
          const hinge = toWorld(inst, hingeLocal);
          return (
            <g key={`${inst.kind}-${i}`}>
              <line
                x1={inst.at.x}
                y1={inst.at.y}
                x2={hinge.x}
                y2={hinge.y}
                className="eu-board-leg"
                strokeWidth={5 / z}
              />
              <line
                x1={pencil.x}
                y1={pencil.y}
                x2={hinge.x}
                y2={hinge.y}
                className="eu-board-leg"
                strokeWidth={5 / z}
              />
              <circle cx={pencil.x} cy={pencil.y} r={3 / z} fill={color} />
              <text
                x={(inst.at.x + pencil.x) / 2}
                y={(inst.at.y + pencil.y) / 2 + 18 / z}
                fontSize={13 / z}
                className="eu-board-reading"
                textAnchor="middle"
              >
                {`${cm(inst.radius)} cm`}
              </text>
              {grip({ x: 0, y: 0 }, tr("board.needle"), "move")}
              {grip({ x: inst.radius, y: 0 }, tr("board.pencil"), "pencil")}
              {grip(hingeLocal, tr("board.drawArc"), "draw")}
              {close({ x: hingeLocal.x + 1.1 * CM, y: hingeLocal.y })}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function AngleLabel({ inst, at, zoom }: { inst: Instrument; at: P; zoom: number }) {
  const a = ((-degrees(inst.angle) % 360) + 360) % 360;
  if (a === 0) return null;
  return (
    <text
      x={at.x}
      y={at.y}
      fontSize={12 / zoom}
      className="eu-board-reading"
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {a}°
    </text>
  );
}

function RulerTicks({ length, zoom }: { length: number; zoom: number }) {
  const ticks: string[] = [];
  const labels: { x: number; n: number }[] = [];
  for (let mm = 0; mm * MM <= length + 1e-6; mm++) {
    const x = mm * MM;
    const h = mm % 10 === 0 ? 0.62 * CM : mm % 5 === 0 ? 0.42 * CM : 0.26 * CM;
    // Millimetres only when they are at least 3 px apart.
    if (mm % 5 !== 0 && MM * zoom < 3) continue;
    ticks.push(`M ${x} 0 L ${x} ${h}`);
    if (mm % 10 === 0) labels.push({ x, n: mm / 10 });
  }
  return (
    <>
      <path d={ticks.join(" ")} className="eu-board-ticks" strokeWidth={1 / zoom} />
      {labels.map((l) => (
        <text
          key={l.n}
          x={l.x}
          y={0.62 * CM + 13 / zoom}
          fontSize={11 / zoom}
          textAnchor="middle"
          className="eu-board-tick-label"
        >
          {l.n}
        </text>
      ))}
    </>
  );
}

function SquareTicks({ size, zoom }: { size: number; zoom: number }) {
  const ticks: string[] = [];
  const labels: { at: number; n: number }[] = [];
  for (let mm = 0; mm * MM <= size - 1.2 * CM; mm++) {
    if (mm % 5 !== 0 && MM * zoom < 3) continue;
    const h = mm % 10 === 0 ? 0.45 * CM : mm % 5 === 0 ? 0.32 * CM : 0.2 * CM;
    ticks.push(`M ${mm * MM} 0 L ${mm * MM} ${h}`, `M 0 ${mm * MM} L ${h} ${mm * MM}`);
    if (mm % 10 === 0 && mm > 0) labels.push({ at: mm * MM, n: mm / 10 });
  }
  return (
    <>
      <path d={ticks.join(" ")} className="eu-board-ticks" strokeWidth={1 / zoom} />
      {labels.map((l) => (
        <g key={l.n}>
          <text
            x={l.at}
            y={0.45 * CM + 11 / zoom}
            fontSize={10 / zoom}
            textAnchor="middle"
            className="eu-board-tick-label"
          >
            {l.n}
          </text>
          <text
            x={0.45 * CM + 3 / zoom}
            y={l.at}
            fontSize={10 / zoom}
            dominantBaseline="middle"
            className="eu-board-tick-label"
          >
            {l.n}
          </text>
        </g>
      ))}
    </>
  );
}

function ProtractorTicks({ radius, zoom }: { radius: number; zoom: number }) {
  const ticks: string[] = [];
  const labels: { x: number; y: number; outer: number; rotate: number }[] = [];
  for (let d = 0; d <= 180; d++) {
    const a = (d * Math.PI) / 180;
    const len = d % 10 === 0 ? 0.7 * CM : d % 5 === 0 ? 0.45 * CM : 0.25 * CM;
    if (d % 5 !== 0 && radius * zoom * (Math.PI / 180) < 2.5) continue;
    const c = Math.cos(a);
    const s = -Math.sin(a);
    ticks.push(`M ${radius * c} ${radius * s} L ${(radius - len) * c} ${(radius - len) * s}`);
    if (d % 10 === 0) {
      const r = radius - 0.7 * CM - 9 / zoom;
      labels.push({ x: r * c, y: r * s, outer: d, rotate: 90 - d });
    }
  }
  return (
    <>
      <path d={ticks.join(" ")} className="eu-board-ticks" strokeWidth={1 / zoom} />
      <path d={`M ${-radius} 0 L ${radius} 0`} className="eu-board-ticks" strokeWidth={1 / zoom} />
      {labels.map((l) => (
        <g key={l.outer} transform={`translate(${l.x} ${l.y}) rotate(${l.rotate})`}>
          <text fontSize={9 / zoom} textAnchor="middle" className="eu-board-tick-label">
            {l.outer}
          </text>
          <text
            y={10 / zoom}
            fontSize={8 / zoom}
            textAnchor="middle"
            className="eu-board-tick-label eu-board-tick-inner"
          >
            {180 - l.outer}
          </text>
        </g>
      ))}
    </>
  );
}
