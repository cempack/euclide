import { PdfAnnotationSubtype, type PdfAnnotationObject, type Position, type Rect } from "@embedpdf/models";

/**
 * What the eraser touches on a page. Positions and sizes are in the page's
 * points, as EmbedPDF gives them: `reach` is the eraser's radius there.
 */

const distance = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.y - b.y);

/** From `p` to the segment a–b. */
export function segmentDistance(p: Position, a: Position, b: Position): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  if (!length2) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

const inRect = (p: Position, r: Rect, pad: number) =>
  p.x >= r.origin.x - pad &&
  p.x <= r.origin.x + r.size.width + pad &&
  p.y >= r.origin.y - pad &&
  p.y <= r.origin.y + r.size.height + pad;

/** From `p` to a rectangle's outline (inside or out). */
function rectEdgeDistance(p: Position, r: Rect): number {
  const { x, y } = r.origin;
  const { width: w, height: h } = r.size;
  const corners = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  return Math.min(...corners.map((c, i) => segmentDistance(p, c, corners[(i + 1) % 4])));
}

/** From `p` to the outline of the ellipse inscribed in `r`, roughly (exact for a circle). */
function ellipseEdgeDistance(p: Position, r: Rect): number {
  const rx = r.size.width / 2;
  const ry = r.size.height / 2;
  if (!rx || !ry) return rectEdgeDistance(p, r);
  const nx = (p.x - (r.origin.x + rx)) / rx;
  const ny = (p.y - (r.origin.y + ry)) / ry;
  return Math.abs(Math.hypot(nx, ny) - 1) * Math.min(rx, ry);
}

/**
 * Whether the eraser at `p` touches `a`: a stroke or a shape by its line
 * (not the empty inside of a rectangle), a highlight by its marked text, a
 * text note or a picture anywhere on it. Links and form fields never.
 */
export function touches(a: PdfAnnotationObject, p: Position, reach: number): boolean {
  switch (a.type) {
    case PdfAnnotationSubtype.INK: {
      const near = reach + a.strokeWidth / 2;
      return a.inkList.some(({ points }) =>
        points.length === 1
          ? distance(p, points[0]) <= near
          : points.some((q, i) => i > 0 && segmentDistance(p, points[i - 1], q) <= near),
      );
    }
    case PdfAnnotationSubtype.LINE:
      return segmentDistance(p, a.linePoints.start, a.linePoints.end) <= reach + a.strokeWidth / 2;
    case PdfAnnotationSubtype.SQUARE:
      return rectEdgeDistance(p, a.rect) <= reach + a.strokeWidth;
    case PdfAnnotationSubtype.CIRCLE:
      return ellipseEdgeDistance(p, a.rect) <= reach + a.strokeWidth;
    case PdfAnnotationSubtype.HIGHLIGHT:
    case PdfAnnotationSubtype.UNDERLINE:
    case PdfAnnotationSubtype.STRIKEOUT:
    case PdfAnnotationSubtype.SQUIGGLY:
      return (a.segmentRects.length ? a.segmentRects : [a.rect]).some((r) => inRect(p, r, reach));
    case PdfAnnotationSubtype.FREETEXT:
    case PdfAnnotationSubtype.TEXT:
    case PdfAnnotationSubtype.STAMP:
      return inRect(p, a.rect, reach);
    default:
      return false;
  }
}
