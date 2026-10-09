import type { PdfPageGeometry, Position } from "@embedpdf/models";

/**
 * Whether a press at `at` (the page's points) lands on a line of text: the
 * highlighter then marks the text exactly; anywhere else (a margin, a
 * figure, a scanned page) it draws free-hand. `reach` widens each line a
 * little, for a press just above or below the letters.
 */
export function onText(geometry: PdfPageGeometry | undefined, at: Position, reach = 2): boolean {
  if (!geometry) return true; // Not read yet: let the text highlighter try.
  return geometry.runs.some(
    ({ rect }) =>
      at.x >= rect.x - reach &&
      at.x <= rect.x + rect.width + reach &&
      at.y >= rect.y - reach &&
      at.y <= rect.y + rect.height + reach,
  );
}
