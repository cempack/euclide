/**
 * The whiteboard's document (format 3): drawings in world units on an
 * infinite sheet. One world unit is one CSS pixel at 100 %, so a centimetre
 * is about 38 units, the size a ruler shows on screen. A board of several
 * pages keeps the first one where format 3 always had it and the others in
 * `more`: a board of one page is written as before.
 *
 * Format 2 kept every coordinate as a fraction of the window's width and
 * height, so a circle stretched with the window; `parseBoard` turns it into
 * world units on a 16:10 page.
 */

export const MM = 96 / 25.4;
export const CM = 10 * MM;

export type P = { x: number; y: number };

export type Background = "plain" | "seyes" | "squares" | "dots" | "axes";

interface Stroked {
  id: string;
  color: string;
  /** Line width, in world units. */
  width: number;
}

/** Freehand ink: a flat list of x, y. `erase` strokes come from format 2. */
export interface Ink extends Stroked {
  kind: "ink";
  pts: number[];
  opacity?: number;
  erase?: boolean;
}
export interface Segment extends Stroked {
  kind: "segment";
  a: P;
  b: P;
  dashed?: boolean;
}
export interface Circle extends Stroked {
  kind: "circle";
  c: P;
  r: number;
}
/** An arc of the compass: from `start`, `sweep` radians (sign = direction). */
export interface Arc extends Stroked {
  kind: "arc";
  c: P;
  r: number;
  start: number;
  sweep: number;
}
export interface Rect extends Stroked {
  kind: "rect";
  a: P;
  b: P;
}
export interface Ellipse extends Stroked {
  kind: "ellipse";
  a: P;
  b: P;
}
/** A named point (« A »), drawn as a cross. */
export interface PointItem {
  id: string;
  kind: "point";
  p: P;
  label: string;
  color: string;
}
export interface Text {
  id: string;
  kind: "text";
  /** Top-left corner of the first line. */
  p: P;
  text: string;
  size: number;
  color: string;
}
/** The graph of f(x) on the axes (Repère): `expr` is the right-hand side. */
export interface Plot extends Stroked {
  kind: "plot";
  expr: string;
}
/**
 * A picture of the library (`file`, its id), `w` × `h` world units from its
 * top-left corner `p`. Pictures lie under the drawing: ink goes over them.
 */
export interface Picture {
  id: string;
  kind: "image";
  p: P;
  w: number;
  h: number;
  file: number;
}
/** A formula in LaTeX, set by KaTeX at `size`; `w` × `h` is its box then. */
export interface MathItem {
  id: string;
  kind: "math";
  p: P;
  tex: string;
  size: number;
  color: string;
  w: number;
  h: number;
}

export type Item =
  Ink | Segment | Circle | Arc | Rect | Ellipse | PointItem | Text | Plot | Picture | MathItem;

/** Where the screen looks: the world point at its top-left, and the scale. */
export interface View {
  x: number;
  y: number;
  zoom: number;
}

export interface Board {
  version: 3;
  background: Background;
  items: Item[];
  view?: View;
  /** The pages after the first. */
  more?: Sheet[];
  /** The page shown when the board was saved, from 0. */
  page?: number;
}

/** One page of a board. */
export interface Sheet {
  background: Background;
  items: Item[];
  view?: View;
}

export const emptyBoard = (): Board => ({ version: 3, background: "plain", items: [] });

let counter = 0;
/** Ids unique within a board, short enough for the file. */
export const newId = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

// ---------------------------------------------------------------------------
// Reading files
// ---------------------------------------------------------------------------

/** Format 2 drew on the window; a 16:10 page keeps its proportions. */
const V2_PAGE = { w: 1600, h: 1000 };

interface V2 {
  version?: number;
  strokes?: { color: string; size: number; eraser: boolean; pts: P[]; opacity?: number }[];
  shapes?: {
    type: "line" | "rect" | "ellipse";
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color: string;
    size: number;
  }[];
  texts?: { x: number; y: number; text: string; color: string; size: number }[];
}

