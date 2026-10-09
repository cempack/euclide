/// <reference lib="webworker" />
import { init } from "@embedpdf/pdfium";
import { PdfiumNative } from "@embedpdf/engines/pdfium";
import { PdfErrorCode, type PdfDocumentObject } from "@embedpdf/models";
import type { PageEdit } from "./pageEdits";
import { onePagePdf } from "./sheet";

/**
 * Changes to a document's pages (pageEdits.ts), in a PDFium of its own:
 * EmbedPDF's engine opens and saves, and PDFium itself turns a page, which
 * the engine cannot. Started for one change, then let go.
 */

type Request = { wasmUrl: string; bytes: ArrayBuffer; edit: PageEdit };
export type Reply = { bytes: ArrayBuffer } | { error: string; locked?: boolean };

let ready: Promise<{ pdfium: Awaited<ReturnType<typeof init>>; engine: PdfiumNative }> | null = null;

function start(wasmUrl: string) {
  ready ??= (async () => {
    const wasmBinary = await (await fetch(wasmUrl)).arrayBuffer();
    const pdfium = await init({ wasmBinary });
    return { pdfium, engine: new PdfiumNative(pdfium, { fontFallback: null }) };
  })();
  return ready;
}

async function apply({ wasmUrl, bytes, edit }: Request): Promise<ArrayBuffer> {
  const { pdfium, engine } = await start(wasmUrl);
  // Each page's size as unturned, and its turn on the side.
  const doc = await engine
    .openDocumentBuffer({ id: "edit", content: bytes }, { normalizeRotation: true })
    .toPromise();
  const opened: PdfDocumentObject[] = [doc];
  try {
    switch (edit.kind) {
      case "rotate": {
        // PDFium's own page, for its turn: a quarter more to the right or left.
        const docPtr = (
          engine as unknown as { cache: { getContext(id: string): { docPtr: number } } }
        ).cache.getContext(doc.id).docPtr;
        const page = pdfium.FPDF_LoadPage(docPtr, edit.page);
        if (!page) throw new Error("page");
        try {
          const turn = (pdfium.FPDFPage_GetRotation(page) + edit.turn + 4) % 4;
          pdfium.FPDFPage_SetRotation(page, turn);
        } finally {
          pdfium.FPDF_ClosePage(page);
        }
        break;
      }
      case "delete":
        await engine.deletePage(doc, edit.page).toPromise();
        break;
      case "insert": {
        // As big as the page it follows, as it shows (turned or not).
        const near = doc.pages[Math.max(0, Math.min(doc.pageCount - 1, edit.after))];
        const turned = near.rotation % 2 === 1;
        const width = turned ? near.size.height : near.size.width;
        const height = turned ? near.size.width : near.size.height;
        const sheet = await engine
          .openDocumentBuffer({
            id: "sheet",
            content: onePagePdf(width, height, edit.paper).buffer as ArrayBuffer,
          })
          .toPromise();
        opened.push(sheet);
        await engine.importPages(doc, sheet, [0], edit.after + 1).toPromise();
        break;
      }
      case "extract":
        return await engine.extractPages(doc, edit.pages).toPromise();
    }
    return await engine.saveAsCopy(doc).toPromise();
  } finally {
    for (const d of opened) engine.closeDocument(d);
  }
}

self.onmessage = (e: MessageEvent<Request>) => {
  apply(e.data).then(
    (bytes) => self.postMessage({ bytes } satisfies Reply, [bytes]),
    (err: unknown) => {
      const reason = (err as { reason?: { code?: number; message?: string } })?.reason;
      self.postMessage({
        error: reason?.message ?? String(err),
        locked: reason?.code === PdfErrorCode.Password,
      } satisfies Reply);
    },
  );
};
