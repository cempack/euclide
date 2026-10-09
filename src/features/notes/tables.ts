/**
 * Tables in a note: cells copied from a spreadsheet (LibreOffice, Excel,
 * Google Sheets) become a Markdown table. The clipboard's text holds one row
 * per line, cells apart by tabs; a cell with a line break or a quote comes
 * in quotes, its own quotes doubled.
 */
export function parseCells(text: string): string[][] {
  const s = text.replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let start = true;
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (s[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
      continue;
    }
    if (start && c === '"') {
      quoted = true;
      start = false;
      continue;
    }
    start = false;
    if (c === "\t" || c === "\n") {
      row.push(cell);
      cell = "";
      start = true;
      if (c === "\n") {
        rows.push(row);
        row = [];
      }
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  // Blank rows at the end of a selection.
  while (rows.length && rows[rows.length - 1].every((x) => !x.trim())) rows.pop();
  return rows;
}

/** A number as a teacher writes it: « 12 », « 12,5 », « 1 234 », « 15 % », « 8 € ». */
const NUMBER = /^[-+−]?\d[\d \u00a0\u202f]*(?:[.,]\d+)?\s*[%€]?$/;

/**
 * Rows of cells as a Markdown table, the first row its header. A column of
 * numbers is set to the right, so its digits line up.
 */
export function markdownTable(rows: string[][]): string {
  const width = Math.max(1, ...rows.map((r) => r.length));
  const clean = (s: string) =>
    s
      .replace(/\s*\n\s*/g, " ")
      .replace(/\|/g, "\\|")
      .trim();
  const [head, ...body] = rows.map((r) => Array.from({ length: width }, (_, i) => clean(r[i] ?? "")));
  const numeric = head.map((_, i) => body.some((r) => r[i]) && body.every((r) => !r[i] || NUMBER.test(r[i])));
  const line = (cells: string[]) => `|${cells.map((c) => (c ? ` ${c} ` : " ")).join("|")}|`;
  return [line(head), line(numeric.map((n) => (n ? "---:" : "---"))), ...body.map(line)].join("\n");
}

/**
 * What the clipboard holds as a Markdown table, or null: only cells copied
 * from a spreadsheet (its HTML holds a table), two cells at least. Text with
 * tabs from anywhere else (a Python script) is pasted as it is.
 */
export function tableFromClipboard(text: string, html: string): string | null {
  if (!text.includes("\t") && !text.includes("\n")) return null;
  if (!/<table[\s>]/i.test(html)) return null;
  const rows = parseCells(text);
  const cells = rows.reduce((n, r) => n + r.length, 0);
  return cells >= 2 ? markdownTable(rows) : null;
}

/** A table to fill in: its header, and empty rows under it. */
export function emptyTable(header: string[], rows = 2): string {
  return markdownTable([header, ...Array.from({ length: rows }, () => header.map(() => ""))]);
}
