import wasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";
import { tr } from "../../lib/i18n";
import type { Reply } from "./pageWorker";
import type { Paper } from "./sheet";

/** A change to a document's pages, counted from 0. */
export type PageEdit =
  | { kind: "rotate"; page: number; turn: 1 | -1 }
  | { kind: "delete"; page: number }
  | { kind: "insert"; after: number; paper: Paper }
  | { kind: "move"; page: number; to: number }
  | { kind: "append"; other: ArrayBuffer }
  | { kind: "extract"; pages: number[] };

/**
 * The document with one change to its pages, made by a PDFium of its own
 * in a worker (pageWorker.ts), stopped once done.
 */
export function editPages(bytes: Uint8Array, edit: PageEdit): Promise<Uint8Array> {
  const worker = new Worker(new URL("./pageWorker.ts", import.meta.url), { type: "module" });
  return new Promise<Uint8Array>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<Reply>) => {
      worker.terminate();
      if ("bytes" in e.data) resolve(new Uint8Array(e.data.bytes));
      else reject(new Error(e.data.locked ? tr("pdf.pagesLocked") : e.data.error));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };
    const copy = bytes.slice().buffer;
    worker.postMessage({ wasmUrl: new URL(wasmUrl, location.href).href, bytes: copy, edit }, [copy]);
  });
}

/**
 * The pages typed by the teacher (« 3 », « 3-5 », « 3 à 5 », « 1, 4-6 »),
 * counted from 0, in order and once each; null when one is not there.
 */
export function parsePages(text: string, count: number): number[] | null {
  const parts = text
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const pages = new Set<number>();
  for (const part of parts) {
    const m = /^(\d+)(?:\s*(?:-|–|à)\s*(\d+))?$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    const [from, to] = a <= b ? [a, b] : [b, a];
    if (from < 1 || to > count) return null;
    for (let p = from; p <= to; p++) pages.add(p - 1);
  }
  return [...pages].sort((x, y) => x - y);
}

/** Pages counted from 0, as written for people: « 3-5 », « 1, 4-6 ». */
export function pagesLabel(pages: number[]): string {
  const runs: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    runs.push(j > i ? `${pages[i] + 1}-${pages[j] + 1}` : `${pages[i] + 1}`);
    i = j;
  }
  return runs.join(", ");
}
