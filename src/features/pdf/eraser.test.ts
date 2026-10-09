import { describe, expect, it } from "vitest";
import { PdfAnnotationSubtype, type PdfAnnotationObject } from "@embedpdf/models";
import { segmentDistance, touches } from "./eraser";

const rect = (x: number, y: number, width: number, height: number) => ({
  origin: { x, y },
  size: { width, height },
});
const base = { id: "a", pageIndex: 0, rect: rect(0, 0, 100, 100) };

describe("the eraser", () => {
  it("measures from a point to a segment", () => {
    expect(segmentDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    // Past the end: to the end point.
    expect(segmentDistance({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(segmentDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });

  it("takes a stroke it passes over, not one beside it", () => {
    const ink = {
      ...base,
      type: PdfAnnotationSubtype.INK,
      strokeWidth: 2,
      inkList: [
        {
          points: [
            { x: 10, y: 10 },
            { x: 50, y: 10 },
            { x: 50, y: 60 },
          ],
        },
      ],
    } as unknown as PdfAnnotationObject;
    expect(touches(ink, { x: 30, y: 13 }, 3)).toBe(true);
    expect(touches(ink, { x: 52, y: 40 }, 3)).toBe(true);
    // Inside the stroke's box but far from its line.
    expect(touches(ink, { x: 20, y: 40 }, 3)).toBe(false);
  });

  it("takes a rectangle by its outline, an ellipse by its curve", () => {
    const square = {
      ...base,
      type: PdfAnnotationSubtype.SQUARE,
      strokeWidth: 2,
      rect: rect(10, 10, 80, 40),
    } as unknown as PdfAnnotationObject;
    expect(touches(square, { x: 50, y: 11 }, 3)).toBe(true);
    expect(touches(square, { x: 50, y: 30 }, 3)).toBe(false);
    const circle = {
      ...base,
      type: PdfAnnotationSubtype.CIRCLE,
      strokeWidth: 2,
      rect: rect(0, 0, 100, 100),
    } as unknown as PdfAnnotationObject;
    expect(touches(circle, { x: 50, y: 1 }, 3)).toBe(true);
    expect(touches(circle, { x: 50, y: 50 }, 3)).toBe(false);
  });

  it("takes a line, a highlight and a note where they are", () => {
    const line = {
      ...base,
      type: PdfAnnotationSubtype.LINE,
      strokeWidth: 2,
      linePoints: { start: { x: 0, y: 0 }, end: { x: 100, y: 100 } },
    } as unknown as PdfAnnotationObject;
    expect(touches(line, { x: 51, y: 49 }, 3)).toBe(true);
    expect(touches(line, { x: 80, y: 20 }, 3)).toBe(false);
    const highlight = {
      ...base,
      type: PdfAnnotationSubtype.HIGHLIGHT,
      segmentRects: [rect(0, 0, 100, 12), rect(0, 20, 40, 12)],
    } as unknown as PdfAnnotationObject;
    expect(touches(highlight, { x: 30, y: 25 }, 1)).toBe(true);
    expect(touches(highlight, { x: 70, y: 25 }, 1)).toBe(false);
    const note = { ...base, type: PdfAnnotationSubtype.FREETEXT } as unknown as PdfAnnotationObject;
    expect(touches(note, { x: 50, y: 50 }, 1)).toBe(true);
  });

  it("leaves form fields and links alone", () => {
    for (const type of [PdfAnnotationSubtype.WIDGET, PdfAnnotationSubtype.LINK]) {
      expect(touches({ ...base, type } as unknown as PdfAnnotationObject, { x: 50, y: 50 }, 10)).toBe(false);
    }
  });
});
