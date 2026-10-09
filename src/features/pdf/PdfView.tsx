import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPluginRegistration, type PluginRegistry } from "@embedpdf/core";
import { EmbedPDF, useDocumentState, useRegistry } from "@embedpdf/core/react";
import { ignore, PdfErrorCode, Task, type PdfErrorReason, type Position } from "@embedpdf/models";
import { DocumentManagerPluginPackage, type DocumentManagerPlugin } from "@embedpdf/plugin-document-manager";
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport";
import {
  ViewportElementContext,
  useIsViewportGated,
  useViewportPlugin,
} from "@embedpdf/plugin-viewport/react";
import { ScrollPluginPackage } from "@embedpdf/plugin-scroll";
import { Scroller, useScrollCapability } from "@embedpdf/plugin-scroll/react";
import { RenderPluginPackage } from "@embedpdf/plugin-render";
import { RenderLayer, useRenderCapability } from "@embedpdf/plugin-render/react";
import { TilingPluginPackage } from "@embedpdf/plugin-tiling";
import { TilingLayer } from "@embedpdf/plugin-tiling/react";
import { ZoomMode, ZoomPluginPackage } from "@embedpdf/plugin-zoom";
import { useZoomCapability } from "@embedpdf/plugin-zoom/react";
import { InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager";
import {
  PagePointerProvider,
  useInteractionManagerCapability,
} from "@embedpdf/plugin-interaction-manager/react";
import {
  SelectionLayer,
  SelectionPluginPackage,
  useSelectionCapability,
} from "@embedpdf/plugin-selection/react";
import { HistoryPluginPackage, type HistoryPlugin } from "@embedpdf/plugin-history";
import { LockModeType, type AnnotationCapability, type AnnotationPlugin } from "@embedpdf/plugin-annotation";
import { AnnotationLayer, AnnotationPluginPackage } from "@embedpdf/plugin-annotation/react";
import type { FormCapability, FormPlugin } from "@embedpdf/plugin-form";
import { FormPluginPackage } from "@embedpdf/plugin-form/react";
import { ThumbnailPluginPackage } from "@embedpdf/plugin-thumbnail";
import { ThumbnailsPane } from "@embedpdf/plugin-thumbnail/react";
import { RotatePluginPackage, type RotatePlugin } from "@embedpdf/plugin-rotate";
import { Rotate } from "@embedpdf/plugin-rotate/react";
import { tr } from "../../lib/i18n";
import { touches } from "./eraser";
import { newDocumentId, pdfium, restartPdfium } from "./pdfium";

export type PdfTool =
  "select" | "pen" | "highlight" | "text" | "line" | "arrow" | "rect" | "ellipse" | "eraser";

/**
 * EmbedPDF's tool for each of ours. « select » has none (text and
 * annotations are picked), nor the eraser, which is Euclide's (ERASER).
 */
const TOOLS: Record<PdfTool, string | null> = {
  select: null,
  pen: "ink",
  highlight: "highlight",
  text: "freeText",
  line: "line",
  arrow: "lineArrow",
  rect: "square",
  ellipse: "circle",
  eraser: null,
};
/** The shapes take the pen's colour and width. */
const SHAPES = ["line", "lineArrow", "square", "circle"];
/** The eraser's interaction mode: what it passes over goes (EraserOnPage). */
const ERASER = "eraser";

/** The tools that draw: what they draw becomes an annotation a moment after the pen lifts. */
const DRAWING: PdfTool[] = ["pen"];
/** How long the pen waits for the next stroke of the same word (EmbedPDF's ink tool). */
const STROKE_DELAY = 800;

export type PdfViewHandle = {
  /**
   * The document with its annotations and form fields written in, or null
   * when nothing changed since it was opened or last saved.
   */
  save(): Promise<Uint8Array | null>;
  /** After a successful save: what was saved is what the file holds (`onDirty` says so). */
  markSaved(): void;
  zoom(dir: 1 | -1 | 0): void;
  /** A zoom (1 is 100 %), or the page's width or the whole page in view. */
  zoomTo(level: number | "width" | "page"): void;
  /** Turns the pages a quarter to the right, on screen only. */
  rotate(): void;
  goTo(page: number): void;
  /** Removes the selected drawings, highlights and notes. */
  deleteSelected(): void;
  undo(): void;
  redo(): void;
};

type Props = {
  /** The file's address (`fileUrl`, `versionUrl`). */
  url: string;
  tool: PdfTool;
  color: string;
  /** The pen's width, in points. */
  size?: number;
  /** Read-only (an old version): annotations drawn into the pages, no tools, no form editing. */
  readOnly?: boolean;
  /** Written as the author of new annotations. */
  author?: string;
  /** The pages, small, beside the document. */
  showPages?: boolean;
  /** The tab is in front: its keys (Ctrl+Z, Suppr, Ctrl+C…) are the document's. */
  active?: boolean;
  onReady?: (info: { pages: number }) => void;
  onPage?: (page: number) => void;
  onScale?: (scale: number) => void;
  /** Whether the document now differs from what the file holds. */
  onDirty?: (dirty: boolean) => void;
  /** Whether there is something to undo or redo. */
  onHistory?: (state: { canUndo: boolean; canRedo: boolean }) => void;
  onError?: (err: unknown) => void;
};

/** Zoom steps of the buttons, the keys and the wheel, as a browser's. */
const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

function nextZoom(current: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOMS.find((z) => z > current + 0.005) ?? ZOOMS[ZOOMS.length - 1];
  return ZOOMS.filter((z) => z < current - 0.005).pop() ?? ZOOMS[0];
}

/**
 * Whether the document differs from the file: the history's current step is
 * not the one it was on when the file was opened or last saved. Undoing back
 * to that step is saved again. Reads the history plugin's timeline, which
 * its capability does not expose; without it, any change counts.
 */
type Timeline = { globalTimeline: unknown[]; globalIndex: number };

function historyStep(registry: PluginRegistry | null, documentId: string): unknown {
  const plugin = registry?.getPlugin("history") as { documentHistories?: Map<string, Timeline> } | null;
  const timeline = plugin?.documentHistories?.get(documentId);
  if (!timeline) return undefined;
  return timeline.globalIndex >= 0 ? timeline.globalTimeline[timeline.globalIndex] : null;
}

/**
 * EmbedPDF's form plugin writes a field on every key typed, each write in
 * steps that run side by side with the others: the last to finish wins, and
 * a quick typist could save « More » for « Moreau ». Here the writes go one
 * at a time, and a value overtaken by a newer one for the same field is
 * skipped. Gives a promise for when the writes waiting have all been done.
 */
type FieldWrite = (
  pageIndex: number,
  widget: { id: string },
  field: unknown,
  documentId?: string,
) => Task<boolean, PdfErrorReason>;

function queueFormWrites(registry: PluginRegistry): () => Promise<void> {
  const plugin = registry.getPlugin("form") as { setFormFieldValues?: FieldWrite } | null;
  const write = plugin?.setFormFieldValues?.bind(plugin);
  if (!plugin || !write) return () => Promise.resolve();
  let queue = Promise.resolve();
  const latest = new Map<string, unknown>();
  plugin.setFormFieldValues = (pageIndex, widget, field, documentId) => {
    latest.set(widget.id, field);
    const result = new Task<boolean, PdfErrorReason>();
    queue = queue.then(() => {
      if (latest.get(widget.id) !== field) return result.resolve(true);
      return new Promise<void>((done) =>
        write(pageIndex, widget, field, documentId).wait(
          (ok) => {
            result.resolve(ok);
            done();
          },
          (err) => {
            result.fail(err);
            done();
          },
        ),
      );
    });
    return result;
  };
  return () => queue;
}

/** What is selected on a page, in the app's accent. */
const OUTLINE = { color: "var(--color-accent)", style: "solid", width: 1.5, offset: 2 } as const;
const HANDLES = { color: "var(--color-accent)", size: 10 };

/** Text a key types into: the key is the field's, not the document's. */
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * A PDF, drawn by PDFium (pdfium.ts) through EmbedPDF's viewer: pages are
 * pictures laid out as they scroll into view, sharp tiles over them at the
 * zoom shown. Pen, highlighter, text notes and form fields are written into
 * the file when it is saved.
 */
export const PdfView = forwardRef<PdfViewHandle, Props>(function PdfView(props, ref) {
  const { url, readOnly = false, author = "" } = props;
  const [documentId] = useState(() => newDocumentId());
  /** The file's bytes, handed to PDFium once its viewer is up, then let go. */
  const bytesRef = useRef<ArrayBuffer | null>(null);
  /** When the form fields typed in are all written (queueFormWrites). */
  const formsWritten = useRef<() => Promise<void>>(() => Promise.resolve());
  const [fetched, setFetched] = useState(false);
  const onError = useRef(props.onError);
  useEffect(() => {
    onError.current = props.onError;
  });

  // Read here rather than by PDFium, which would take a missing file's
  // error page for a damaged PDF.
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.text()) || `${res.status} ${res.statusText}`);
        return res.arrayBuffer();
      })
      .then(
        (buffer) => {
          if (cancelled) return;
          bytesRef.current = buffer;
          setFetched(true);
        },
        (err) => {
          if (!cancelled) onError.current?.(err);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [url]);

  const plugins = useMemo(
    () => [
      createPluginRegistration(DocumentManagerPluginPackage, { maxDocuments: 1 }),
      createPluginRegistration(ViewportPluginPackage, { viewportGap: 16 }),
      createPluginRegistration(ScrollPluginPackage, { defaultPageGap: 16 }),
      // Read-only: annotations and fields are part of the picture.
      createPluginRegistration(RenderPluginPackage, { withAnnotations: readOnly, withForms: readOnly }),
      createPluginRegistration(TilingPluginPackage, { tileSize: 768, overlapPx: 2.5, extraRings: 0 }),
      createPluginRegistration(ZoomPluginPackage, {
        defaultZoomLevel: ZoomMode.FitWidth,
        minZoom: ZOOMS[0],
        maxZoom: ZOOMS[ZOOMS.length - 1],
      }),
      createPluginRegistration(InteractionManagerPluginPackage),
      createPluginRegistration(SelectionPluginPackage, { marquee: { enabled: !readOnly } }),
      createPluginRegistration(ThumbnailPluginPackage, { width: 120, gap: 8, labelHeight: 22, paddingY: 8 }),
      createPluginRegistration(RotatePluginPackage),
      ...(readOnly
        ? []
        : [
            createPluginRegistration(HistoryPluginPackage),
            createPluginRegistration(AnnotationPluginPackage, {
              annotationAuthor: author,
              selectAfterCreate: false,
              // A link is followed and a form field filled in, neither edited
              // (EmbedPDF's "locked" mode for them).
              locked: { type: LockModeType.Include, categories: ["link", "form"] },
              tools: [
                // While the pen or the highlighter is on, what the page
                // already holds (a link, a note) stays out of its way.
                // No turning handle: a stroke or a note is moved and resized.
                {
                  id: "ink",
                  defaults: { strokeWidth: 2 },
                  interaction: { exclusive: true, isRotatable: false },
                },
                { id: "highlight", interaction: { exclusive: true } },
                {
                  id: "freeText",
                  defaults: { contents: "", fontSize: 14 },
                  interaction: { exclusive: false, isRotatable: false },
                  clickBehavior: {
                    enabled: true,
                    defaultSize: { width: 160, height: 24 },
                    defaultContent: "",
                  },
                },
                // A shape is drawn by dragging: a click alone draws nothing.
                ...["line", "lineArrow"].map((id) => ({
                  id,
                  interaction: { exclusive: true, isRotatable: false },
                  clickBehavior: { enabled: false, defaultLength: 100 },
                })),
                ...["square", "circle"].map((id) => ({
                  id,
                  interaction: { exclusive: true, isRotatable: false },
                  clickBehavior: { enabled: false, defaultSize: { width: 100, height: 100 } },
                })),
                { id: "link", categories: ["link"] },
              ],
            }),
            createPluginRegistration(FormPluginPackage),
          ]),
    ],
    // One viewer per document: the author is the one when it opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readOnly],
  );

  /** PDFium has its viewer: the document goes in. */
  const open = (registry: PluginRegistry) => {
    const buffer = bytesRef.current;
    const manager = registry.getPlugin<DocumentManagerPlugin>("document-manager")?.provides();
    if (!buffer || !manager) return;
    formsWritten.current = queueFormWrites(registry);
    manager.openDocumentBuffer({ buffer, name: "document.pdf", documentId });
  };

  if (!fetched) return null;
  return (
    <EmbedPDF engine={pdfium()} plugins={plugins} onInitialized={async (registry) => open(registry)}>
      <Viewer
        {...props}
        documentId={documentId}
        handleRef={ref}
        onOpened={() => (bytesRef.current = null)}
        formsWritten={() => formsWritten.current()}
      />
    </EmbedPDF>
  );
});