function fromV2(d: V2): Board {
  const { w, h } = V2_PAGE;
  const at = (x: number, y: number): P => ({ x: x * w, y: y * h });
  const items: Item[] = [];
  for (const s of d.strokes ?? []) {
    if (!s?.pts?.length) continue;
    items.push({
      id: newId(),
      kind: "ink",
      color: s.color,
      width: s.eraser ? s.size * 2.5 : s.size,
      opacity: s.opacity,
      erase: s.eraser || undefined,
      pts: s.pts.flatMap((p) => [p.x * w, p.y * h]),
    });
  }
  for (const s of d.shapes ?? []) {
    const a = at(s.x1, s.y1);
    const b = at(s.x2, s.y2);
    const base = { id: newId(), color: s.color, width: s.size };
    if (s.type === "line") items.push({ ...base, kind: "segment", a, b });
    else if (s.type === "rect") items.push({ ...base, kind: "rect", a, b });
    else items.push({ ...base, kind: "ellipse", a, b });
  }
  for (const t of d.texts ?? []) {
    items.push({ id: newId(), kind: "text", p: at(t.x, t.y), text: t.text, color: t.color, size: t.size });
  }
  return { version: 3, background: "plain", items };
}

/** Any saved board (format 1, 2 or 3); an empty one if the file is not a board. */
export function parseBoard(raw: string | null | undefined): Board {
  if (!raw) return emptyBoard();
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return emptyBoard();
  }
  if (!d || typeof d !== "object") return emptyBoard();
  const doc = d as Partial<Board> & V2;
  if (doc.version === 3 && Array.isArray(doc.items)) {
    const first = sheetOf(doc);
    const more = Array.isArray(doc.more)
      ? doc.more.filter((m) => m && typeof m === "object").map(sheetOf)
      : [];
    return {
      version: 3,
      ...first,
      ...(more.length ? { more } : {}),
      ...(Number.isInteger(doc.page) && doc.page! > 0 && doc.page! <= more.length ? { page: doc.page } : {}),
    };
  }
  return fromV2(doc);
}

function sheetOf(d: Partial<Sheet>): Sheet {
  return {
    background: d.background ?? "plain",
    items: (Array.isArray(d.items) ? d.items : []).filter(
      (i): i is Item => !!i && typeof i === "object" && "kind" in i,
    ),
    ...(d.view ? { view: d.view } : {}),
  };
}

/** A board's pages, the first one first. */
export const sheetsOf = (b: Board): Sheet[] => [
  { background: b.background, items: b.items, ...(b.view ? { view: b.view } : {}) },
  ...(b.more ?? []),
];

/** The file of a board of these pages, `page` the one shown. */
export function boardJson(sheets: Sheet[], page = 0): string {
  const [first, ...more] = sheets.length ? sheets : [{ background: "plain" as const, items: [] }];
  const board: Board = {
    version: 3,
    background: first.background,
    items: first.items,
    ...(first.view ? { view: first.view } : {}),
    ...(more.length ? { more } : {}),
    ...(page > 0 && page < sheets.length ? { page } : {}),
  };
  return JSON.stringify(board);
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

/** Distance from `p` to the segment [a, b]. */
export function distToSegment(p: P, a: P, b: P): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** The point of the line (a, b) closest to `p`. */
export function projectOnLine(p: P, a: P, b: P): P {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

const norm = (angle: number) => {
  const t = angle % (2 * Math.PI);
  return t < 0 ? t + 2 * Math.PI : t;
};

/** Whether `angle` lies on the arc that starts at `start` and turns `sweep`. */
export function onArc(angle: number, start: number, sweep: number): boolean {
  if (Math.abs(sweep) >= 2 * Math.PI - 1e-9) return true;
  const d = norm(sweep >= 0 ? angle - start : start - angle);
  return d <= Math.abs(sweep) + 1e-9;
}

function ellipseOutline(a: P, b: P, steps = 72): P[] {
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const rx = Math.abs(b.x - a.x) / 2;
  const ry = Math.abs(b.y - a.y) / 2;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = (i / steps) * 2 * Math.PI;
    return { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) };
  });
}

function rectCorners(a: P, b: P): P[] {
  return [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a];
}

/** Rough width of a text, without a canvas (export and hit tests). */
export function textBox(t: Text): { w: number; h: number } {
  const lines = t.text.split("\n");
  return {
    w: Math.max(...lines.map((l) => l.length)) * t.size * 0.56,
    h: lines.length * t.size * 1.25,
  };
}

