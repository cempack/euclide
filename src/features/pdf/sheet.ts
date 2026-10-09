/** A page to insert into a document (pageEdits.ts), as a PDF of its own. */

/** An inserted page: blank, or squared as a maths exercise book (5 mm). */
export type Paper = "blank" | "squared";

const MM = 72 / 25.4;
const num = (v: number) => String(Math.round(v * 100) / 100);

/**
 * A PDF of one page, `width` × `height` points: blank, or squared every
 * 5 mm in the light blue of exercise books, 10 mm from the edges.
 */
export function onePagePdf(width: number, height: number, paper: Paper): Uint8Array {
  let lines = "";
  if (paper === "squared") {
    const step = 5 * MM;
    const across = Math.floor((width - 20 * MM) / step);
    const down = Math.floor((height - 20 * MM) / step);
    const left = (width - across * step) / 2;
    const top = (height - down * step) / 2;
    const right = left + across * step;
    const bottom = top + down * step;
    for (let i = 0; i <= across; i++)
      lines += `${num(left + i * step)} ${num(top)} m ${num(left + i * step)} ${num(bottom)} l\n`;
    for (let j = 0; j <= down; j++)
      lines += `${num(left)} ${num(top + j * step)} m ${num(right)} ${num(top + j * step)} l\n`;
    lines = `0.62 0.75 0.9 RG 0.4 w\n${lines}S\n`;
  }
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(width)} ${num(height)}] /Resources << >> /Contents 4 0 R >>`,
    `<< /Length ${lines.length} >>\nstream\n${lines}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Plain ASCII: one byte a character, so the offsets above hold.
  return new TextEncoder().encode(pdf);
}
