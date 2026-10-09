import { describe, expect, it } from "vitest";
import { pagesLabel, parsePages } from "./pageEdits";
import { onePagePdf } from "./sheet";

describe("the pages typed for extraction", () => {
  it("reads one page, a run and a list, as the teacher writes them", () => {
    expect(parsePages("3", 10)).toEqual([2]);
    expect(parsePages("3-5", 10)).toEqual([2, 3, 4]);
    expect(parsePages("3 à 5", 10)).toEqual([2, 3, 4]);
    expect(parsePages(" 1, 4 – 6 ; 2 ", 10)).toEqual([0, 1, 3, 4, 5]);
  });

  it("takes each page once, in order, even backwards", () => {
    expect(parsePages("5-3, 4", 10)).toEqual([2, 3, 4]);
  });

  it("names them back as written: runs and single pages", () => {
    expect(pagesLabel([2, 3, 4])).toBe("3-5");
    expect(pagesLabel([0, 3, 4, 5, 8])).toBe("1, 4-6, 9");
  });

  it("refuses a page the document does not have, or words", () => {
    expect(parsePages("0", 10)).toBeNull();
    expect(parsePages("9-11", 10)).toBeNull();
    expect(parsePages("", 10)).toBeNull();
    expect(parsePages("la troisième", 10)).toBeNull();
  });
});

describe("a page to insert", () => {
  const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

  it("is a PDF whose table points at each of its objects", () => {
    const pdf = text(onePagePdf(595.28, 841.89, "squared"));
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf).toContain("/MediaBox [0 0 595.28 841.89]");
    const xref = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(xref, xref + 4)).toBe("xref");
    const offsets = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(4);
    offsets.forEach((at, i) => expect(pdf.slice(at, at + 8)).toBe(`${i + 1} 0 obj\n`));
  });

  it("draws 5 mm squares for squared paper, nothing for blank", () => {
    const squared = text(onePagePdf(595.28, 841.89, "squared"));
    const length = Number(/\/Length (\d+)/.exec(squared)![1]);
    const stream = squared.slice(squared.indexOf("stream\n") + 7, squared.indexOf("\nendstream"));
    expect(stream.length).toBe(length);
    // A4 less 10 mm each side: 38 squares across, 55 down.
    expect(stream.match(/ m /g)).toHaveLength(39 + 56);
    expect(text(onePagePdf(595.28, 841.89, "blank"))).toContain("/Length 0");
  });
});
