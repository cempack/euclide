import { describe, expect, it } from "vitest";
import { PdfAnnotationSubtype, type PdfInkAnnoObject } from "@embedpdf/models";
import { legacyInk, readNotes, visibleRuns, writeNotes, type LegacyStroke } from "./imageNotes";

const line = (x0: number, x1: number, y: number) =>
  Array.from({ length: x1 - x0 + 1 }, (_, k) => ({ x: x0 + k, y }));

describe("visibleRuns", () => {
  it("keeps pen strokes as they were drawn", () => {
    const pen: LegacyStroke = { tool: "pen", color: "#c00", size: 2.5, pts: line(0, 100, 50) };
    expect(visibleRuns([pen])).toEqual([{ color: "#c00", size: 2.5, pts: pen.pts }]);
  });

  it("cuts a stroke where an eraser passed over it afterwards", () => {
    const pen: LegacyStroke = { tool: "pen", color: "#c00", size: 2, pts: line(0, 100, 50) };
    const eraser: LegacyStroke = {
      tool: "eraser",
      color: "#000",
      size: 16,
      pts: [
        { x: 50, y: 0 },
        { x: 50, y: 100 },
      ],
    };
    const runs = visibleRuns([pen, eraser]);
    expect(runs).toHaveLength(2);
    // Reach: the eraser's half width and the pen's.
    expect(Math.max(...runs[0].pts.map((p) => p.x))).toBeLessThan(41);
    expect(Math.min(...runs[1].pts.map((p) => p.x))).toBeGreaterThan(59);
  });

  it("cuts a quick stroke too, whose points fall on either side of the eraser", () => {
    const pen: LegacyStroke = {
      tool: "pen",
      color: "#c00",
      size: 2,
      pts: [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ],
    };
    const eraser: LegacyStroke = { tool: "eraser", color: "#000", size: 16, pts: [{ x: 50, y: 50 }] };
    expect(visibleRuns([pen, eraser])).toHaveLength(2);
  });

  it("leaves what was drawn after the eraser, and drops what it took entirely", () => {
    const dot: LegacyStroke = {
      tool: "pen",
      color: "#c00",
      size: 2,
      pts: [
        { x: 10, y: 10 },
        { x: 11, y: 10 },
      ],
    };
    const eraser: LegacyStroke = { tool: "eraser", color: "#000", size: 16, pts: [{ x: 10, y: 10 }] };
    const later: LegacyStroke = { ...dot, color: "#00c" };
    expect(visibleRuns([dot, eraser, later])).toEqual([{ color: "#00c", size: 2, pts: later.pts }]);
  });
});

describe("legacyInk", () => {
  it("makes ink annotations around their strokes", () => {
    const [ink] = legacyInk([{ tool: "pen", color: "#1d4ed8", size: 4, pts: line(10, 30, 20) }]);
    expect(ink.type).toBe(PdfAnnotationSubtype.INK);
    expect(ink.strokeColor).toBe("#1d4ed8");
    expect(ink.strokeWidth).toBe(4);
    expect(ink.rect).toEqual({ origin: { x: 8, y: 18 }, size: { width: 24, height: 4 } });
    expect(ink.inkList[0].points).toHaveLength(21);
  });
});

describe("readNotes / writeNotes", () => {
  it("read nothing for an image never drawn on", () => {
    expect(readNotes(null)).toEqual([]);
  });

  it("open the old annotator's strokes as ink", () => {
    const json = JSON.stringify({ strokes: [{ tool: "pen", color: "#c00", size: 2.5, pts: line(0, 5, 5) }] });
    const notes = readNotes(json);
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe(PdfAnnotationSubtype.INK);
  });

  it("keep annotations as they were, their dates as dates", () => {
    const [ink] = legacyInk([{ tool: "pen", color: "#c00", size: 2, pts: line(0, 5, 5) }]);
    const note: PdfInkAnnoObject = { ...ink, created: new Date("2026-10-06T10:40:00Z") };
    const back = readNotes(writeNotes([note]));
    expect(back).toEqual([note]);
    expect(back[0].created).toBeInstanceOf(Date);
  });
});
