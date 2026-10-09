import { createPdfiumEngine } from "@embedpdf/engines/pdfium-worker-engine";
import wasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";

export type PdfiumEngine = ReturnType<typeof createPdfiumEngine>;

let engine: PdfiumEngine | null = null;

/**
 * PDFium, compiled to WebAssembly, in a worker of its own: one for the whole
 * app. Every PDF tab and the Documents previews share it, each document
 * under its own id. A page is drawn there and handed over as a picture, so
 * a heavy page never holds up the window.
 */
export function pdfium(): PdfiumEngine {
  // Absolute: the worker fetches the WebAssembly, and its base is not the page's.
  // No fallback fonts: they would be fetched from the internet.
  engine ??= createPdfiumEngine(new URL(wasmUrl, location.href).href, { fontFallback: null });
  return engine;
}

/** The engine could not start (its WebAssembly did not load): the next document tries again. */
export function restartPdfium() {
  const failed = engine;
  engine = null;
  failed?.destroy();
}

let count = 0;

/** An id no other open document has, in the engine shared by all. */
export const newDocumentId = (prefix = "pdf") => `${prefix}-${++count}`;
