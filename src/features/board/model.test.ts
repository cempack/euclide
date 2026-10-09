import { describe, expect, it } from "vitest";
import {
  CM,
  contentBounds,
  distanceTo,
  intersections,
  itemAt,
  moveItem,
  nextLabel,
  onArc,
  parseBoard,
  resizeItem,
  snap,
  withPicture,
  type Item,
  type MathItem,
  type Picture,
} from "./model";

describe("parseBoard", () => {
  it("brings a format 2 board into world units, keeping its proportions", () => {
    const v2 = JSON.stringify({
      version: 2,
      strokes: [
        {
          color: "#000",
          size: 6,
          eraser: false,
          pts: [
            { x: 0.5, y: 0.5 },
            { x: 1, y: 1 },
          ],
        },
      ],
      shapes: [{ type: "ellipse", x1: 0, y1: 0, x2: 0.1, y2: 0.16, color: "#f00", size: 3 }],
      texts: [{ x: 0.25, y: 0.1, text: "Bonjour", color: "#000", size: 24 }],
    });
    const b = parseBoard(v2);
    expect(b.version).toBe(3);
    expect(b.items.map((i) => i.kind)).toEqual(["ink", "ellipse", "text"]);
    const ink = b.items[0] as Extract<Item, { kind: "ink" }>;
    expect(ink.pts).toEqual([800, 500, 1600, 1000]);
    // A circle drawn on a 16:10 window stays a circle.
    const e = b.items[1] as Extract<Item, { kind: "ellipse" }>;
    expect(e.b.x - e.a.x).toBeCloseTo(e.b.y - e.a.y);
  });

  it("opens format 3 as is and anything else as an empty board", () => {
    const v3 = {
      version: 3,
      background: "seyes",
      items: [{ id: "a", kind: "point", p: { x: 1, y: 2 }, label: "A", color: "#000" }],
    };
    expect(parseBoard(JSON.stringify(v3)).background).toBe("seyes");
    expect(parseBoard("pas du json").items).toEqual([]);
    expect(parseBoard("").items).toEqual([]);
  });
});

describe("geometry", () => {
  it("measures distances to what is drawn", () => {
    const seg: Item = {
      id: "s",
      kind: "segment",
      a: { x: 0, y: 0 },
      b: { x: 10, y: 0 },
      color: "#000",
      width: 2,
    };
    expect(distanceTo(seg, { x: 5, y: 3 })).toBe(3);
    const circle: Item = { id: "c", kind: "circle", c: { x: 0, y: 0 }, r: 10, color: "#000", width: 2 };
    expect(distanceTo(circle, { x: 0, y: 13 })).toBe(3);
    const text: Item = { id: "t", kind: "text", p: { x: 0, y: 0 }, text: "AB", size: 20, color: "#000" };
    expect(distanceTo(text, { x: 5, y: 5 })).toBe(0);
  });

  it("finds crossings of segments and circles", () => {
    const u = { kind: "seg" as const, a: { x: -10, y: 0 }, b: { x: 10, y: 0 } };
    const v = { kind: "seg" as const, a: { x: 0, y: -10 }, b: { x: 0, y: 10 } };
    expect(intersections(u, v)).toEqual([{ x: 0, y: 0 }]);
    const c = { kind: "circle" as const, c: { x: 0, y: 0 }, r: 5 };
    expect(intersections(u, c).map((p) => Math.round(p.x))).toEqual([-5, 5]);
    const d = { kind: "circle" as const, c: { x: 6, y: 0 }, r: 5 };
    const both = intersections(c, d);
    expect(both).toHaveLength(2);
    expect(both[0].x).toBeCloseTo(3);
  });

  it("knows which way an arc turns", () => {
    expect(onArc(Math.PI / 4, 0, Math.PI / 2)).toBe(true);
    expect(onArc(-Math.PI / 4, 0, Math.PI / 2)).toBe(false);
    expect(onArc(-Math.PI / 4, 0, -Math.PI / 2)).toBe(true);
  });

  it("snaps to points first, then crossings, then the grid", () => {
    const items: Item[] = [
      { id: "1", kind: "segment", a: { x: -50, y: 0 }, b: { x: 50, y: 0 }, color: "#000", width: 2 },
      { id: "2", kind: "segment", a: { x: 0, y: -50 }, b: { x: 0, y: 50 }, color: "#000", width: 2 },
      { id: "3", kind: "point", p: { x: 30, y: 30 }, label: "A", color: "#000" },
    ];
    expect(snap({ x: 2, y: -1 }, items, 6, null)?.kind).toBe("intersection");
    expect(snap({ x: 32, y: 29 }, items, 6, null)?.p).toEqual({ x: 30, y: 30 });
    expect(snap({ x: 49, y: 1 }, items, 6, null)?.kind).toBe("end");
    expect(snap({ x: 80, y: 81 }, items, 6, 20)?.p).toEqual({ x: 80, y: 80 });
    expect(snap({ x: 90, y: 90 }, items, 2, null)).toBeNull();
  });

  it("frames the drawing and names points in order", () => {
    const items: Item[] = [
      { id: "1", kind: "point", p: { x: 0, y: 0 }, label: "A", color: "#000" },
      { id: "2", kind: "circle", c: { x: CM, y: 0 }, r: CM, color: "#000", width: 2 },
    ];
    const b = contentBounds(items)!;
    expect(b.x1).toBeCloseTo(2 * CM + 1);
    expect(nextLabel(items)).toBe("B");
  });
});