function Viewer({
  documentId,
  handleRef,
  onOpened,
  formsWritten,
  tool,
  color,
  size = 2,
  readOnly = false,
  showPages = false,
  active = true,
  ...callbacks
}: Props & {
  documentId: string;
  handleRef: React.ForwardedRef<PdfViewHandle>;
  onOpened: () => void;
  formsWritten: () => Promise<void>;
}) {
  const { registry } = useRegistry();
  const state = useDocumentState(documentId);
  const { provides: scroll } = useScrollCapability();
  const { provides: zoom } = useZoomCapability();
  // Not there for an old version (read-only): EmbedPDF's hooks would throw.
  const annotations = useMemo(
    () => registry?.getPlugin<AnnotationPlugin>("annotation")?.provides() ?? null,
    [registry],
  );
  const history = useMemo(
    () => registry?.getPlugin<HistoryPlugin>("history")?.provides() ?? null,
    [registry],
  );
  const forms = useMemo(() => registry?.getPlugin<FormPlugin>("form")?.provides() ?? null, [registry]);
  const { provides: selection } = useSelectionCapability();
  const { provides: interaction } = useInteractionManagerCapability();
  const events = useRef(callbacks);
  useEffect(() => {
    events.current = callbacks;
  });
  const status = state?.status;
  const loaded = status === "loaded";
  const pageCount = state?.document?.pageCount ?? 0;

  const viewer = useRef<HTMLDivElement>(null);
  /**
   * Unsaved changes: the history's step at the last save (`saved`), any
   * change at all where the history cannot tell (`changed`), and a stroke
   * not yet an annotation (`strokeEnd`: when the pen lifted, or later while
   * it draws).
   */
  const track = useRef({
    saved: null as unknown,
    saving: null as unknown,
    changed: false,
    dirty: false,
    strokeEnd: 0,
    timer: 0,
  });

  const check = () => {
    const t = track.current;
    if (readOnly) return;
    const step = historyStep(registry, documentId);
    const drawing = Date.now() < t.strokeEnd + STROKE_DELAY + 200;
    const dirty = drawing || (step === undefined ? t.changed : step !== t.saved);
    if (dirty === t.dirty) return;
    t.dirty = dirty;
    events.current.onDirty?.(dirty);
  };

  useEffect(() => {
    if (status === "loaded") {
      onOpened();
      events.current.onReady?.({ pages: pageCount });
    } else if (status === "error") {
      onOpened();
      if (state?.errorCode === PdfErrorCode.Initialization) restartPdfium();
      events.current.onError?.(
        new Error(
          state?.errorCode === PdfErrorCode.Password ? tr("pdf.passwordProtected") : (state?.error ?? ""),
        ),
      );
    }
    // Once per outcome.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (!scroll) return;
    return scroll.onPageChange((e) => {
      if (e.documentId === documentId) events.current.onPage?.(e.pageNumber);
    });
  }, [scroll, documentId]);

  useEffect(() => {
    if (!zoom) return;
    return zoom.onStateChange((e) => {
      if (e.documentId === documentId) events.current.onScale?.(e.state.currentZoomLevel);
    });
  }, [zoom, documentId]);

  useEffect(() => {
    if (!history) return;
    return history.onHistoryChange((e) => {
      if (e.documentId !== documentId) return;
      track.current.changed = true;
      check();
      events.current.onHistory?.(history.forDocument(documentId).getHistoryState().global);
    });
    // check reads the latest track; the subscription is per history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, registry, documentId]);

  useEffect(() => {
    interaction?.registerMode({ id: ERASER, scope: "page", exclusive: true, cursor: "crosshair" });
  }, [interaction]);

  // The tool, once the document is there. The eraser is a mode of the
  // pointer, the others EmbedPDF's tools.
  useEffect(() => {
    if (!annotations || !interaction || !loaded || readOnly) return;
    annotations.forDocument(documentId).setActiveTool(TOOLS[tool]);
    const modes = interaction.forDocument(documentId);
    if (tool === "eraser") modes.activate(ERASER);
    else if (tool === "select") modes.activateDefaultMode();
  }, [annotations, interaction, loaded, readOnly, tool, documentId]);

  // Its colour: the pen and notes share it; the highlighter has its own.
  useEffect(() => {
    if (!annotations || readOnly) return;
    if (tool === "highlight") annotations.setToolDefaults("highlight", { strokeColor: color, color });
    else {
      annotations.setToolDefaults("ink", { strokeColor: color, color, strokeWidth: size });
      annotations.setToolDefaults("freeText", { fontColor: color });
      for (const shape of SHAPES)
        annotations.setToolDefaults(shape, { strokeColor: color, strokeWidth: size });
    }
  }, [annotations, readOnly, tool, color, size]);

  const deleteSelected = () => {
    const scope = annotations?.forDocument(documentId);
    const selected = scope?.getSelectedAnnotations() ?? [];
    if (!scope || !selected.length) return;
    scope.deleteAnnotations(selected.map((a) => ({ pageIndex: a.object.pageIndex, id: a.object.id })));
  };

  useImperativeHandle(handleRef, () => ({
    async save() {
      const doc = state?.document;
      if (!doc || readOnly) throw new Error(tr("pdf.notReady"));
      // A field being typed in keeps its text until it loses the focus.
      if (document.activeElement instanceof HTMLElement && viewer.current?.contains(document.activeElement))
        document.activeElement.blur();
      // A stroke just drawn becomes an annotation a moment after the pen lifts.
      const wait = Math.min(STROKE_DELAY + 100, track.current.strokeEnd + STROKE_DELAY + 100 - Date.now());
      if (wait > 0) await new Promise((r) => window.setTimeout(r, wait));
      await formsWritten();
      const t = track.current;
      t.saving = historyStep(registry, documentId);
      if (t.saving !== undefined && t.saving === t.saved) return null;
      if (annotations) await annotations.forDocument(documentId).commit().toPromise();
      const bytes = await pdfium().saveAsCopy(doc).toPromise();
      return new Uint8Array(bytes);
    },
    markSaved() {
      const t = track.current;
      t.saved = t.saving;
      t.changed = false;
      // Says saved, unless something was drawn while the file was being written.
      t.dirty = true;
      check();
    },
    zoom(dir) {
      const scope = zoom?.forDocument(documentId);
      if (!scope) return;
      if (dir === 0) scope.requestZoom(ZoomMode.FitWidth);
      else scope.requestZoom(nextZoom(scope.getState().currentZoomLevel, dir));
    },
    zoomTo(level) {
      zoom
        ?.forDocument(documentId)
        .requestZoom(level === "width" ? ZoomMode.FitWidth : level === "page" ? ZoomMode.FitPage : level);
    },
    rotate() {
      registry?.getPlugin<RotatePlugin>("rotate")?.provides().forDocument(documentId).rotateForward();
    },
    undo() {
      history?.forDocument(documentId).undo();
    },
    redo() {
      history?.forDocument(documentId).redo();
    },
    goTo(page) {
      scroll?.forDocument(documentId).scrollToPage({ pageNumber: page, behavior: "instant" });
    },
    deleteSelected,
  }));

  // A stroke starts with the pen pressed on a page: unsaved from then on.
  const onPointerDown = (e: React.PointerEvent) => {
    if (!isTyping(e.target)) viewer.current?.focus({ preventScroll: true });
    if (!readOnly && DRAWING.includes(tool) && (e.target as Element).closest?.("[data-page]")) {
      track.current.strokeEnd = Date.now() + 60_000;
      check();
    }
  };
  const onPointerUp = () => {
    const t = track.current;
    if (t.strokeEnd <= Date.now()) return;
    t.strokeEnd = Date.now();
    window.clearTimeout(t.timer);
    // Once the stroke is an annotation (or nothing was drawn), the history tells.
    t.timer = window.setTimeout(check, STROKE_DELAY + 250);
  };

  // Keys, while this document is the tab in front (not while typing in a
  // field or a note): Ctrl+Z / Ctrl+Y undo and redo, Suppr removes the
  // selected annotations, Ctrl+C copies the selected text, Échap lets go.
  useEffect(() => {
    if (!active || !loaded) return;
    const down = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.altKey) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const text = selection?.forDocument(documentId);
      if (mod && key === "c") {
        if (!text?.getFormattedSelection().length) return;
        text.copyToClipboard();
      } else if (!readOnly && !mod && (e.key === "Delete" || e.key === "Backspace")) {
        if (!annotations?.forDocument(documentId).getSelectedAnnotations().length) return;
        deleteSelected();
      } else if (!readOnly && mod && (key === "z" || key === "y")) {
        if (key === "y" || e.shiftKey) history?.forDocument(documentId).redo();
        else history?.forDocument(documentId).undo();
      } else if (e.key === "Escape") {
        annotations?.forDocument(documentId).deselectAnnotation();
        text?.clear();
        return;
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  });

  if (!loaded) return null;
  return (
    <div className="absolute inset-0 flex">
      {showPages && <PagesPanel documentId={documentId} annotations={annotations} forms={forms} />}
      <div className="flex-1 min-w-0 relative">
        <PdfViewport
          documentId={documentId}
          elementRef={viewer}
          className="eu-pdf absolute inset-0"
          onPointerDownCapture={onPointerDown}
          onPointerUpCapture={onPointerUp}
        >
          <Scroller
            documentId={documentId}
            renderPage={({ pageIndex, width, height, rotatedWidth, rotatedHeight }) => (
              // The sheet stays upright; what is on it turns with the view (Rotate).
              <div
                className="eu-pdf-page relative"
                data-page={pageIndex + 1}
                style={{ width: rotatedWidth, height: rotatedHeight }}
              >
                <Rotate documentId={documentId} pageIndex={pageIndex}>
                  <PagePointerProvider
                    documentId={documentId}
                    pageIndex={pageIndex}
                    style={{ width, height }}
                  >
                    {/* The whole page, small and quick; sharp tiles over it. A
                        press goes through them to the page (EmbedPDF's tools). */}
                    <RenderLayer
                      documentId={documentId}
                      pageIndex={pageIndex}
                      scale={1}
                      draggable={false}
                      style={{ position: "absolute", inset: 0, width, height, pointerEvents: "none" }}
                    />
                    <TilingLayer
                      documentId={documentId}
                      pageIndex={pageIndex}
                      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                    />
                    <SelectionLayer
                      documentId={documentId}
                      pageIndex={pageIndex}
                      background="var(--color-pdf-selection)"
                    />
                    {!readOnly && (
                      <EraserOnPage documentId={documentId} pageIndex={pageIndex} annotations={annotations} />
                    )}
                    {!readOnly && (
                      <AnnotationLayer
                        documentId={documentId}
                        pageIndex={pageIndex}
                        selectionOutline={OUTLINE}
                        resizeUI={HANDLES}
                        vertexUI={HANDLES}
                      />
                    )}
                  </PagePointerProvider>
                </Rotate>
              </div>
            )}
          />
        </PdfViewport>
      </div>
    </div>
  );
}

/**
 * The viewer's scrolling box, as EmbedPDF's `Viewport` with one difference:
 * a tab out of sight (display: none) measures 0 × 0, and that is not passed
 * on. The plugins would lay out the pages for no room at all and the first
 * ones would be drawn again when the tab comes back.
 */
function PdfViewport({
  documentId,
  elementRef,
  className,
  children,
  ...handlers
}: {
  documentId: string;
  elementRef: React.RefObject<HTMLDivElement | null>;
  className: string;
  children: ReactNode;
} & Pick<React.HTMLAttributes<HTMLDivElement>, "onPointerDownCapture" | "onPointerUpCapture">) {
  const { plugin } = useViewportPlugin();
  const gated = useIsViewportGated(documentId);
  const gap = plugin?.provides().getViewportGap() ?? 0;
  const { provides: zoom } = useZoomCapability();

  useLayoutEffect(() => {
    const el = elementRef.current;
    if (!plugin || !el) return;
    plugin.registerViewport(documentId);
    const onScroll = () =>
      plugin.setViewportScrollMetrics(documentId, { scrollTop: el.scrollTop, scrollLeft: el.scrollLeft });
    el.addEventListener("scroll", onScroll);
    const observer = new ResizeObserver(() => {
      if (!el.clientWidth || !el.clientHeight) return;
      plugin.setViewportResizeMetrics(documentId, {
        width: el.offsetWidth,
        height: el.offsetHeight,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
        scrollTop: el.scrollTop,
        scrollLeft: el.scrollLeft,
        scrollWidth: el.scrollWidth,
        scrollHeight: el.scrollHeight,
        clientLeft: el.clientLeft,
        clientTop: el.clientTop,
      });
    });
    observer.observe(el);
    const stopRequests = plugin.onScrollRequest(documentId, ({ x, y, behavior = "auto" }) => {
      requestAnimationFrame(() => el.scrollTo({ left: x, top: y, behavior }));
    });
    return () => {
      plugin.unregisterViewport(documentId);
      observer.disconnect();
      el.removeEventListener("scroll", onScroll);
      stopRequests();
    };
  }, [plugin, documentId, elementRef]);

  // Ctrl + wheel zooms the document, not the whole window: a step per notch
  // of a mouse wheel, around the pointer.
  useEffect(() => {
    const el = elementRef.current;
    if (!el || !zoom) return;
    let pending = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      pending += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
      if (Math.abs(pending) < 50) return;
      const dir = pending < 0 ? 1 : -1;
      pending = 0;
      const scope = zoom.forDocument(documentId);
      const box = el.getBoundingClientRect();
      scope.requestZoom(nextZoom(scope.getState().currentZoomLevel, dir), {
        vx: e.clientX - box.left - el.clientLeft,
        vy: e.clientY - box.top - el.clientTop,
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, documentId, elementRef]);

  return (
    // The zoom plugin's gestures read the element; nothing writes it through the context.
    <ViewportElementContext.Provider value={elementRef as React.RefObject<HTMLDivElement>}>
      <div
        ref={elementRef}
        tabIndex={-1}
        className={className}
        style={{ overflow: "auto", padding: gap }}
        {...handlers}
      >
        {!gated && children}
      </div>
    </ViewportElementContext.Provider>
  );
}

/**
 * The pages as small pictures, drawn as they scroll into view, with their
 * annotations and filled fields; a page is drawn again once a change on it
 * is in the document.
 */
function PagesPanel({
  documentId,
  annotations,
  forms,
}: {
  documentId: string;
  annotations: AnnotationCapability | null;
  forms: FormCapability | null;
}) {
  const { provides: scroll } = useScrollCapability();
  const [current, setCurrent] = useState(() => scroll?.forDocument(documentId).getCurrentPage() ?? 1);
  const [drawn, setDrawn] = useState<Record<number, number>>({});
  useEffect(() => {
    if (!scroll) return;
    return scroll.onPageChange((e) => {
      if (e.documentId === documentId) setCurrent(e.pageNumber);
    });
  }, [scroll, documentId]);
  useEffect(() => {
    const again = (page: number) => setDrawn((d) => ({ ...d, [page]: (d[page] ?? 0) + 1 }));
    const stops = [
      annotations?.onAnnotationEvent((e) => {
        if (e.documentId === documentId && e.type !== "loaded" && e.committed) again(e.pageIndex);
      }),
      forms?.onFieldValueChange((e) => {
        if (e.documentId === documentId) again(e.pageIndex);
      }),
    ];
    return () => stops.forEach((stop) => stop?.());
  }, [annotations, forms, documentId]);
  return (
    <ThumbnailsPane
      documentId={documentId}
      className="w-40 shrink-0 border-r border-stage-line bg-stage-alt"
      aria-label={tr("pdf.pages")}
    >
      {(meta) => {
        const n = meta.pageIndex + 1;
        return (
          <button
            key={meta.pageIndex}
            type="button"
            onClick={() =>
              scroll?.forDocument(documentId).scrollToPage({ pageNumber: n, behavior: "instant" })
            }
            aria-current={n === current ? "page" : undefined}
            aria-label={tr("pdf.pageN", { n })}
            className={`eu-pdf-thumb absolute inset-x-0 mx-auto ${n === current ? "eu-pdf-thumb-current" : ""}`}
            style={{ top: meta.top, height: meta.wrapperHeight, width: meta.width + 4 }}
          >
            <span className="block bg-paper" style={{ width: meta.width, height: meta.height }}>
              <PageThumb
                documentId={documentId}
                pageIndex={meta.pageIndex}
                width={meta.width}
                drawn={drawn[meta.pageIndex] ?? 0}
              />
            </span>
            <span
              className="block text-center font-mono text-caption text-stage-muted"
              style={{ height: meta.labelHeight }}
            >
              {n}
            </span>
          </button>
        );
      }}
    </ThumbnailsPane>
  );
}

/**
 * The eraser on one page: a stroke, a shape, a highlight or a note it
 * passes over goes (each one an undo step). Reaches 6 pixels around the
 * pointer, whatever the zoom.
 */
function EraserOnPage({
  documentId,
  pageIndex,
  annotations,
}: {
  documentId: string;
  pageIndex: number;
  annotations: AnnotationCapability | null;
}) {
  const { provides: interaction } = useInteractionManagerCapability();
  const scale = useDocumentState(documentId)?.scale ?? 1;
  useEffect(() => {
    if (!interaction || !annotations) return;
    const scope = annotations.forDocument(documentId);
    let erasing = false;
    const gone = new Set<string>();
    const erase = (at: Position) => {
      for (const { object } of scope.getAnnotations({ pageIndex })) {
        if (gone.has(object.id) || !touches(object, at, 6 / scale)) continue;
        gone.add(object.id);
        scope.deleteAnnotation(pageIndex, object.id);
      }
    };
    return interaction.registerHandlers({
      documentId,
      modeId: ERASER,
      pageIndex,
      handlers: {
        onPointerDown: (at, e) => {
          erasing = true;
          gone.clear();
          e.setPointerCapture?.();
          erase(at);
        },
        onPointerMove: (at) => {
          if (erasing) erase(at);
        },
        onPointerUp: (_, e) => {
          erasing = false;
          e.releasePointerCapture?.();
        },
        onPointerCancel: () => {
          erasing = false;
        },
      },
    });
  }, [interaction, annotations, documentId, pageIndex, scale]);
  return null;
}

/** A page, `width` pixels wide, as the file would print it; `drawn` draws it again. */
function PageThumb({
  documentId,
  pageIndex,
  width,
  drawn,
}: {
  documentId: string;
  pageIndex: number;
  width: number;
  drawn: number;
}) {
  const { provides: render } = useRenderCapability();
  const page = useDocumentState(documentId)?.document?.pages[pageIndex];
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!render || !page) return;
    let made: string | null = null;
    const task = render.forDocument(documentId).renderPageRect({
      pageIndex,
      rect: { origin: { x: 0, y: 0 }, size: page.size },
      options: {
        scaleFactor: width / page.size.width,
        dpr: window.devicePixelRatio,
        rotation: page.rotation,
        withAnnotations: true,
        withForms: true,
      },
    });
    task.wait((blob) => {
      made = URL.createObjectURL(blob);
      setUrl(made);
    }, ignore);
    return () => {
      if (made) URL.revokeObjectURL(made);
      else task.abort({ code: PdfErrorCode.Cancelled, message: "page out of the list" });
    };
  }, [render, documentId, pageIndex, page, width, drawn]);
  return url ? <img src={url} alt="" draggable={false} className="block" /> : null;
}
