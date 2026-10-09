import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  AnnotationEditorParamsType,
  AnnotationEditorType,
  AnnotationMode,
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
  /**
   * The document with its annotations written in (pending strokes included),
   * or null when they are what the file already holds.
   */
  save(): Promise<Uint8Array | null>;
  /** After a successful save: what was saved is what the file holds. */
  markSaved(): void;
  zoom(dir: 1 | -1 | 0): void;
  goTo(page: number): void;
  /** Removes the selected drawing, highlight or note. */
  deleteSelected(): void;
};

type Source = { url: string } | { data: Uint8Array };

/** Whether what is shown differs from what the file holds (see `check`). */
type Tracking = {
  /** The annotations' hash in the file: when opened, or at the last save. */
  saved: string;
  /** The hash `save()` wrote, which `markSaved()` makes the file's. */
  saving: string | null;
  /** Strokes or a note PDF.js has not stored yet: it does when the tool changes. */
  pending: boolean;
  /** What `onDirty` last said. */
  dirty: boolean;
  timer: number;
};

const untracked = (): Tracking => ({ saved: "", saving: null, pending: false, dirty: false, timer: 0 });

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
    /** Read-only (an old version): no tools, and its form fields stay as they are. */
    readOnly?: boolean;
    /** The tab is in front. Out of sight, no tool is on (see the tool's effect). */
    active?: boolean;
    onReady?: (doc: PDFDocumentProxy) => void;
    onPage?: (page: number) => void;
    onScale?: (scale: number) => void;
    /** Whether the annotations now differ from what the file holds. */
    onDirty?: (dirty: boolean) => void;
    onError?: (err: unknown) => void;
  }
>(function PdfView(
  { source, tool, color, readOnly, active = true, onReady, onPage, onScale, onDirty, onError },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PDFViewer | null>(null);
  const busRef = useRef<EventBus | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const modeRef = useRef(MODES.select);
  const trackRef = useRef<Tracking>(untracked());
  const checkRef = useRef(() => {});
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
      // Strokes still being drawn are only stored once PDF.js commits them,
      // which it does when the tool changes: pass through « Sélection ».
      const mode = modeRef.current;
      if (mode !== AnnotationEditorType.NONE) await setMode(AnnotationEditorType.NONE);
      try {
        const track = trackRef.current;
        track.saving = doc.annotationStorage.serializable.hash;
        // Nothing new (a click that drew nothing): no copy of the same file.
        if (track.saving === track.saved) return null;
        return await doc.saveDocument();
      } finally {
        if (mode !== AnnotationEditorType.NONE) await setMode(mode);
      }
    },
    markSaved() {
      const track = trackRef.current;
      track.saved = track.saving ?? track.saved;
      track.dirty = false;
      docRef.current?.annotationStorage.resetModified();
      // Drawn while the file was being written: unsaved again.
      checkRef.current();
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
      checkRef.current();
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
      annotationMode: readOnly ? AnnotationMode.ENABLE : AnnotationMode.ENABLE_FORMS,
      annotationEditorMode: readOnly ? AnnotationEditorType.DISABLE : AnnotationEditorType.NONE,
    });
    link.setViewer(viewer);
    viewerRef.current = viewer;
    busRef.current = bus;
    modeRef.current = AnnotationEditorType.NONE;
    const track = untracked();
    trackRef.current = track;

    /**
     * Unsaved: the annotations' hash is not the file's, or strokes await
     * PDF.js's commit. Deleting or undoing back to the file's state is saved
     * again; a click that changed nothing is not unsaved.
     */
    const check = () => {
      window.clearTimeout(track.timer);
      track.timer = window.setTimeout(() => {
        const doc = docRef.current;
        if (!doc || readOnly) return;
        const dirty = track.pending || doc.annotationStorage.serializable.hash !== track.saved;
        if (dirty === track.dirty) return;
        track.dirty = dirty;
        callbacks.current.onDirty?.(dirty);
      }, 150);
    };
    checkRef.current = check;

    bus.on("pagesinit", () => {
      viewer.currentScaleValue = "page-width";
      setReady((n) => n + 1);
      if (docRef.current) callbacks.current.onReady?.(docRef.current);
    });
    bus.on("pagechanging", (e: { pageNumber: number }) => callbacks.current.onPage?.(e.pageNumber));
    bus.on("scalechanging", (e: { scale: number }) => callbacks.current.onScale?.(e.scale));
    bus.on("annotationeditormodechanged", (e: { mode: number }) => {
      modeRef.current = e.mode;
      // Changing tools stores what was drawn: the hash tells from now on.
      track.pending = false;
      check();
    });
    bus.on("editingstateschanged", check);
    // A stroke, a highlight or a note starts with a pointer pressed on a page
    // while a tool is on. PDF.js stores strokes only when the tool changes:
    // until then, they count as unsaved.
    const onPointerDown = (e: PointerEvent) => {
      const onPage = e.target instanceof Element && e.target.closest(".page");
      if (onPage && modeRef.current !== AnnotationEditorType.NONE) track.pending = true;
    };
    container.addEventListener("pointerdown", onPointerDown, true);
    // The end of a stroke or a move, typing in a note or a form, Suppr, Ctrl+Z.
    const events = ["pointerup", "keyup", "input", "focusout"] as const;
    for (const name of events) container.addEventListener(name, check);

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
        track.saved = doc.annotationStorage.serializable.hash;
        // The typings declare it null; PDF.js calls it when an annotation changes.
        (doc.annotationStorage as unknown as { onSetModified: () => void }).onSetModified = check;
      },
      (err) => {
        if (!cancelled) callbacks.current.onError?.(err);
      },
    );
    return () => {
      cancelled = true;
      window.clearTimeout(track.timer);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("pointerdown", onPointerDown, true);
      for (const name of events) container.removeEventListener(name, check);
      // Only setDocument() takes down PDF.js's editor manager, with the
      // keyboard listeners it puts on the whole window: a closed PDF kept
      // taking Backspace, Ctrl+Z… from every other tab.
      viewer.setDocument(null);
      link.setDocument(null);
      void task.destroy();
      docRef.current = null;
      viewerRef.current = null;
      busRef.current = null;
    };
    // The document is opened once per source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, readOnly]);

  // The tool, once the pages are there (PDF.js refuses it before). Out of
  // sight, none: while a tool is on, PDF.js takes Backspace, Ctrl+A, Ctrl+Z…
  // from the whole window, whatever tab is in front.
  useEffect(() => {
    if (!readOnly && ready) void setMode(active ? MODES[tool] : MODES.select);
  }, [tool, readOnly, ready, active]);

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