describe("the selection tool", () => {
  const picture: Picture = { id: "p", kind: "image", p: { x: 0, y: 0 }, w: 400, h: 300, file: 7 };
  const formula: MathItem = {
    id: "m",
    kind: "math",
    p: { x: 500, y: 0 },
    tex: "\\frac{1}{2}",
    size: 26,
    color: "#111213",
    w: 40,
    h: 60,
  };
  const ink: Item = { id: "i", kind: "ink", pts: [10, 10, 100, 100], color: "#000", width: 4 };

  it("takes the item drawn last under the pointer, not a plot", () => {
    const plot: Item = { id: "f", kind: "plot", expr: "x", color: "#000", width: 2 };
    const items = [picture, ink, formula, plot];
    expect(itemAt(items, { x: 55, y: 55 }, 4)?.id).toBe("i");
    expect(itemAt(items, { x: 300, y: 50 }, 4)?.id).toBe("p");
    expect(itemAt(items, { x: 520, y: 30 }, 4)?.id).toBe("m");
    expect(itemAt(items, { x: 0, y: 0 }, 4)?.id).toBe("p");
    expect(itemAt(items, { x: 450, y: 400 }, 4)).toBeNull();
  });

  it("moves every kind of item, a plot staying with the axes", () => {
    expect(moveItem(ink, 5, -5)).toMatchObject({ pts: [15, 5, 105, 95] });
    expect(moveItem(picture, 5, -5)).toMatchObject({ p: { x: 5, y: -5 }, w: 400 });
    const seg: Item = {
      id: "s",
      kind: "segment",
      a: { x: 0, y: 0 },
      b: { x: 1, y: 1 },
      color: "#000",
      width: 2,
    };
    expect(moveItem(seg, 1, 2)).toMatchObject({ a: { x: 1, y: 2 }, b: { x: 2, y: 3 } });
    const plot: Item = { id: "f", kind: "plot", expr: "x", color: "#000", width: 2 };
    expect(moveItem(plot, 1, 2)).toBe(plot);
  });

  it("resizes pictures and formulas in proportion, from their corner", () => {
    expect(resizeItem(picture, 200)).toMatchObject({ p: { x: 0, y: 0 }, w: 200, h: 150 });
    expect(resizeItem(formula, 80)).toMatchObject({ size: 52, w: 80, h: 120 });
    const text: Item = { id: "t", kind: "text", p: { x: 0, y: 0 }, text: "ab", size: 20, color: "#000" };
    expect(resizeItem(text, 2 * 2 * 20 * 0.56).size).toBeCloseTo(40);
  });

  it("puts a picture over the others, under the drawing", () => {
    const second: Picture = { ...picture, id: "q" };
    expect(withPicture([ink], picture).map((i) => i.id)).toEqual(["p", "i"]);
    expect(withPicture([picture, ink, formula], second).map((i) => i.id)).toEqual(["p", "q", "i", "m"]);
  });

  it("frames pictures and formulas by their box", () => {
    expect(contentBounds([picture, formula])).toEqual({ x0: 0, y0: 0, x1: 540, y1: 300 });
    expect(distanceTo(picture, { x: 410, y: 0 })).toBe(10);
    expect(parseBoard(JSON.stringify({ version: 3, items: [picture, formula] })).items).toEqual([
      picture,
      formula,
    ]);
  });
});
