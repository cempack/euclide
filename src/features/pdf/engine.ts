import {
  getDocument,
  GlobalWorkerOptions,
  PDFWorker,
  type PDFDocumentLoadingTask,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

/*
 * The « legacy » build: the modern one needs the very latest engines
 * (Map.getOrInsertComputed, Math.sumPrecise…), and a school PC's WebView2
 * may be held back by its administrators. The legacy one carries polyfills.
 */

/**
 * One PDF.js worker for the whole app: every open document shares it. The
 * old viewer started a page and a worker per PDF tab, a real cost on a
 * school PC's memory.
 */
let worker: PDFWorker | null = null;

function sharedWorker(): PDFWorker {
  if (!worker) {
    GlobalWorkerOptions.workerSrc = workerUrl;
    // The typings leave `port` as null; PDF.js takes a Worker there.
    const port = new Worker(workerUrl, { type: "module" }) as unknown as null;
    worker = new PDFWorker({ port });
  }
  return worker;
}

/** Fonts, character maps, colour profiles and decoders (scripts/vite-pdfjs-assets.ts). */
const ASSETS = "/pdfjs-assets/";

/** Opens a document by URL (a library file is `fileUrl(id)`) or from bytes. */
export function openPdf(source: { url: string } | { data: Uint8Array }): PDFDocumentLoadingTask {
  return getDocument({
    ...source,
    worker: sharedWorker(),
    cMapUrl: `${ASSETS}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${ASSETS}standard_fonts/`,
    wasmUrl: `${ASSETS}wasm/`,
    iccUrl: `${ASSETS}iccs/`,
  });
}
