import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  AnnotationEditorParamsType,
  AnnotationEditorType,
  type PDFDocumentProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import { EventBus, LinkTarget, PDFLinkService, PDFViewer } from "pdfjs-dist/legacy/web/pdf_viewer.mjs";
import "pdfjs-dist/legacy/web/pdf_viewer.css";
import { openPdf } from "./engine";

export type PdfTool = "select" | "pen" | "highlight" | "text";

const MODES: Record<PdfTool, number> = {
  select: AnnotationEditorType.NONE,
  pen: AnnotationEditorType.INK,
  highlight: AnnotationEditorType.HIGHLIGHT,
  text: AnnotationEditorType.FREETEXT,
};

export type PdfViewHandle = {
  /** The document with its annotations written in (pending strokes included). */
  save(): Promise<Uint8Array>;
  /** After a successful save: the next change counts as unsaved again. */
  markSaved(): void;
  zoom(dir: 1 | -1 | 0): void;
  goTo(page: number): void;
  /** Removes the selected drawing, highlight or note. */
  deleteSelected(): void;
};

type Source = { url: string } | { data: Uint8Array };

/**
 * A PDF, drawn by PDF.js's own viewer components inside the page (no iframe):
 * one EventBus per view, so two open PDFs never hear each other, and one
 * worker shared by all (engine.ts). Pen, highlighter and text notes are
 * PDF annotations, written into the file when it is saved.
 */
export const PdfView = forwardRef<
  PdfViewHandle,
  {
    source: Source;
    tool: PdfTool;
    color: string;
    /** Read-only (an old version): no tools. */
    readOnly?: boolean;
    onReady?: (doc: PDFDocumentProxy) => void;
    onPage?: (page: number) => void;
    onScale?: (scale: number) => void;
    onDirty?: () => void;
    onError?: (err: unknown) => void;
  }
