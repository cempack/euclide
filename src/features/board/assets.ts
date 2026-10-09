import { fileUrl } from "../../lib/api";
import { drawMath } from "./math";
import type { MathItem } from "./model";

/**
 * What the board draws but cannot draw at once: the library's pictures
 * (fetched, decoded) and formulas (set by KaTeX, copied onto a canvas).
 * Each is made once and kept; the board draws again when one is ready.
 *
 * A picture comes through a blob address, of the page's own origin: drawn
 * on a canvas, it leaves it readable, so exports and previews still work.
 */

const listeners = new Set<() => void>();
let frame = 0;
function ready() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    for (const listener of listeners) listener();
  });
}

/** Called when a picture or a formula is ready to draw; returns the unsubscribe. */
export function onAssetsReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

type Entry<T> = { value: T | null; failed: boolean; done: Promise<void> };

function load<T>(cache: Map<string | number, Entry<T>>, key: string | number, make: () => Promise<T>) {
  let entry = cache.get(key);
  if (entry) return entry;
  const fresh: Entry<T> = { value: null, failed: false, done: Promise.resolve() };
  fresh.done = make().then(
    (value) => {
      fresh.value = value;
      ready();
    },
    () => {
      fresh.failed = true;
      ready();
    },
  );
  cache.set(key, fresh);
  entry = fresh;
  return entry;
}

const pictures = new Map<string | number, Entry<HTMLImageElement>>();

async function fetchPicture(file: number): Promise<HTMLImageElement> {
  const res = await fetch(fileUrl(file));
  if (!res.ok) throw new Error(`${res.status}`);
  const img = new Image();
  img.src = URL.createObjectURL(await res.blob());
  await img.decode();
  return img;
}

/** A library picture: null while it loads, false when it cannot (its document deleted). */
export function picture(file: number): HTMLImageElement | null | false {
  const entry = load(pictures, file, () => fetchPicture(file));
  return entry.failed ? false : entry.value;
}

/** Resolves once these pictures are loaded (or known missing). */
export async function loadPictures(files: number[]): Promise<void> {
  await Promise.all(files.map((f) => load(pictures, f, () => fetchPicture(f)).done));
}

/**
 * A formula is drawn at the size it shows at (pixels per em: its size
 * times the scale), so its glyphs are as sharp as text. While that size
 * changes (a zoom, a resize being dragged) the nearest one drawn stands in,
 * stretched; the right one is made once the size has stayed put a moment.
 * The least recently drawn go first past a limit.
 */
const KEEP = 120;
const SETTLE_MS = 150;
const formulas = new Map<string | number, Entry<HTMLCanvasElement>>();
/** Sizes drawn so far, per formula (its colour and LaTeX). */
const drawn = new Map<string, Set<number>>();
const waiting = new Map<string, number>();

const baseKey = (item: MathItem) => `${item.color}\u0000${item.tex}`;

/** Pixels per em for `scale`, kept to canvases 4096 pixels a side at most. */
function emFor(item: MathItem, scale: number): number {
  const side = Math.max(item.w, item.h, 1) / (item.size || 1);
  return Math.max(4, Math.min(Math.round(item.size * scale), Math.floor(4096 / side)));
}

function loadFormula(item: MathItem, em: number) {
  const base = baseKey(item);
  const key = `${em}\u0000${base}`;
  const entry = load(formulas, key, () => drawMath(item.tex, em, item.color, 1).then((m) => m.canvas));
  // Last drawn, last to go.
  formulas.delete(key);
  formulas.set(key, entry);
  if (!drawn.has(base)) drawn.set(base, new Set());
  drawn.get(base)!.add(em);
  if (formulas.size > KEEP) {
    const old = formulas.keys().next().value as string;
    formulas.delete(old);
    const [size, ...rest] = old.split("\u0000");
    drawn.get(rest.join("\u0000"))?.delete(Number(size));
  }
  return entry;
}

/**
 * The formula for `scale` canvas pixels per world unit: `exact` when drawn
 * at that size (draw it as it is), else the nearest stand-in (stretch it);
 * null at first.
 */
export function formula(item: MathItem, scale: number): { canvas: HTMLCanvasElement; exact: boolean } | null {
  const em = emFor(item, scale);
  const base = baseKey(item);
  const exact = formulas.get(`${em}\u0000${base}`);
  if (exact?.value) return { canvas: exact.value, exact: true };
  const sizes = [...(drawn.get(base) ?? [])].filter((s) => formulas.get(`${s}\u0000${base}`)?.value);
  if (!sizes.length && !exact) {
    // The first one is made at once.
    loadFormula(item, em);
    return null;
  }
  // The right one once the size settles.
  window.clearTimeout(waiting.get(base));
  waiting.set(
    base,
    window.setTimeout(() => {
      waiting.delete(base);
      loadFormula(item, em);
    }, SETTLE_MS),
  );
  if (!sizes.length) return null;
  const nearest = sizes.reduce((a, b) => (Math.abs(b - em) < Math.abs(a - em) ? b : a));
  return { canvas: formulas.get(`${nearest}\u0000${base}`)!.value!, exact: false };
}

/** Resolves once these formulas are drawn for `scale` (exports, previews). */
export async function loadFormulas(items: MathItem[], scale: number): Promise<void> {
  await Promise.all(items.map((it) => loadFormula(it, emFor(it, scale)).done));
}
