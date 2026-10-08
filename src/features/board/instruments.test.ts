import { describe, expect, it } from "vitest";
import { CM } from "./model";
import { edgesOf, placeInstrument, type Instrument } from "./instruments";

const view = { x: 0, y: 0, zoom: 1 };
const W = 1600;
const H = 1000;

/** Rough world box of a placed instrument (unturned), for overlap checks. */
function box(i: Instrument) {
  if (i.kind === "ruler") return { x0: i.at.x, y0: i.at.y, x1: i.at.x + 20 * CM, y1: i.at.y + 3 * CM };
  if (i.kind === "square") return { x0: i.at.x, y0: i.at.y, x1: i.at.x + 12 * CM, y1: i.at.y + 12 * CM };
  if (i.kind === "protractor")
    return { x0: i.at.x - 6.5 * CM, y0: i.at.y - 6.5 * CM, x1: i.at.x + 6.5 * CM, y1: i.at.y };
  return { x0: i.at.x, y0: i.at.y - 4 * CM, x1: i.at.x + i.radius, y1: i.at.y };
}
const overlaps = (a: Instrument, b: Instrument) => {
  const p = box(a);
  const q = box(b);
  return p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1;
};

describe("placeInstrument", () => {
  it("puts the first one in the middle of the board, right of the palette", () => {
    const ruler = placeInstrument("ruler", view, W, H);
    const middle = box(ruler);
    expect((middle.x0 + middle.x1) / 2).toBeCloseTo(64 + (W - 64) / 2, 0);
    expect((middle.y0 + middle.y1) / 2).toBeCloseTo(H / 2, 0);
    expect(ruler.angle).toBe(0);
  });

  it("finds room for the next ones instead of stacking them", () => {
    const placed: Instrument[] = [];
    for (const kind of ["ruler", "protractor", "square"] as const)
      placed.push(placeInstrument(kind, view, 2400, 1500, placed));
    expect(overlaps(placed[0], placed[1])).toBe(false);
    expect(overlaps(placed[0], placed[2])).toBe(false);
    expect(overlaps(placed[1], placed[2])).toBe(false);
  });

  it("on a board too small for both, still moves the next one off the first", () => {
    const ruler = placeInstrument("ruler", view, W, H);
    const square = placeInstrument("square", view, W, H, [ruler]);
    expect(square.at).not.toEqual(placeInstrument("square", view, W, H).at);
  });

  it("follows the view when zoomed and panned", () => {
    const at = placeInstrument("protractor", { x: 500, y: 300, zoom: 2 }, W, H).at;
    expect(at.x).toBeGreaterThan(500);
    expect(at.x).toBeLessThan(500 + W / 2);
    expect(at.y).toBeGreaterThan(300);
    expect(at.y).toBeLessThan(300 + H / 2);
  });
});

describe("edgesOf", () => {
  it("gives the ruler's graduated edge and the set square's three sides", () => {
    const ruler: Instrument = { kind: "ruler", at: { x: 10, y: 20 }, angle: 0, radius: 0, reading: 0 };
    expect(edgesOf(ruler)).toEqual([
      [
        { x: 10, y: 20 },
        { x: 10 + 20 * CM, y: 20 },
      ],
    ]);
    expect(edgesOf({ ...ruler, kind: "square" })).toHaveLength(3);
    expect(edgesOf({ ...ruler, kind: "compass" })).toHaveLength(0);
  });
});
