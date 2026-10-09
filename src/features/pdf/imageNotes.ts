import {
  PdfAnnotationSubtype,
  uuidV4,
  type PdfAnnotationObject,
  type PdfInkAnnoObject,
  type Position,
} from "@embedpdf/models";
import { segmentDistance } from "./eraser";

/**
 * What is drawn on an image, kept apart from it in the library
 * (file_annotations), so the image file is never touched. Since 0.6 these
 * are the PDF annotations of the image's page (imagePage.ts), as EmbedPDF
 * reads them back; before, the old annotator's strokes, which open as ink.
 */

/** A stroke of the annotator before 0.6, in the space of the image's page (imagePageSize). */
export type LegacyStroke = { tool: "pen" | "eraser"; color: string; size: number; pts: Position[] };

type Stored = { version: 2; annotations: PdfAnnotationObject[] };

/** The annotations kept for an image, from what the library holds (null: none yet). */
export function readNotes(json: string | null): PdfAnnotationObject[] {
  if (!json) return [];
  const parsed = JSON.parse(json) as Partial<Stored> & { strokes?: LegacyStroke[] };
  if (parsed.version === 2 && Array.isArray(parsed.annotations))
    return parsed.annotations.map((a) => ({
      ...a,
      pageIndex: 0,
      // Dates come back as text.
      ...(a.created && { created: new Date(a.created) }),
      ...(a.modified && { modified: new Date(a.modified) }),
    }));
  return Array.isArray(parsed.strokes) ? legacyInk(parsed.strokes) : [];
}

/** What the library keeps for an image's annotations. */
export function writeNotes(annotations: PdfAnnotationObject[]): string {
  return JSON.stringify({ version: 2, annotations } satisfies Stored);
}

type Run = { color: string; size: number; pts: Position[] };

/**
 * The old annotator's pen strokes as they showed: each eraser stroke took
 * out what it passed over from the strokes drawn before it, so those are cut
 * there into the pieces that were left.
 */
export function visibleRuns(strokes: LegacyStroke[]): Run[] {
  let runs: Run[] = [];
  for (const s of strokes) {
    if (!Array.isArray(s?.pts) || !s.pts.length) continue;
    if (s.tool !== "eraser") {
      runs.push({ color: s.color, size: s.size, pts: s.pts });
      continue;
    }
    const next: Run[] = [];
    for (const run of runs) {
      const reach = s.size / 2 + run.size / 2;
      let piece: Position[] = [];
      for (const p of dense(run.pts, reach / 2)) {
        if (passes(s.pts, p, reach)) {
          if (piece.length > 1) next.push({ ...run, pts: piece });
          piece = [];
        } else piece.push(p);
      }
      if (piece.length > 1) next.push({ ...run, pts: piece });
    }
    runs = next;
  }
  return runs;
}

/** Whether the eraser's path came within `reach` of `p`. */
function passes(path: Position[], p: Position, reach: number): boolean {
  if (path.length === 1) return segmentDistance(p, path[0], path[0]) <= reach;
  for (let k = 1; k < path.length; k++) if (segmentDistance(p, path[k - 1], path[k]) <= reach) return true;
  return false;
}

/** The points of a stroke, with more between any two further apart than `step`: a quick stroke is cut where the eraser crossed it, not around. */
function dense(pts: Position[], step: number): Position[] {
  const out: Position[] = [pts[0]];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1];
    const b = pts[k];
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step);
    for (let j = 1; j < n; j++) out.push({ x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n });
    out.push(b);
  }
  return out;
}

/** The old strokes as ink annotations of the image's page, as they showed. */
export function legacyInk(strokes: LegacyStroke[]): PdfInkAnnoObject[] {
  return visibleRuns(strokes).map((run) => {
    const xs = run.pts.map((p) => p.x);
    const ys = run.pts.map((p) => p.y);
    const pad = run.size / 2;
    const x = Math.min(...xs) - pad;
    const y = Math.min(...ys) - pad;
    return {
      type: PdfAnnotationSubtype.INK,
      id: uuidV4(),
      pageIndex: 0,
      rect: {
        origin: { x, y },
        size: { width: Math.max(...xs) + pad - x, height: Math.max(...ys) + pad - y },
      },
      inkList: [{ points: run.pts }],
      strokeColor: run.color,
      color: run.color,
      opacity: 1,
      strokeWidth: run.size,
      flags: ["print"],
    };
  });
}
