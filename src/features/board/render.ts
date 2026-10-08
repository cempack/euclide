import { compile, type Compiled } from "./expr";
import { CM, MM, contentBounds, type Background, type Box, type Item, type View } from "./model";

/** The board is paper in every theme. */
export const PAPER = "#ffffff";
export const INK = "#111213";

const SEYES_FINE = "rgba(110, 136, 214, 0.32)";
const SEYES_BOLD = "rgba(85, 110, 200, 0.62)";
const MARGIN = "rgba(214, 60, 70, 0.75)";
const GRID = "rgba(70, 90, 130, 0.2)";
const GRID_BOLD = "rgba(70, 90, 130, 0.36)";

const compiled = new Map<string, Compiled>();
/** The function of a plot, compiled once per expression. */
export function plotFunction(expr: string): ((x: number) => number) | null {
  let c = compiled.get(expr);
  if (!c) {
    c = compile(expr);
    compiled.set(expr, c);
  }
  return c.ok ? c.f : null;
}

/** Lines `step` apart that cross [from, to], as world coordinates. */
function every(step: number, from: number, to: number): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(from / step) * step; v <= to; v += step) out.push(v);
  return out;
}

/**
 * The paper and its ruling for the part of the world on screen. Lines are
 * drawn in screen pixels (crisp at every zoom); the finer ones go when
 * they would be closer than a few pixels.
 */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  bg: Background,
  view: View,
  w: number,
  h: number,
  dpr: number,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  if (bg === "plain") return;
  const z = view.zoom;
  const x0 = view.x;
  const y0 = view.y;
  const x1 = x0 + w / z;
  const y1 = y0 + h / z;
  const sx = (x: number) => Math.round((x - x0) * z) + 0.5;
  const sy = (y: number) => Math.round((y - y0) * z) + 0.5;
  ctx.lineWidth = 1;

  const lines = (step: number, color: string, horizontal: boolean, vertical: boolean) => {
    if (step * z < 4) return;
    ctx.strokeStyle = color;
    ctx.beginPath();
    if (horizontal)
      for (const y of every(step, y0, y1)) {
        ctx.moveTo(0, sy(y));
        ctx.lineTo(w, sy(y));
      }
    if (vertical)
      for (const x of every(step, x0, x1)) {
        ctx.moveTo(sx(x), 0);
        ctx.lineTo(sx(x), h);
      }
    ctx.stroke();
  };

  if (bg === "seyes") {
    // Seyès: 8 mm squares, three fine lines between the bold ones, a red margin.
    lines(2 * MM, SEYES_FINE, true, false);
    lines(8 * MM, SEYES_BOLD, true, true);
    if (x0 <= 0 && x1 >= 0) {
      ctx.strokeStyle = MARGIN;
      ctx.beginPath();
      ctx.moveTo(sx(0), 0);
      ctx.lineTo(sx(0), h);
      ctx.stroke();
    }
  } else if (bg === "squares") {
    lines(5 * MM, GRID, true, true);
  } else if (bg === "dots") {
    const step = 5 * MM;
    if (step * z >= 6) {
      ctx.fillStyle = GRID_BOLD;
      const r = Math.max(1, Math.min(2, z));
      for (const x of every(step, x0, x1))
        for (const y of every(step, y0, y1)) ctx.fillRect(sx(x) - r / 2, sy(y) - r / 2, r, r);
    }
  } else if (bg === "axes") {
    lines(5 * MM, GRID, true, true);
    lines(CM, GRID_BOLD, true, true);
    drawAxes(ctx, view, w, h);
  }
}