/** Distance from `p` to what an item draws (0 inside a text). */
export function distanceTo(item: Item, p: P, plot?: (x: number) => number): number {
  switch (item.kind) {
    case "ink": {
      const pts = item.pts;
      if (pts.length < 4) return Math.hypot(p.x - pts[0], p.y - pts[1]);
      let best = Infinity;
      for (let i = 0; i + 3 < pts.length; i += 2) {
        best = Math.min(
          best,
          distToSegment(p, { x: pts[i], y: pts[i + 1] }, { x: pts[i + 2], y: pts[i + 3] }),
        );
      }
      return best;
    }
    case "segment":
      return distToSegment(p, item.a, item.b);
    case "circle":
      return Math.abs(dist(p, item.c) - item.r);
    case "arc": {
      const angle = Math.atan2(p.y - item.c.y, p.x - item.c.x);
      if (onArc(angle, item.start, item.sweep)) return Math.abs(dist(p, item.c) - item.r);
      const [e1, e2] = arcEnds(item);
      return Math.min(dist(p, e1), dist(p, e2));
    }
    case "rect":
    case "ellipse": {
      const outline = item.kind === "rect" ? rectCorners(item.a, item.b) : ellipseOutline(item.a, item.b);
      let best = Infinity;
      for (let i = 0; i + 1 < outline.length; i++)
        best = Math.min(best, distToSegment(p, outline[i], outline[i + 1]));
      return best;
    }
    case "point":
      return dist(p, item.p);
    case "text":
    case "image":
    case "math": {
      const { w, h } = item.kind === "text" ? textBox(item) : item;
      const dx = Math.max(item.p.x - p.x, 0, p.x - (item.p.x + w));
      const dy = Math.max(item.p.y - p.y, 0, p.y - (item.p.y + h));
      return Math.hypot(dx, dy);
    }
    case "plot": {
      if (!plot) return Infinity;
      // The curve's height at the pointer, in world units (axes: y up, CM per unit).
      const y = plot(p.x / CM);
      return Number.isFinite(y) ? Math.abs(-y * CM - p.y) : Infinity;
    }
  }
}

export function arcEnds(a: Arc): [P, P] {
  const end = a.start + a.sweep;
  return [
    { x: a.c.x + a.r * Math.cos(a.start), y: a.c.y + a.r * Math.sin(a.start) },
    { x: a.c.x + a.r * Math.cos(end), y: a.c.y + a.r * Math.sin(end) },
  ];
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** What an item covers (plots cover nothing: they follow the view). */
export function boundsOf(item: Item): Box | null {
  const pad = "width" in item ? item.width / 2 : 0;
  const box = (xs: number[], ys: number[]): Box => ({
    x0: Math.min(...xs) - pad,
    y0: Math.min(...ys) - pad,
    x1: Math.max(...xs) + pad,
    y1: Math.max(...ys) + pad,
  });
  switch (item.kind) {
    case "ink": {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let i = 0; i < item.pts.length; i += 2) {
        x0 = Math.min(x0, item.pts[i]);
        x1 = Math.max(x1, item.pts[i]);
        y0 = Math.min(y0, item.pts[i + 1]);
        y1 = Math.max(y1, item.pts[i + 1]);
      }
      return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
    }
    case "segment":
    case "rect":
    case "ellipse":
      return box([item.a.x, item.b.x], [item.a.y, item.b.y]);
    case "circle":
    case "arc":
      return box([item.c.x - item.r, item.c.x + item.r], [item.c.y - item.r, item.c.y + item.r]);
    case "point":
      return {
        x0: item.p.x - 8,
        y0: item.p.y - 8,
        x1: item.p.x + 8 + item.label.length * 12,
        y1: item.p.y + 8,
      };
    case "text":
    case "image":
    case "math": {
      const { w, h } = item.kind === "text" ? textBox(item) : item;
      return { x0: item.p.x, y0: item.p.y, x1: item.p.x + w, y1: item.p.y + h };
    }
    case "plot":
      return null;
  }
}

// ---------------------------------------------------------------------------
// Moving and resizing (the selection tool)
// ---------------------------------------------------------------------------

const shift = (p: P, dx: number, dy: number): P => ({ x: p.x + dx, y: p.y + dy });

/** The item moved by (dx, dy). A plot follows the axes and stays. */
export function moveItem(item: Item, dx: number, dy: number): Item {
  switch (item.kind) {
    case "ink":
      return { ...item, pts: item.pts.map((v, i) => v + (i % 2 ? dy : dx)) };
    case "segment":
    case "rect":
    case "ellipse":
      return { ...item, a: shift(item.a, dx, dy), b: shift(item.b, dx, dy) };
    case "circle":
    case "arc":
      return { ...item, c: shift(item.c, dx, dy) };
    case "point":
    case "text":
    case "image":
    case "math":
      return { ...item, p: shift(item.p, dx, dy) };
    case "plot":
      return item;
  }
}

