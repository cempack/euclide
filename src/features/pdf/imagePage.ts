/**
 * An image (a photo of the board, a scan) as a PDF of one page, so that the
 * PDF viewer and its tools work on it. The image file is never changed: the
 * page is made each time the image opens, and what is drawn on it is kept
 * apart (imageNotes.ts).
 */

/**
 * The page an image lies on, in points: as large as the old image annotator
 * drew it (at most 1100 wide, its picture a fifth larger), so that what was
 * drawn with it lines up.
 */
export function imagePageSize(width: number, height: number): { width: number; height: number } {
  const w = Math.min(1100, width * 1.2);
  return { width: w, height: height * (w / width) };
}

/**
 * How many pixels an annotated copy of an image has on its long side: the
 * image's own (below the cap, its page is the image a fifth larger), at most
 * 2400.
 */
export function copySide(page: { width: number; height: number }): number {
  const long = Math.max(page.width, page.height);
  const own = page.width < 1099.5 ? long / 1.2 : Infinity;
  return Math.round(Math.min(2400, own));
}

/** A JPEG's size and colours as stored, and the turn (EXIF orientation 1–8) it shows with. */
export type JpegInfo = { width: number; height: number; colors: 1 | 3; orientation: number };

/**
 * What a JPEG holds, read from its headers, when PDFium can show its data as
 * it is (8 bits, grey or colour, baseline or progressive); null otherwise.
 */
export function jpegInfo(bytes: Uint8Array): JpegInfo | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let orientation = 1;
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    // Fill bytes, and markers without a length.
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2;
      continue;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2 || i + 2 + length > bytes.length) return null;
    const at = i + 4;
    if (marker === 0xe1) orientation = exifOrientation(bytes, at, length - 2) ?? orientation;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = (bytes[at + 1] << 8) | bytes[at + 2];
      const width = (bytes[at + 3] << 8) | bytes[at + 4];
      const colors = bytes[at + 5];
      if (bytes[at] !== 8 || !width || !height || (colors !== 1 && colors !== 3)) return null;
      return { width, height, colors, orientation };
    }
    // Lossless, hierarchical or arithmetic-coded: drawn by the browser instead.
    if (marker >= 0xc3 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
      return null;
    if (marker === 0xda || marker === 0xd9) return null;
    i += 2 + length;
  }
  return null;
}

/** The EXIF orientation tag of an APP1 segment, if it has one. */
function exifOrientation(bytes: Uint8Array, at: number, length: number): number | null {
  const end = at + length;
  const exif = [0x45, 0x78, 0x69, 0x66, 0, 0];
  if (length < 14 || exif.some((b, k) => bytes[at + k] !== b)) return null;
  const tiff = at + 6;
  const little = bytes[tiff] === 0x49 && bytes[tiff + 1] === 0x49;
  if (!little && !(bytes[tiff] === 0x4d && bytes[tiff + 1] === 0x4d)) return null;
  const u16 = (p: number) => (little ? bytes[p] | (bytes[p + 1] << 8) : (bytes[p] << 8) | bytes[p + 1]);
  const u32 = (p: number) => (little ? u16(p) + u16(p + 2) * 0x10000 : u16(p) * 0x10000 + u16(p + 2));
  if (u16(tiff + 2) !== 42) return null;
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return null;
  const count = u16(ifd);
  for (let k = 0; k < count; k++) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > end) return null;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : null;
    }
  }
  return null;
}

/**
 * Where the image goes on a page `w` × `h` points (a PDF matrix), shown as
 * its EXIF orientation says: turned and mirrored by the matrix, its data
 * untouched. Orientations 5 to 8 lie across: the page has the image's height
 * as its width.
 */
export function imageMatrix(orientation: number, w: number, h: number): number[] {
  switch (orientation) {
    case 2:
      return [-w, 0, 0, h, w, 0];
    case 3:
      return [-w, 0, 0, -h, w, h];
    case 4:
      return [w, 0, 0, -h, 0, h];
    case 5:
      return [0, -h, -w, 0, w, h];
    case 6:
      return [0, -h, w, 0, 0, h];
    case 7:
      return [0, h, w, 0, 0, 0];
    case 8:
      return [0, h, -w, 0, w, 0];
    default:
      return [w, 0, 0, h, 0, 0];
  }
}

