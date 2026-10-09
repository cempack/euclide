import { describe, expect, it } from "vitest";
import type { PdfPageGeometry } from "@embedpdf/models";
import { onText } from "./marker";

const line = (x: number, y: number, width: number, height: number) => ({
  rect: { x, y, width, height },
  charStart: 0,
  glyphs: [],
});

describe("the highlighter", () => {
  const page = { runs: [line(50, 100, 300, 12), line(50, 120, 200, 12)] } as PdfPageGeometry;

  it("marks text where the press lands on a line", () => {
    expect(onText(page, { x: 120, y: 105 })).toBe(true);
    // Just above the letters.
    expect(onText(page, { x: 120, y: 99 })).toBe(true);
    expect(onText(page, { x: 240, y: 126 })).toBe(true);
  });

  it("draws free-hand in a margin, beside a short line, or on a scan", () => {
    expect(onText(page, { x: 20, y: 105 })).toBe(false);
    expect(onText(page, { x: 300, y: 126 })).toBe(false);
    expect(onText({ runs: [] } as unknown as PdfPageGeometry, { x: 120, y: 105 })).toBe(false);
  });

  it("lets the text highlighter try while a page's text is not read yet", () => {
    expect(onText(undefined, { x: 0, y: 0 })).toBe(true);
  });
});