/** Items the selection's handle resizes: a picture, a formula, a text. */
export const resizable = (item: Item): item is Picture | MathItem | Text =>
  item.kind === "image" || item.kind === "math" || item.kind === "text";

/** The item `width` world units wide, its proportions and top-left corner kept. */
export function resizeItem<T extends Picture | MathItem | Text>(item: T, width: number): T {
  const w = item.kind === "text" ? textBox(item).w : item.w;
  const k = Math.max(0.05, width / (w || 1));
  if (item.kind === "text") return { ...item, size: Math.max(6, item.size * k) };
  if (item.kind === "math") return { ...item, size: item.size * k, w: item.w * k, h: item.h * k };
  return { ...item, w: item.w * k, h: item.h * k };
}

/**
 * The item under `p` that the selection tool takes: the one drawn last,
 * within `reach` of its line. Plots (they follow the axes) and format 2's
 * eraser strokes are left out.
 */
export function itemAt(items: Item[], p: P, reach: number): Item | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind === "plot" || (it.kind === "ink" && it.erase)) continue;
    const pad = "width" in it ? it.width / 2 : 0;
    if (distanceTo(it, p) <= reach + pad) return it;
  }
  return null;
}

/** A picture put on the board: over the other pictures, under the drawing. */
export function withPicture(items: Item[], picture: Picture): Item[] {
  let at = 0;
  items.forEach((it, i) => {
    if (it.kind === "image") at = i + 1;
  });
  return [...items.slice(0, at), picture, ...items.slice(at)];
}

