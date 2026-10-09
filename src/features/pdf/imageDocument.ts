import { api, fileUrl } from "../../lib/api";
import { reportError } from "../../lib/report";
import { imagePdf } from "./imagePage";
import { readNotes } from "./imageNotes";
import { newDocumentId, pdfium } from "./pdfium";

/**
 * An image of the library as the PDF viewer opens it: its page
 * (imagePage.ts), with what was drawn on it (imageNotes.ts) as the page's
 * annotations, so they open as the ones drawn since: moved, erased, undone.
 */
export async function imageDocument(fileId: number): Promise<ArrayBuffer> {
  const res = await fetch(fileUrl(fileId));
  if (!res.ok) throw new Error((await res.text()) || `${res.status} ${res.statusText}`);
  const [{ pdf }, saved] = await Promise.all([res.blob().then(imagePdf), api.readAnnotations(fileId)]);
  let notes: ReturnType<typeof readNotes> = [];
  try {
    notes = readNotes(saved);
  } catch (err) {
    // A damaged drawing: the image alone, and a trace in the log.
    reportError("image.readAnnotations", err);
  }
  if (!notes.length) return pdf.buffer as ArrayBuffer;
  const engine = pdfium();
  const doc = await engine
    .openDocumentBuffer({ id: newDocumentId("image"), content: pdf.buffer as ArrayBuffer })
    .toPromise();
  try {
    for (const note of notes) {
      try {
        await engine.createPageAnnotation(doc, doc.pages[0], note).toPromise();
      } catch (err) {
        reportError("image.restoreAnnotation", err);
      }
    }
    return await engine.saveAsCopy(doc).toPromise();
  } finally {
    engine.closeDocument(doc);
  }
}