>(function PdfView({ source, tool, color, readOnly, onReady, onPage, onScale, onDirty, onError }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PDFViewer | null>(null);
  const busRef = useRef<EventBus | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const modeRef = useRef(MODES.select);
  // Bumped when a document's pages are ready: the tool and colour apply then.
  const [ready, setReady] = useState(0);
  const callbacks = useRef({ onReady, onPage, onScale, onDirty, onError });
  useEffect(() => {
    callbacks.current = { onReady, onPage, onScale, onDirty, onError };
  });

  /** Sets the editing mode and waits until PDF.js has applied it. */
  const setMode = (mode: number) =>
    new Promise<void>((resolve) => {
      const viewer = viewerRef.current;
      const bus = busRef.current;
      if (!viewer || !bus || !docRef.current) return resolve();
      if (modeRef.current === mode) return resolve();
      const done = () => {
        bus.off("annotationeditormodechanged", done);
        window.clearTimeout(timer);
        resolve();
      };
      const timer = window.setTimeout(done, 800);
      bus.on("annotationeditormodechanged", done);
      try {
        viewer.annotationEditorMode = { mode };
      } catch {
        done();
      }
    });

  useImperativeHandle(ref, () => ({
    async save() {
      const doc = docRef.current;
      if (!doc) throw new Error("Le document n'est pas encore ouvert.");
      // A stroke still being drawn is only written once PDF.js commits it,
      // which it does when the tool changes: pass through « Sélection ».
      const mode = modeRef.current;
      if (mode !== AnnotationEditorType.NONE) await setMode(AnnotationEditorType.NONE);
      try {
        return await doc.saveDocument();
      } finally {
        if (mode !== AnnotationEditorType.NONE) await setMode(mode);
      }
    },
    markSaved() {
      docRef.current?.annotationStorage.resetModified();
    },
    zoom(dir) {
      const viewer = viewerRef.current;
      if (!viewer) return;
      if (dir === 0) viewer.currentScaleValue = "page-width";
      else if (dir > 0) viewer.increaseScale();
      else viewer.decreaseScale();
    },
    goTo(page) {
      if (viewerRef.current) viewerRef.current.currentPageNumber = page;
    },
    deleteSelected() {
      busRef.current?.dispatch("editingaction", { source: null, name: "delete" });
    },
  }));

  const key = "url" in source ? source.url : source.data;
  useEffect(() => {
    const container = containerRef.current!;
    const bus = new EventBus();
    // A link to a website asks for a new window, which Euclide opens in the
    // browser (src-tauri/src/boot.rs): in its own window, the site took
    // Euclide's place with no way back.
    const link = new PDFLinkService({
      eventBus: bus,
      externalLinkTarget: LinkTarget.BLANK,
      externalLinkRel: "noopener noreferrer nofollow",
    });
    const viewer = new PDFViewer({
      container,
      eventBus: bus,
      linkService: link,
      annotationEditorMode: readOnly ? AnnotationEditorType.DISABLE : AnnotationEditorType.NONE,
    });
    link.setViewer(viewer);
    viewerRef.current = viewer;
    busRef.current = bus;
    modeRef.current = AnnotationEditorType.NONE;

    bus.on("pagesinit", () => {
      viewer.currentScaleValue = "page-width";
      setReady((n) => n + 1);
      if (docRef.current) callbacks.current.onReady?.(docRef.current);
    });
    bus.on("pagechanging", (e: { pageNumber: number }) => callbacks.current.onPage?.(e.pageNumber));
    bus.on("scalechanging", (e: { scale: number }) => callbacks.current.onScale?.(e.scale));
    bus.on("annotationeditormodechanged", (e: { mode: number }) => (modeRef.current = e.mode));
    // From the first stroke, highlight or note, closing must ask before
    // losing it. PDF.js reports a drawing only when it commits it (a tool
    // change), so a pointer released while a tool is on counts already;
    // deletions and the like come as undoable steps.
    bus.on("annotationeditorstateschanged", (e: { details: { hasSomethingToUndo?: boolean } }) => {
      if (e.details.hasSomethingToUndo) callbacks.current.onDirty?.();
    });
    const onPointerUp = () => {
      if (modeRef.current !== AnnotationEditorType.NONE) callbacks.current.onDirty?.();
    };
    container.addEventListener("pointerup", onPointerUp);

    // Ctrl + wheel zooms the document, not the whole window.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (e.deltaY < 0) viewer.increaseScale();
      else viewer.decreaseScale();
    };
    container.addEventListener("wheel", onWheel, { passive: false });

    const task = openPdf(source);
    let cancelled = false;
    task.promise.then(
      (doc) => {
        if (cancelled) return;
        docRef.current = doc;
        viewer.setDocument(doc);
        link.setDocument(doc);
        // The typings declare it null; PDF.js calls it when an annotation changes.
        (doc.annotationStorage as unknown as { onSetModified: () => void }).onSetModified = () =>
          callbacks.current.onDirty?.();
      },
      (err) => {
        if (!cancelled) callbacks.current.onError?.(err);
      },
    );
    return () => {
      cancelled = true;
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("pointerup", onPointerUp);
      viewer.cleanup();
      void task.destroy();
      docRef.current = null;
      viewerRef.current = null;
      busRef.current = null;
    };
    // The document is opened once per source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, readOnly]);

  // The tool, once the pages are there (PDF.js refuses it before).
  useEffect(() => {
    if (!readOnly && ready) void setMode(MODES[tool]);
  }, [tool, readOnly, ready]);

  // Its colour: the pen and notes share it; the highlighter has its own.
  useEffect(() => {
    const bus = busRef.current;
    if (!bus || readOnly || !ready) return;
    const types =
      tool === "highlight"
        ? [AnnotationEditorParamsType.HIGHLIGHT_COLOR]
        : [AnnotationEditorParamsType.INK_COLOR, AnnotationEditorParamsType.FREETEXT_COLOR];
    for (const type of types)
      bus.dispatch("switchannotationeditorparams", { source: null, type, value: color });
  }, [color, tool, readOnly, ready]);

  return (
    <div ref={containerRef} className="eu-pdf absolute inset-0 overflow-auto selectable">
      <div className="pdfViewer" />
    </div>
  );
});
