import { describe, expect, it } from "vitest";
import {
  CM,
  contentBounds,
  distanceTo,
  intersections,
  nextLabel,
  onArc,
  parseBoard,
  snap,
  type Item,
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