/** Everything drawn, or null for an empty board. */
export function contentBounds(items: Item[]): Box | null {
  let out: Box | null = null;
  for (const it of items) {
    if (it.kind === "ink" && it.erase) continue;
    const b = boundsOf(it);
    if (!b) continue;
    out = out
      ? {
          x0: Math.min(out.x0, b.x0),
          y0: Math.min(out.y0, b.y0),
          x1: Math.max(out.x1, b.x1),
          y1: Math.max(out.y1, b.y1),
        }
      : b;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Snapping: points, ends, centres, intersections, then the grid
// ---------------------------------------------------------------------------

type Curve = { kind: "seg"; a: P; b: P } | { kind: "circle"; c: P; r: number; arc?: Arc };

function curvesOf(item: Item): Curve[] {
  switch (item.kind) {
    case "segment":
      return [{ kind: "seg", a: item.a, b: item.b }];
    case "rect": {
      const c = rectCorners(item.a, item.b);
      return [0, 1, 2, 3].map((i) => ({ kind: "seg" as const, a: c[i], b: c[i + 1] }));
    }
    case "circle":
      return [{ kind: "circle", c: item.c, r: item.r }];
    case "arc":
      return [{ kind: "circle", c: item.c, r: item.r, arc: item }];
    default:
      return [];
  }
}

function onCurve(p: P, c: Curve): boolean {
  if (c.kind === "seg") return distToSegment(p, c.a, c.b) < 1e-6 * (1 + dist(c.a, c.b));
  return !c.arc || onArc(Math.atan2(p.y - c.c.y, p.x - c.c.x), c.arc.start, c.arc.sweep);
}

/** Where two curves cross. */
export function intersections(u: Curve, v: Curve): P[] {
  let pts: P[] = [];
  if (u.kind === "seg" && v.kind === "seg") {
    const d = (u.b.x - u.a.x) * (v.b.y - v.a.y) - (u.b.y - u.a.y) * (v.b.x - v.a.x);
    if (Math.abs(d) < 1e-12) return [];
    const t = ((v.a.x - u.a.x) * (v.b.y - v.a.y) - (v.a.y - u.a.y) * (v.b.x - v.a.x)) / d;
    const s = ((v.a.x - u.a.x) * (u.b.y - u.a.y) - (v.a.y - u.a.y) * (u.b.x - u.a.x)) / d;
    return t >= 0 && t <= 1 && s >= 0 && s <= 1
      ? [{ x: u.a.x + t * (u.b.x - u.a.x), y: u.a.y + t * (u.b.y - u.a.y) }]
      : [];
  }
  if (u.kind === "circle" && v.kind === "seg") return intersections(v, u);
  if (u.kind === "seg" && v.kind === "circle") {
    const dx = u.b.x - u.a.x;
    const dy = u.b.y - u.a.y;
    const fx = u.a.x - v.c.x;
    const fy = u.a.y - v.c.y;
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - v.r * v.r;
    const disc = b * b - 4 * a * c;
    if (a === 0 || disc < 0) return [];
    const root = Math.sqrt(disc);
    pts = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
      .filter((t) => t >= 0 && t <= 1)
      .map((t) => ({ x: u.a.x + t * dx, y: u.a.y + t * dy }));
  } else if (u.kind === "circle" && v.kind === "circle") {
    const d = dist(u.c, v.c);
    if (d === 0 || d > u.r + v.r || d < Math.abs(u.r - v.r)) return [];
    const a = (u.r * u.r - v.r * v.r + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, u.r * u.r - a * a));
    const mx = u.c.x + (a * (v.c.x - u.c.x)) / d;
    const my = u.c.y + (a * (v.c.y - u.c.y)) / d;
    const ox = (h * (v.c.y - u.c.y)) / d;
    const oy = (h * (v.c.x - u.c.x)) / d;
    pts =
      h === 0
        ? [{ x: mx, y: my }]
        : [
            { x: mx + ox, y: my - oy },
            { x: mx - ox, y: my + oy },
          ];
  }
  return pts.filter((p) => onCurve(p, u) && onCurve(p, v));
}

export type SnapKind = "point" | "end" | "centre" | "intersection" | "grid";

/** The grid step a background offers to snap to (world units), if any. */
export function gridStep(bg: Background): number | null {
  if (bg === "seyes") return 2 * MM;
  if (bg === "squares" || bg === "dots" || bg === "axes") return 5 * MM;
  return null;
}

/**
 * The remarkable place near `p` (within `tolerance`, world units): a named
 * point, an end of a segment or arc, a centre, a crossing, else a grid
 * node. Crossings are looked for among the items near the pointer only.
 */
export function snap(
  p: P,
  items: Item[],
  tolerance: number,
  grid: number | null,
): { p: P; kind: SnapKind } | null {
  let best: { p: P; kind: SnapKind; d: number } | null = null;
  const consider = (q: P, kind: SnapKind, bonus = 0) => {
    const d = dist(p, q) - bonus;
    if (dist(p, q) <= tolerance && (!best || d < best.d)) best = { p: q, kind, d };
  };
  const near: Item[] = [];
  for (const it of items) {
    if (it.kind === "point") consider(it.p, "point", tolerance);
    else if (it.kind === "segment") {
      consider(it.a, "end", tolerance / 2);
      consider(it.b, "end", tolerance / 2);
    } else if (it.kind === "circle") consider(it.c, "centre", tolerance / 2);
    else if (it.kind === "arc") {
      consider(it.c, "centre", tolerance / 2);
      for (const e of arcEnds(it)) consider(e, "end", tolerance / 2);
    } else if (it.kind === "rect") {
      for (const c of rectCorners(it.a, it.b).slice(0, 4)) consider(c, "end", tolerance / 2);
    }
    if (near.length < 60 && curvesOf(it).length && distanceTo(it, p) <= tolerance) near.push(it);
  }
  const curves = near.flatMap(curvesOf);
  for (let i = 0; i < curves.length; i++)
    for (let j = i + 1; j < curves.length; j++)
      for (const q of intersections(curves[i], curves[j])) consider(q, "intersection");
  if (!best && grid) {
    const q = { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid };
    if (dist(p, q) <= tolerance) best = { p: q, kind: "grid", d: 0 };
  }
  return best ? { p: (best as { p: P }).p, kind: (best as { kind: SnapKind }).kind } : null;
}

/** The next free capital for a point: A, B, C… then A₁, B₁… */
export function nextLabel(items: Item[]): string {
  const used = new Set(items.filter((i): i is PointItem => i.kind === "point").map((i) => i.label));
  const subs = "₀₁₂₃₄₅₆₇₈₉";
  for (let round = 0; ; round++) {
    for (let c = 65; c < 91; c++) {
      const label =
        String.fromCharCode(c) +
        (round === 0
          ? ""
          : String(round)
              .split("")
              .map((d) => subs[Number(d)])
              .join(""));
      if (!used.has(label)) return label;
    }
  }
}
