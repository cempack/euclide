import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * Formulas on the board. KaTeX lays a formula out in the page, hidden; its
 * pieces are then copied onto a canvas: the glyphs with fillText in KaTeX's
 * own fonts (the page has loaded them), the rules (a fraction's bar) as
 * rectangles, the drawn parts (a radical, an arrow) as SVG pictures. The
 * board draws that canvas like a picture, so ink goes over a formula and
 * exports show it.
 */

export interface MathLayout {
  /** Width and height, in CSS pixels at the font size given. */
  w: number;
  h: number;
}

let host: HTMLDivElement | null = null;

// One formula at a time in the stage: a second one, laid out while the
// first waits for its fonts, would replace it.
let queue: Promise<unknown> = Promise.resolve();
function inTurn<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/** The hidden place where KaTeX lays formulas out. */
function stage(size: number, color: string): HTMLDivElement {
  if (!host) {
    host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;" +
      "display:inline-block;white-space:nowrap;line-height:normal;contain:layout style";
    document.body.append(host);
  }
  host.style.fontSize = `${size}px`;
  host.style.color = color;
  return host;
}

/** The formula's box in the stage, KaTeX's markup inside it. */
function layout(tex: string, size: number, color: string): HTMLElement {
  const el = stage(size, color);
  katex.render(tex, el, { displayMode: true, throwOnError: true, output: "html" });
  return el.querySelector<HTMLElement>(".katex-html") ?? el;
}

/** Whether `tex` is a formula KaTeX can set, and what is wrong if not. */
export function checkMath(tex: string): string | null {
  try {
    katex.renderToString(tex, { displayMode: true, throwOnError: true, output: "html" });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message.replace(/^KaTeX parse error: /, "") : String(err);
  }
}

/** The formula's size at `size` pixels (its fonts loaded first). */
export function measureMath(tex: string, size: number): Promise<MathLayout> {
  return inTurn(async () => {
    const box = layout(tex, size, "#000");
    await fontsOf(box);
    const r = box.getBoundingClientRect();
    return { w: Math.ceil(r.width), h: Math.ceil(r.height) };
  });
}

const fontOf = (s: CSSStyleDeclaration) => `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;

/** Waits for the fonts the formula uses: until then its glyphs have no shape. */
async function fontsOf(box: HTMLElement) {
  const fonts = new Set<string>();
  const walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (n.parentElement && n.textContent?.trim()) fonts.add(fontOf(getComputedStyle(n.parentElement)));
  }
  await Promise.all([...fonts].map((f) => document.fonts.load(f).catch(() => [])));
}

/** What hides an element's overflow, as a box in the stage (a radical's tail). */
function clipOf(el: Element, origin: DOMRect): DOMRect | null {
  let clip: DOMRect | null = null;
  for (let a = el.parentElement; a && a !== host; a = a.parentElement) {
    if (getComputedStyle(a).overflow === "visible") continue;
    const r = a.getBoundingClientRect();
    const x0 = Math.max(clip?.left ?? -Infinity, r.left);
    const y0 = Math.max(clip?.top ?? -Infinity, r.top);
    const x1 = Math.min(clip?.right ?? Infinity, r.right);
    const y1 = Math.min(clip?.bottom ?? Infinity, r.bottom);
    clip = new DOMRect(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
  }
  return clip && new DOMRect(clip.left - origin.left, clip.top - origin.top, clip.width, clip.height);
}

/** An SVG piece of the formula as a picture, its colour set (no page CSS reaches it). */
function svgPicture(svg: SVGSVGElement, color: string, w: number, h: number): Promise<HTMLImageElement> {
  const copy = svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(w));
  copy.setAttribute("height", String(h));
  copy.setAttribute("fill", color);
  copy.setAttribute("stroke", color);
  copy.removeAttribute("style");
  for (const p of copy.querySelectorAll("path")) p.setAttribute("stroke", "none");
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
  return img.decode().then(() => img);
}

/**
 * The formula on a canvas, `scale` canvas pixels per CSS pixel: its size
 * in CSS pixels, and the canvas. Throws when KaTeX cannot set it.
 */
export function drawMath(
  tex: string,
  size: number,
  color: string,
  scale: number,
): Promise<MathLayout & { canvas: HTMLCanvasElement }> {
  return inTurn(() => draw(tex, size, color, scale));
}

async function draw(
  tex: string,
  size: number,
  color: string,
  scale: number,
): Promise<MathLayout & { canvas: HTMLCanvasElement }> {
  const box = layout(tex, size, color);
  await fontsOf(box);
  const origin = box.getBoundingClientRect();
  const w = Math.ceil(origin.width);
  const h = Math.ceil(origin.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(w * scale));
  canvas.height = Math.max(1, Math.ceil(h * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  const at = (r: DOMRect) => ({ x: r.left - origin.left, y: r.top - origin.top });

  // Read everything first, then draw: drawing never makes the page lay out again.
  const rules: { x: number; y: number; w: number; h: number; color: string }[] = [];
  const glyphs: { text: string; font: string; color: string; x: number; top: number }[] = [];
  const pictures: Promise<{
    img: HTMLImageElement;
    x: number;
    y: number;
    w: number;
    h: number;
    clip: DOMRect | null;
  }>[] = [];

  for (const el of box.querySelectorAll<HTMLElement | SVGSVGElement>("*")) {
    if (el instanceof SVGElement && !(el instanceof SVGSVGElement)) continue;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const p = at(r);
    if (el instanceof SVGSVGElement) {
      pictures.push(
        svgPicture(el, s.color, r.width, r.height).then((img) => ({
          img,
          ...p,
          w: r.width,
          h: r.height,
          clip: clipOf(el, origin),
        })),
      );
      continue;
    }
    if (s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent")
      rules.push({ ...p, w: r.width, h: r.height, color: s.backgroundColor });
    // Rules are borders: a fraction's bar, an overline, \rule.
    const bt = parseFloat(s.borderTopWidth);
    const bb = parseFloat(s.borderBottomWidth);
    const bl = parseFloat(s.borderLeftWidth);
    const br = parseFloat(s.borderRightWidth);
    if (bt && s.borderTopStyle !== "none") rules.push({ ...p, w: r.width, h: bt, color: s.borderTopColor });
    if (bb && s.borderBottomStyle !== "none")
      rules.push({ x: p.x, y: p.y + r.height - bb, w: r.width, h: bb, color: s.borderBottomColor });
    if (bl && s.borderLeftStyle !== "none")
      rules.push({ ...p, w: bl, h: r.height, color: s.borderLeftColor });
    if (br && s.borderRightStyle !== "none")
      rules.push({ x: p.x + r.width - br, y: p.y, w: br, h: r.height, color: s.borderRightColor });
  }

  const walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const text = n.textContent ?? "";
    if (!text.trim() || !n.parentElement) continue;
    range.selectNodeContents(n);
    const r = range.getClientRects()[0];
    if (!r) continue;
    const s = getComputedStyle(n.parentElement);
    glyphs.push({ text, font: fontOf(s), color: s.color, x: r.left - origin.left, top: r.top - origin.top });
  }

  // Rules on whole pixels, one at least: a fraction's bar stays black, not grey.
  const px = (v: number) => Math.round(v * scale) / scale;
  const thick = (v: number) => Math.max(1, Math.round(v * scale)) / scale;
  for (const r of rules) {
    ctx.fillStyle = r.color;
    ctx.fillRect(px(r.x), px(r.y), thick(r.w), thick(r.h));
  }
  ctx.textBaseline = "alphabetic";
  for (const g of glyphs) {
    ctx.font = g.font;
    ctx.fillStyle = g.color;
    // The text's box starts at the font's ascent above the baseline.
    ctx.fillText(g.text, g.x, g.top + ctx.measureText(g.text).fontBoundingBoxAscent);
  }
  for (const p of await Promise.all(pictures)) {
    ctx.save();
    if (p.clip) {
      ctx.beginPath();
      ctx.rect(p.clip.x, p.clip.y, p.clip.width, p.clip.height);
      ctx.clip();
    }
    ctx.drawImage(p.img, p.x, p.y, p.w, p.h);
    ctx.restore();
  }
  return { w, h, canvas };
}