/** The picture of a page: compressed data as a PDF image holds it. */
export type PageImage = {
  data: Uint8Array;
  filter: "DCTDecode" | "FlateDecode";
  width: number;
  height: number;
  colors: 1 | 3;
};

const num = (v: number) => String(Math.round(v * 1000) / 1000);

/** A PDF of one page `page` points large, the image placed by `matrix` (imageMatrix). */
export function imagePagePdf(
  image: PageImage,
  page: { width: number; height: number },
  matrix: number[],
): Uint8Array {
  const draw = `q ${matrix.map(num).join(" ")} cm /Im0 Do Q`;
  const objects: (string | [string, Uint8Array])[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] ` +
      `/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`,
    [
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} ` +
        `/ColorSpace /${image.colors === 1 ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 ` +
        `/Filter /${image.filter} /Length ${image.data.length} >>\nstream\n`,
      image.data,
    ],
  ];
  const ascii = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const put = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? ascii.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  put("%PDF-1.4\n");
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(length);
    put(`${i + 1} 0 obj\n`);
    if (typeof body === "string") put(body);
    else {
      put(body[0]);
      put(body[1]);
      put("\nendstream");
    }
    put("\nendobj\n");
  });
  const xref = length;
  put(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const o of offsets) put(`${String(o).padStart(10, "0")} 00000 n \n`);
  put(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const pdf = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    pdf.set(c, at);
    at += c.length;
  }
  return pdf;
}

/** A picture drawn by the browser is kept to this many pixels on its long side. */
const MAX_SIDE = 4096;

/**
 * The image as a PDF of one page. A JPEG goes in as it is (a photo keeps
 * every pixel, at no cost); any other picture is drawn by the browser on
 * white, then stored without loss (or as a fine JPEG where the browser
 * cannot compress).
 */
export async function imagePdf(
  blob: Blob,
): Promise<{ pdf: Uint8Array; page: { width: number; height: number } }> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const jpeg = jpegInfo(bytes);
  if (jpeg) {
    const across = jpeg.orientation >= 5;
    const page = imagePageSize(across ? jpeg.height : jpeg.width, across ? jpeg.width : jpeg.height);
    const { width, height, colors } = jpeg;
    const image: PageImage = { data: bytes, filter: "DCTDecode", width, height, colors };
    return { pdf: imagePagePdf(image, page, imageMatrix(jpeg.orientation, page.width, page.height)), page };
  }
  const { image, natural } = await drawn(blob);
  const page = imagePageSize(natural.width, natural.height);
  return { pdf: imagePagePdf(image, page, imageMatrix(1, page.width, page.height)), page };
}

/** The picture as the browser shows it (turned, transparency on white), compressed. */
async function drawn(blob: Blob): Promise<{ image: PageImage; natural: { width: number; height: number } }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const natural = { width: img.naturalWidth, height: img.naturalHeight };
    if (!natural.width || !natural.height) throw new Error("image without a size");
    const k = Math.min(1, MAX_SIDE / Math.max(natural.width, natural.height));
    const width = Math.max(1, Math.round(natural.width * k));
    const height = Math.max(1, Math.round(natural.height * k));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2D canvas");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    if (typeof CompressionStream !== "function") {
      const jpeg = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.92));
      if (!jpeg) throw new Error("image not encoded");
      const data = new Uint8Array(await jpeg.arrayBuffer());
      return { image: { data, filter: "DCTDecode", width, height, colors: 3 }, natural };
    }
    const rgba = ctx.getImageData(0, 0, width, height).data;
    const rgb = new Uint8Array(width * height * 3);
    for (let p = 0, q = 0; p < rgba.length; p += 4, q += 3) {
      rgb[q] = rgba[p];
      rgb[q + 1] = rgba[p + 1];
      rgb[q + 2] = rgba[p + 2];
    }
    // « deflate » is the zlib format a PDF's FlateDecode reads.
    const stream = new Blob([rgb]).stream().pipeThrough(new CompressionStream("deflate"));
    const data = new Uint8Array(await new Response(stream).arrayBuffer());
    return { image: { data, filter: "FlateDecode", width, height, colors: 3 }, natural };
  } finally {
    URL.revokeObjectURL(url);
  }
}