/** The x and y axes through the world origin, graduated every centimetre (one unit). */
function drawAxes(ctx: CanvasRenderingContext2D, view: View, w: number, h: number) {
  const z = view.zoom;
  const ox = Math.round(-view.x * z) + 0.5;
  const oy = Math.round(-view.y * z) + 0.5;
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (oy > 0 && oy < h) {
    ctx.moveTo(0, oy);
    ctx.lineTo(w, oy);
  }
  if (ox > 0 && ox < w) {
    ctx.moveTo(ox, 0);
    ctx.lineTo(ox, h);
  }
  ctx.stroke();
  // Arrows at the screen's edges.
  ctx.beginPath();
  if (oy > 0 && oy < h) {
    ctx.moveTo(w - 1, oy);
    ctx.lineTo(w - 9, oy - 4);
    ctx.lineTo(w - 9, oy + 4);
  }
  if (ox > 0 && ox < w) {
    ctx.moveTo(ox, 1);
    ctx.lineTo(ox - 4, 9);
    ctx.lineTo(ox + 4, 9);
  }
  ctx.fill();

  // Graduations: every unit, numbered when there is room.
  const unit = CM * z;
  let every_ = 1;
  while (unit * every_ < 28) every_ *= every_ === 1 ? 2 : every_ === 2 ? 2.5 : 2;
  ctx.font = '11px "IBM Plex Mono", monospace';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const first = Math.ceil(view.x / CM / every_) * every_;
  for (let n = first; (n * CM - view.x) * z < w; n += every_) {
    if (Math.abs(n) < 1e-9) continue;
    const x = Math.round((n * CM - view.x) * z) + 0.5;
    if (oy > -10 && oy < h + 10) {
      ctx.moveTo(x, oy - 4);
      ctx.lineTo(x, oy + 4);
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(formatTick(n), x, Math.min(h - 14, Math.max(2, oy + 6)));
    }
  }
  const firstY = Math.ceil(-(view.y + h / z) / CM / every_) * every_;
  for (let n = firstY; (-n * CM - view.y) * z > 0; n += every_) {
    if (Math.abs(n) < 1e-9) continue;
    const y = Math.round((-n * CM - view.y) * z) + 0.5;
    if (ox > -10 && ox < w + 10) {
      ctx.moveTo(ox - 4, y);
      ctx.lineTo(ox + 4, y);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(formatTick(n), Math.max(28, Math.min(w - 2, ox - 6)), y);
    }
  }
  ctx.stroke();
  if (ox > 0 && ox < w && oy > 0 && oy < h) {
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText("0", ox - 4, oy + 4);
  }
}

const formatTick = (n: number) =>
  String(Math.round(n * 100) / 100)
    .replace(".", ",")
    .replace("-", "−");

/** Freehand paths are built once per stroke, smoothed through midpoints. */
const paths = new WeakMap<Item, Path2D>();
function inkPath(pts: number[]): Path2D {
  const p = new Path2D();
  p.moveTo(pts[0], pts[1]);
  if (pts.length === 2) {
    p.lineTo(pts[0] + 0.01, pts[1] + 0.01);
    return p;
  }
  for (let i = 2; i + 3 < pts.length; i += 2) {
    const mx = (pts[i] + pts[i + 2]) / 2;
    const my = (pts[i + 1] + pts[i + 3]) / 2;
    p.quadraticCurveTo(pts[i], pts[i + 1], mx, my);
  }
  p.lineTo(pts[pts.length - 2], pts[pts.length - 1]);
  return p;
}

function intersects(a: Box | null, b: Box): boolean {
  return !a || (a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0);
}

