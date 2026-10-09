import { describe, expect, it } from "vitest";
import { copySide, imageMatrix, imagePagePdf, imagePageSize, jpegInfo } from "./imagePage";

/** JPEG headers: SOI, an optional EXIF APP1 with an orientation, a frame header. */
function jpeg({
  width = 640,
  height = 480,
  colors = 3,
  sof = 0xc0,
  orientation,
  little = false,
}: {
  width?: number;
  height?: number;
  colors?: number;
  sof?: number;
  orientation?: number;
  little?: boolean;
}): Uint8Array {
  const bytes: number[] = [0xff, 0xd8];
  if (orientation) {
    const u16 = (v: number) => (little ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
    const u32 = (v: number) =>
      little ? [...u16(v & 0xffff), ...u16(v >>> 16)] : [...u16(v >>> 16), ...u16(v & 0xffff)];
    const tiff = [
      ...(little ? [0x49, 0x49] : [0x4d, 0x4d]),
      ...u16(42),
      ...u32(8),
      ...u16(1),
      // One entry: orientation, SHORT, 1 value.
      ...u16(0x0112),
      ...u16(3),
      ...u32(1),
      ...u16(orientation),
      0,
      0,
      ...u32(0),
    ];
    const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    bytes.push(0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 0xff, ...app1);
  }
  const frame = [8, height >> 8, height & 0xff, width >> 8, width & 0xff, colors];
  for (let c = 0; c < colors; c++) frame.push(c + 1, 0x11, 0);
  bytes.push(0xff, sof, (frame.length + 2) >> 8, (frame.length + 2) & 0xff, ...frame);
  bytes.push(0xff, 0xda, 0, 2, 0xff, 0xd9);
  return new Uint8Array(bytes);
}

describe("jpegInfo", () => {
  it("reads the size and colours of a baseline or progressive JPEG", () => {
    expect(jpegInfo(jpeg({}))).toEqual({ width: 640, height: 480, colors: 3, orientation: 1 });
    expect(jpegInfo(jpeg({ sof: 0xc2, colors: 1 }))).toEqual({
      width: 640,
      height: 480,
      colors: 1,
      orientation: 1,
    });
  });

  it("reads the EXIF orientation, in either byte order", () => {
    expect(jpegInfo(jpeg({ orientation: 6 }))?.orientation).toBe(6);
    expect(jpegInfo(jpeg({ orientation: 8, little: true }))?.orientation).toBe(8);
  });

  it("leaves to the browser what PDFium may not show as it is", () => {
    expect(jpegInfo(jpeg({ colors: 4 }))).toBeNull(); // CMYK
    expect(jpegInfo(jpeg({ sof: 0xc3 }))).toBeNull(); // lossless
    expect(jpegInfo(jpeg({ sof: 0xc9 }))).toBeNull(); // arithmetic
    expect(jpegInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // a PNG
    expect(jpegInfo(jpeg({}).slice(0, 8))).toBeNull(); // cut short
  });
});

describe("imagePageSize", () => {
  it("is the old annotator's space: a fifth larger, at most 1100 wide", () => {
    expect(imagePageSize(800, 500)).toEqual({ width: 960, height: 600 });
    const photo = imagePageSize(4000, 3000);
    expect(photo.width).toBe(1100);
    expect(photo.height).toBeCloseTo(825, 6);
  });
});

describe("copySide", () => {
  it("is the image's own size, at most 2400 pixels", () => {
    expect(copySide(imagePageSize(800, 500))).toBe(800);
    expect(copySide(imagePageSize(500, 800))).toBe(800);
    expect(copySide(imagePageSize(4000, 3000))).toBe(2400);
  });
});

describe("imageMatrix", () => {
  // Where a corner of the image as stored (s right, t down, 0 to 1) shows
  // on the page, as EXIF orientations say: X right, Y down.
  const shown: Record<number, (s: number, t: number) => [number, number]> = {
    1: (s, t) => [s, t],
    2: (s, t) => [1 - s, t],
    3: (s, t) => [1 - s, 1 - t],
    4: (s, t) => [s, 1 - t],
    5: (s, t) => [t, s],
    6: (s, t) => [1 - t, s],
    7: (s, t) => [1 - t, 1 - s],
    8: (s, t) => [t, 1 - s],
  };

  it("turns and mirrors the image as its orientation says", () => {
    const W = 300;
    const H = 200;
    for (let o = 1; o <= 8; o++) {
      const [a, b, c, d, e, f] = imageMatrix(o, W, H);
      for (const [s, t] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        // A PDF image's unit square: u right, v up from its last row.
        const u = s;
        const v = 1 - t;
        const [X, Y] = shown[o](s, t);
        expect([a * u + c * v + e, b * u + d * v + f], `orientation ${o}, corner ${s},${t}`).toEqual([
          X * W,
          (1 - Y) * H,
        ]);
      }
    }
  });
});

describe("imagePagePdf", () => {
  it("writes a PDF whose cross-reference points at each object", () => {
    const data = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const pdf = imagePagePdf(
      { data, filter: "DCTDecode", width: 2, height: 1, colors: 3 },
      { width: 100, height: 50 },
      imageMatrix(1, 100, 50),
    );
    const text = new TextDecoder("latin1").decode(pdf);
    const xref = Number(/startxref\n(\d+)/.exec(text)?.[1]);
    expect(text.slice(xref, xref + 4)).toBe("xref");
    const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(5);
    offsets.forEach((o, i) => expect(text.slice(o, o + 7)).toBe(`${i + 1} 0 obj`));
    expect(text).toContain("/MediaBox [0 0 100 50]");
    expect(text).toContain("q 100 0 0 50 0 0 cm /Im0 Do Q");
    // The image's bytes, as they were.
    const at = text.indexOf("stream\n", text.indexOf("/Subtype /Image")) + 7;
    expect([...pdf.slice(at, at + data.length)]).toEqual([...data]);
  });
});