/** One item, in world coordinates (the context carries the view). */
export function drawItem(ctx: CanvasRenderingContext2D, item: Item, view: View, w: number) {
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.setLineDash([]);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if ("width" in item) {
    ctx.lineWidth = item.width;
    ctx.strokeStyle = item.color;
  }
  switch (item.kind) {
    case "ink": {
      let path = paths.get(item);
      if (!path) {
        path = inkPath(item.pts);
        paths.set(item, path);
      }
      if (item.erase) ctx.globalCompositeOperation = "destination-out";
      else ctx.globalAlpha = item.opacity ?? 1;
      ctx.stroke(path);
      break;
    }
    case "segment":
      if (item.dashed) ctx.setLineDash([item.width * 3, item.width * 3]);
      ctx.beginPath();
      ctx.moveTo(item.a.x, item.a.y);
      ctx.lineTo(item.b.x, item.b.y);
      ctx.stroke();
      break;
    case "circle":
      ctx.beginPath();
      ctx.arc(item.c.x, item.c.y, item.r, 0, 2 * Math.PI);
      ctx.stroke();
      break;
    case "arc":
      ctx.beginPath();
      ctx.arc(item.c.x, item.c.y, item.r, item.start, item.start + item.sweep, item.sweep < 0);
      ctx.stroke();
      break;
    case "rect":
      ctx.strokeRect(
        Math.min(item.a.x, item.b.x),
        Math.min(item.a.y, item.b.y),
        Math.abs(item.b.x - item.a.x),
        Math.abs(item.b.y - item.a.y),
      );
      break;
    case "ellipse":
      ctx.beginPath();
      ctx.ellipse(
        (item.a.x + item.b.x) / 2,
        (item.a.y + item.b.y) / 2,
        Math.abs(item.b.x - item.a.x) / 2 || 0.5,
        Math.abs(item.b.y - item.a.y) / 2 || 0.5,
        0,
        0,
        2 * Math.PI,
      );
      ctx.stroke();
      break;
    case "point": {
      const s = 5;
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(item.p.x - s, item.p.y - s);
      ctx.lineTo(item.p.x + s, item.p.y + s);
      ctx.moveTo(item.p.x + s, item.p.y - s);
      ctx.lineTo(item.p.x - s, item.p.y + s);
      ctx.stroke();
      if (item.label) {
        ctx.fillStyle = item.color;
        ctx.font = 'italic 18px "IBM Plex Sans", sans-serif';
        ctx.textBaseline = "bottom";
        ctx.textAlign = "left";
        ctx.fillText(item.label, item.p.x + 6, item.p.y - 4);
      }
      break;
    }
    case "text": {
      ctx.fillStyle = item.color;
      ctx.font = `${item.size}px "IBM Plex Sans", sans-serif`;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      item.text
        .split("\n")
        .forEach((line, i) => ctx.fillText(line, item.p.x, item.p.y + i * item.size * 1.25));
      break;
    }
    case "plot": {
      const f = plotFunction(item.expr);
      if (!f) break;
      // One sample per screen pixel; a jump taller than the screen or a
      // hole (1/x at 0, tan) lifts the pen.
      const step = 1 / view.zoom;
      const limit = (2 * w) / view.zoom;
      ctx.beginPath();
      let down = false;
      let lastY = 0;
      for (let wx = view.x - step; wx <= view.x + w / view.zoom + step; wx += step) {
        const y = f(wx / CM);
        if (!Number.isFinite(y)) {
          down = false;
          continue;
        }
        const wy = -y * CM;
        if (down && Math.abs(wy - lastY) > limit) down = false;
        if (down) ctx.lineTo(wx, wy);
        else ctx.moveTo(wx, wy);
        down = true;
        lastY = wy;
      }
      ctx.stroke();
      break;
    }
  }
}

/** Every item that shows in the view, oldest first. */
export function drawItems(
  ctx: CanvasRenderingContext2D,
  items: Item[],
  view: View,
  w: number,
  h: number,
  dpr: number,
  bounds: (item: Item) => Box | null,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.setTransform(
    dpr * view.zoom,
    0,
    0,
    dpr * view.zoom,
    -view.x * view.zoom * dpr,
    -view.y * view.zoom * dpr,
  );
  const visible: Box = { x0: view.x, y0: view.y, x1: view.x + w / view.zoom, y1: view.y + h / view.zoom };
  for (const item of items) {
    if (intersects(bounds(item), visible)) drawItem(ctx, item, view, w);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

/**
 * The whole drawing on one canvas, paper and ruling included, `scale`
 * pixels per world unit, at most `maxSide` pixels on its longer side (PNG,
 * PDF, previews). Plots on the axes show the unit square around the origin
 * at least.
 */
export function renderBoard(
  items: Item[],
  background: Background,
  scale: number,
  maxSide = 4096,
): HTMLCanvasElement {
  let box = contentBounds(items) ?? { x0: -8 * CM, y0: -5 * CM, x1: 8 * CM, y1: 5 * CM };
  if (items.some((i) => i.kind === "plot"))
    box = {
      x0: Math.min(box.x0, -6 * CM),
      y0: Math.min(box.y0, -5 * CM),
      x1: Math.max(box.x1, 6 * CM),
      y1: Math.max(box.y1, 5 * CM),
    };
  const pad = 1.2 * CM;
  box = { x0: box.x0 - pad, y0: box.y0 - pad, x1: box.x1 + pad, y1: box.y1 + pad };
  const fit = Math.min(scale, maxSide / (box.x1 - box.x0), maxSide / (box.y1 - box.y0));
  const w = Math.max(1, Math.round((box.x1 - box.x0) * fit));
  const h = Math.max(1, Math.round((box.y1 - box.y0) * fit));
  const view: View = { x: box.x0, y: box.y0, zoom: fit };
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const ink = document.createElement("canvas");
  ink.width = w;
  ink.height = h;
  const inkCtx = ink.getContext("2d")!;
  drawBackground(ctx, background, view, w, h, 1);
  drawItems(inkCtx, items, view, w, h, 1, () => null);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(ink, 0, 0);
  return canvas;
}
