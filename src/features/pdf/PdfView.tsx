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
import {
  ignore,
  PdfActionType,
  PdfAnnotationSubtype,
  PdfErrorCode,
  PdfPageFlattenFlag,
  PdfZoomMode,
  restorePosition,
  Task,
  transformSize,
  type Rotation,
  type PdfBookmarkObject,
  type PdfErrorReason,
  type PdfLinkTarget,
  type PdfPageObject,
  type Position,
} from "@embedpdf/models";
import { DocumentManagerPluginPackage, type DocumentManagerPlugin } from "@embedpdf/plugin-document-manager";
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport";
import {
  ViewportElementContext,
  useIsViewportGated,
  useViewportPlugin,
} from "@embedpdf/plugin-viewport/react";
import { ScrollPluginPackage } from "@embedpdf/plugin-scroll";
import { Scroller, useScrollCapability, type ScrollScope } from "@embedpdf/plugin-scroll/react";
import { RenderPluginPackage } from "@embedpdf/plugin-render";
import { RenderLayer, useRenderCapability } from "@embedpdf/plugin-render/react";
import { TilingPluginPackage } from "@embedpdf/plugin-tiling";
import { TilingLayer } from "@embedpdf/plugin-tiling/react";
import { ZoomMode, ZoomPluginPackage, type ZoomLevel } from "@embedpdf/plugin-zoom";
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
import { SearchPluginPackage } from "@embedpdf/plugin-search";
import { SearchLayer, useSearchCapability } from "@embedpdf/plugin-search/react";
import { BookmarkPluginPackage } from "@embedpdf/plugin-bookmark";
import { useBookmarkCapability } from "@embedpdf/plugin-bookmark/react";
import { RotatePluginPackage, type RotatePlugin } from "@embedpdf/plugin-rotate";
import { Rotate } from "@embedpdf/plugin-rotate/react";
import { tr } from "../../lib/i18n";
import { touches } from "./eraser";
import { onText } from "./marker";
import { FreshNotes, freeTextNote } from "./FreeTextNote";
import { newDocumentId, pdfium, restartPdfium } from "./pdfium";

export type PdfTool =
  | "select"
  | "pen"
  | "highlight"
  | "underline"
  | "strikeout"
  | "marker"
  | "text"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "eraser";

/**
 * EmbedPDF's tool for each of ours. « select » has none (text and
 * annotations are picked), nor the eraser, which is Euclide's (ERASER).
 */
const TOOLS: Record<PdfTool, string | null> = {
  select: null,
  pen: "ink",
  highlight: "highlight",
  underline: "underline",
  strikeout: "strikeout",
  marker: "inkHighlighter",
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
const DRAWING: PdfTool[] = ["pen", "marker"];
/** Tools on the highlighter's palette (light colours, the text shows through). */
const MARKERS: PdfTool[] = ["highlight", "marker"];
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
  /** Brings a page into view: its top, or (`centered`) its middle in the middle. */
  goTo(page: number, centered?: boolean): void;
  /** Removes the selected drawings, highlights and notes. */
  deleteSelected(): void;
  undo(): void;
  redo(): void;
  /** Looks for text in the whole document; the matches are marked, the first shown. */
  find(query: string): void;
  findNext(): void;
  findPrevious(): void;
  /** No more search: the marks go. */
  stopFind(): void;
  /**
   * Every page as a picture for paper, as it shows on screen: what is drawn
   * on it and the fields filled in. The caller lets go of the pictures
   * (`URL.revokeObjectURL`).
   */
  printPages(progress?: (done: number, total: number) => void): Promise<PrintPage[]>;
  /**
   * A copy with the annotations and the fields filled in made part of the
   * pages, as on paper: the same in any reader, nothing left to move. The
   * document shown does not change.
   */
  flatCopy(): Promise<Uint8Array>;
  /** The document as it is now, with what is not saved yet: for a change to its pages. */
  documentBytes(): Promise<Uint8Array>;
};

/** A page ready to print: its picture, and whether it lies wider than tall. */
export type PrintPage = { url: string; wide: boolean };

/** Pictures for paper: sharp at 200 dpi, a large page kept to a few million pixels. */
const PRINT_DPI = 200;
const PRINT_MAX_PX = 2400;

/** Where a search is: its text, the matches found so far, the one shown (0 for none). */
export type FindState = { query: string; total: number; current: number; searching: boolean };

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
  /**
   * Presented (Presentation.tsx): the whole page in view and no scrolling,
   * the pages turned by `goTo`; the zoom before comes back after.
   */
  presenting?: boolean;
  /** The page to open at (the one just changed), once the pages are laid out. */
  startPage?: number;
  onReady?: (info: { pages: number }) => void;
  onPage?: (page: number) => void;
  onScale?: (scale: number) => void;
  /** Whether the document now differs from what the file holds. */
  onDirty?: (dirty: boolean) => void;
  /** Whether there is something to undo or redo. */
  onHistory?: (state: { canUndo: boolean; canRedo: boolean }) => void;
  onFind?: (state: FindState) => void;
  /** The document waits for its password, asked in the viewer's place. */
  onLocked?: (locked: boolean) => void;
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

/** Euclide's text notes in EmbedPDF's place (FreeTextNote.tsx). */
const RENDERERS = [freeTextNote];

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
      createPluginRegistration(SearchPluginPackage, { showAllResults: true }),
      createPluginRegistration(BookmarkPluginPackage),
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
                { id: "underline", interaction: { exclusive: true } },
                { id: "strikeout", interaction: { exclusive: true } },
                { id: "inkHighlighter", interaction: { exclusive: true, isRotatable: false } },
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
  presenting = false,
  startPage = 0,
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
  const { provides: search } = useSearchCapability();
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

  /** Opened only with its password: asked for, then tried (EmbedPDF kept the bytes). */
  const locked = status === "error" && state?.errorCode === PdfErrorCode.Password;
  /** A password was tried: if the document comes back locked, it was wrong. */
  const [tried, setTried] = useState(false);
  const unlock = (password: string) => {
    setTried(true);
    registry
      ?.getPlugin<DocumentManagerPlugin>("document-manager")
      ?.provides()
      .retryDocument(documentId, { password });
  };

  useEffect(() => {
    events.current.onLocked?.(locked);
    if (status === "loaded") {
      onOpened();
      events.current.onReady?.({ pages: pageCount });
    } else if (status === "error" && !locked) {
      onOpened();
      if (state?.errorCode === PdfErrorCode.Initialization) restartPdfium();
      events.current.onError?.(new Error(state?.error ?? ""));
    }
    // Once per outcome.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, locked]);

  useEffect(() => {
    if (!scroll) return;
    return scroll.onPageChange((e) => {
      if (e.documentId === documentId) events.current.onPage?.(e.pageNumber);
    });
  }, [scroll, documentId]);

  // Opened at a given page, once the pages first have their places.
  useEffect(() => {
    if (!scroll || startPage < 2) return;
    return scroll.onLayoutReady((e) => {
      if (e.documentId !== documentId || !e.isInitial) return;
      scroll
        .forDocument(documentId)
        .scrollToPage({ pageNumber: Math.min(startPage, e.totalPages), behavior: "instant" });
    });
  }, [scroll, documentId, startPage]);

  useEffect(() => {
    if (!zoom) return;
    return zoom.onStateChange((e) => {
      if (e.documentId === documentId) events.current.onScale?.(e.state.currentZoomLevel);
    });
  }, [zoom, documentId]);

  // Presented: the whole page in view, kept fitted as the window goes full
  // screen; afterwards, the zoom from before (a fit stays a fit).
  const zoomBefore = useRef<ZoomLevel | null>(null);
  useEffect(() => {
    const scope = zoom?.forDocument(documentId);
    if (!scope || !loaded) return;
    if (presenting) {
      zoomBefore.current = scope.getState().zoomLevel;
      scope.requestZoom(ZoomMode.FitPage);
    } else if (zoomBefore.current !== null) {
      scope.requestZoom(zoomBefore.current);
      zoomBefore.current = null;
    }
  }, [presenting, zoom, documentId, loaded]);

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

  // A search: where it is, and its match in view (EmbedPDF marks them only).
  useEffect(() => {
    if (!search || !scroll) return;
    const scope = search.forDocument(documentId);
    const stops = [
      scope.onStateChange((st) =>
        events.current.onFind?.({
          query: st.query,
          total: Math.max(st.total, st.results.length),
          current: st.activeResultIndex + 1,
          searching: st.loading,
        }),
      ),
      scope.onActiveResultChange((index) => {
        const hit = scope.getState().results[index];
        const at = hit?.rects[0];
        if (!hit || !at) return;
        scroll.forDocument(documentId).scrollToPage({
          pageNumber: hit.pageIndex + 1,
          pageCoordinates: { x: at.origin.x, y: at.origin.y },
          alignY: 30,
          behavior: "instant",
        });
      }),
    ];
    return () => stops.forEach((stop) => stop());
  }, [search, scroll, documentId]);

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
    if (MARKERS.includes(tool)) {
      annotations.setToolDefaults("highlight", { strokeColor: color, color });
      annotations.setToolDefaults("inkHighlighter", { strokeColor: color, color });
    } else {
      annotations.setToolDefaults("underline", { strokeColor: color, color });
      annotations.setToolDefaults("strikeout", { strokeColor: color, color });
      annotations.setToolDefaults("ink", { strokeColor: color, color, strokeWidth: size });
      annotations.setToolDefaults("freeText", { fontColor: color });
      for (const shape of SHAPES)
        annotations.setToolDefaults(shape, { strokeColor: color, strokeWidth: size });
    }
  }, [annotations, readOnly, tool, color, size]);

  // Text notes written since the document opened (FreeTextNote.tsx).
  const [fresh] = useState(() => new Set<string>());
  useEffect(() => {
    if (!annotations) return;
    return annotations.onAnnotationEvent((e) => {
      if (e.documentId !== documentId || e.type !== "create" || e.committed) return;
      if (e.annotation.type === PdfAnnotationSubtype.FREETEXT) fresh.add(e.annotation.id);
    });
  }, [annotations, documentId, fresh]);

  const deleteSelected = () => {
    const scope = annotations?.forDocument(documentId);
    const selected = scope?.getSelectedAnnotations() ?? [];
    if (!scope || !selected.length) return;
    scope.deleteAnnotations(selected.map((a) => ({ pageIndex: a.object.pageIndex, id: a.object.id })));
  };

  /** What is being drawn or typed, in the document: before a save or a print. */
  const settle = async () => {
    // A field being typed in keeps its text until it loses the focus.
    if (document.activeElement instanceof HTMLElement && viewer.current?.contains(document.activeElement))
      document.activeElement.blur();
    // A stroke just drawn becomes an annotation a moment after the pen lifts.
    const wait = Math.min(STROKE_DELAY + 100, track.current.strokeEnd + STROKE_DELAY + 100 - Date.now());
    if (wait > 0) await new Promise((r) => window.setTimeout(r, wait));
    await formsWritten();
  };

  useImperativeHandle(handleRef, () => ({
    async save() {
      const doc = state?.document;
      if (!doc || readOnly) throw new Error(tr("pdf.notReady"));
      await settle();
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
    goTo(page, centered) {
      // EmbedPDF puts the point aimed at (the page's corner, or here its
      // middle) where alignX / alignY say in the view.
      const size = state?.document?.pages[page - 1]?.size;
      scroll?.forDocument(documentId).scrollToPage({
        pageNumber: page,
        behavior: "instant",
        ...(centered &&
          size && { pageCoordinates: { x: size.width / 2, y: size.height / 2 }, alignX: 50, alignY: 50 }),
      });
    },
    deleteSelected,
    find(query) {
      void search?.forDocument(documentId).searchAllPages(query);
    },
    findNext() {
      search?.forDocument(documentId).nextResult();
    },
    findPrevious() {
      search?.forDocument(documentId).previousResult();
    },
    stopFind() {
      search?.forDocument(documentId).stopSearch();
    },
    async printPages(progress) {
      const doc = state?.document;
      if (!doc) throw new Error(tr("pdf.notReady"));
      await settle();
      if (annotations) await annotations.forDocument(documentId).commit().toPromise();
      const pages: PrintPage[] = [];
      try {
        for (const page of doc.pages) {
          // Its own turn (PDFium has it put aside) and the view's.
          const rotation = ((page.rotation + (state?.rotation ?? 0)) % 4) as Rotation;
          const { width, height } = page.size;
          const scale = Math.min(PRINT_DPI / 72, PRINT_MAX_PX / Math.max(width, height));
          const picture = await pdfium()
            .renderPage(doc, page, {
              scaleFactor: scale,
              rotation,
              dpr: 1,
              withAnnotations: true,
              withForms: true,
              imageType: "image/jpeg",
              imageQuality: 0.9,
            })
            .toPromise();
          pages.push({
            url: URL.createObjectURL(picture),
            wide: rotation % 2 ? height > width : width > height,
          });
          progress?.(pages.length, doc.pages.length);
        }
      } catch (err) {
        for (const p of pages) URL.revokeObjectURL(p.url);
        throw err;
      }
      return pages;
    },
    async flatCopy() {
      const doc = state?.document;
      if (!doc) throw new Error(tr("pdf.notReady"));
      await settle();
      if (annotations) await annotations.forDocument(documentId).commit().toPromise();
      // The pages, with what is on them, into a document of their own (a
      // password stays with the original), then each one flattened as printed.
      const engine = pdfium();
      const pagesOnly = await engine
        .extractPages(
          doc,
          doc.pages.map((p) => p.index),
        )
        .toPromise();
      const copy = await engine
        .openDocumentBuffer({ id: newDocumentId("copy"), content: pagesOnly }, { normalizeRotation: true })
        .toPromise();
      try {
        for (const page of copy.pages)
          await engine.flattenPage(copy, page, { flag: PdfPageFlattenFlag.Print }).toPromise();
        return new Uint8Array(await engine.saveAsCopy(copy).toPromise());
      } finally {
        engine.closeDocument(copy);
      }
    },
    async documentBytes() {
      const doc = state?.document;
      if (!doc || readOnly) throw new Error(tr("pdf.notReady"));
      await settle();
      if (annotations) await annotations.forDocument(documentId).commit().toPromise();
      return new Uint8Array(await pdfium().saveAsCopy(doc).toPromise());
    },
  }));

  /**
   * The highlighter away from text (a margin, a figure, a scan) draws
   * free-hand: for this stroke, EmbedPDF's free-hand highlighter takes over
   * before the press reaches the page (onText).
   */
  const freeHand = useRef(false);
  const offText = (e: React.PointerEvent) => {
    const surface = (e.target as Element).closest?.<HTMLElement>("[data-surface]");
    const doc = state?.document;
    if (!surface || !doc) return false;
    const pageIndex = Number(surface.dataset.surface);
    const page = doc.pages[pageIndex];
    if (!page) return false;
    const box = surface.getBoundingClientRect();
    const scale = state?.scale ?? 1;
    const rotation = ((page.rotation + (state?.rotation ?? 0)) % 4) as Rotation;
    const at = restorePosition(
      transformSize(transformSize(page.size, 0, scale), rotation, 1),
      { x: e.clientX - box.left, y: e.clientY - box.top },
      rotation,
      scale,
    );
    return !onText(selection?.forDocument(documentId).getState().geometry[pageIndex], at);
  };

  // A stroke starts with the pen pressed on a page: unsaved from then on.
  const onPointerDown = (e: React.PointerEvent) => {
    if (!isTyping(e.target)) viewer.current?.focus({ preventScroll: true });
    if (readOnly) return;
    if (tool === "highlight" && annotations && offText(e)) {
      freeHand.current = true;
      annotations.forDocument(documentId).setActiveTool(TOOLS.marker);
    }
    if ((DRAWING.includes(tool) || freeHand.current) && (e.target as Element).closest?.("[data-page]")) {
      track.current.strokeEnd = Date.now() + 60_000;
      check();
    }
  };
  const onPointerUp = () => {
    if (freeHand.current) {
      freeHand.current = false;
      // Once the page has the lift too (this runs first, on the way down):
      // switched back before, the stroke was never finished.
      window.setTimeout(() => annotations?.forDocument(documentId).setActiveTool(TOOLS.highlight));
    }
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

  if (locked) return <PasswordPrompt wrong={tried} onSubmit={unlock} />;
  if (!loaded) return null;
  return (
    <FreshNotes.Provider value={fresh}>
      <div className="absolute inset-0 flex">
        {showPages && (
          <SidePanel
            documentId={documentId}
            annotations={annotations}
            forms={forms}
            pages={state?.document?.pages ?? []}
          />
        )}
        <div className="flex-1 min-w-0 relative">
          <PdfViewport
            documentId={documentId}
            elementRef={viewer}
            className="eu-pdf absolute inset-0"
            still={presenting}
            onPointerDownCapture={onPointerDown}
            onPointerUpCapture={onPointerUp}
            onPointerCancelCapture={onPointerUp}
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
                      data-surface={pageIndex}
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
                      <SearchLayer
                        documentId={documentId}
                        pageIndex={pageIndex}
                        highlightColor="var(--color-pdf-match)"
                        activeHighlightColor="var(--color-pdf-match-active)"
                        style={{ position: "absolute", inset: 0 }}
                      />
                      <SelectionLayer
                        documentId={documentId}
                        pageIndex={pageIndex}
                        background="var(--color-pdf-selection)"
                      />
                      {!readOnly && (
                        <EraserOnPage
                          documentId={documentId}
                          pageIndex={pageIndex}
                          annotations={annotations}
                        />
                      )}
                      {!readOnly && (
                        <AnnotationLayer
                          documentId={documentId}
                          pageIndex={pageIndex}
                          selectionOutline={OUTLINE}
                          resizeUI={HANDLES}
                          vertexUI={HANDLES}
                          annotationRenderers={RENDERERS}
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
    </FreshNotes.Provider>
  );
}

/** The document's open password, asked where its pages would be. */
function PasswordPrompt({ wrong, onSubmit }: { wrong: boolean; onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState("");
  return (
    <div className="eu-pdf absolute inset-0 grid place-items-center p-6">
      <form
        className="w-full max-w-[44ch] text-center text-stage-ink"
        onSubmit={(e) => {
          e.preventDefault();
          if (password) onSubmit(password);
        }}
      >
        <p className="eu-t-title">{tr("pdf.passwordProtected")}</p>
        <p className="eu-t-small text-stage-muted mt-1.5">{tr("pdf.passwordHint")}</p>
        <input
          type="password"
          autoFocus
          aria-label={tr("pdf.password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="eu-input mt-4"
        />
        {wrong && (
          <p role="alert" className="eu-t-small text-danger mt-1.5">
            {tr("pdf.passwordWrong")}
          </p>
        )}
        <button type="submit" disabled={!password} className="eu-btn-primary eu-btn-sm mt-3">
          {tr("pdf.unlock")}
        </button>
      </form>
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
  still = false,
  children,
  ...handlers
}: {
  documentId: string;
  elementRef: React.RefObject<HTMLDivElement | null>;
  className: string;
  /** No scrolling by hand (presenting): the pages are turned by the keys. */
  still?: boolean;
  children: ReactNode;
} & Pick<
  React.HTMLAttributes<HTMLDivElement>,
  "onPointerDownCapture" | "onPointerUpCapture" | "onPointerCancelCapture"
>) {
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
        style={{ overflow: still ? "hidden" : "auto", padding: gap }}
        {...handlers}
      >
        {!gated && children}
      </div>
    </ViewportElementContext.Provider>
  );
}

/**
 * Takes the reader to a link's or an outline entry's place in the document;
 * a website opens in the browser (boot.rs). A file or a program is never
 * launched from a PDF.
 */
function goToTarget(target: PdfLinkTarget, scroll: ScrollScope, pages: PdfPageObject[]) {
  if (target.type === "action" && target.action.type === PdfActionType.URI) {
    window.open(target.action.uri, "_blank", "noopener,noreferrer");
    return;
  }
  const to =
    target.type === "destination"
      ? target.destination
      : target.action.type === PdfActionType.Goto || target.action.type === PdfActionType.RemoteGoto
        ? target.action.destination
        : null;
  if (!to) return;
  const page = pages[to.pageIndex];
  const xyz = to.zoom.mode === PdfZoomMode.XYZ ? to.zoom.params : null;
  scroll.scrollToPage({
    pageNumber: to.pageIndex + 1,
    // PDF coordinates go up from the bottom of the page.
    pageCoordinates: xyz && page ? { x: xyz.x, y: page.size.height - xyz.y } : undefined,
    behavior: "instant",
  });
}

/** Beside the document: its pages, and its outline when it has one. */
function SidePanel({
  documentId,
  annotations,
  forms,
  pages,
}: {
  documentId: string;
  annotations: AnnotationCapability | null;
  forms: FormCapability | null;
  pages: PdfPageObject[];
}) {
  const { provides: bookmarks } = useBookmarkCapability();
  const [outline, setOutline] = useState<PdfBookmarkObject[]>([]);
  const [view, setView] = useState<"pages" | "outline">("pages");
  useEffect(() => {
    if (!bookmarks) return;
    const task = bookmarks.forDocument(documentId).getBookmarks();
    task.wait(({ bookmarks: found }) => setOutline(found), ignore);
    return () => task.abort({ code: PdfErrorCode.Cancelled, message: "panel closed" });
  }, [bookmarks, documentId]);
  return (
    <div className="w-48 shrink-0 flex flex-col border-r border-stage-line bg-stage-alt">
      {outline.length > 0 && (
        <div className="shrink-0 flex gap-1 p-1.5 border-b border-stage-line" role="tablist">
          {(["pages", "outline"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`eu-pdf-tab ${view === v ? "eu-pdf-tab-current" : ""}`}
            >
              {tr(v === "pages" ? "pdf.pages" : "pdf.outline")}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0">
        {view === "outline" && outline.length > 0 ? (
          <Outline documentId={documentId} entries={outline} pages={pages} />
        ) : (
          <PagesPanel documentId={documentId} annotations={annotations} forms={forms} />
        )}
      </div>
    </div>
  );
}

/** The document's outline (its bookmarks), each entry taking the reader to its page. */
function Outline({
  documentId,
  entries,
  pages,
}: {
  documentId: string;
  entries: PdfBookmarkObject[];
  pages: PdfPageObject[];
}) {
  const { provides: scroll } = useScrollCapability();
  const go = (target?: PdfLinkTarget) => {
    if (target && scroll) goToTarget(target, scroll.forDocument(documentId), pages);
  };
  const list = (items: PdfBookmarkObject[], depth: number): React.ReactNode => (
    <ul role={depth ? "group" : "tree"} aria-label={depth ? undefined : tr("pdf.outline")}>
      {items.map((b, i) => (
        <li key={i} role="treeitem" aria-selected={false}>
          <button
            type="button"
            onClick={() => go(b.target)}
            className="eu-pdf-outline-entry"
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            {b.title}
          </button>
          {b.children?.length ? list(b.children, depth + 1) : null}
        </li>
      ))}
    </ul>
  );
  return <div className="h-full overflow-y-auto py-1.5">{list(entries, 0)}</div>;
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
    <ThumbnailsPane documentId={documentId} aria-label={tr("pdf.pages")}>
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
            <span className="eu-pdf-thumb-page" style={{ width: meta.width, height: meta.height }}>
              <PageThumb
                documentId={documentId}
                pageIndex={meta.pageIndex}
                width={meta.width}
                drawn={drawn[meta.pageIndex] ?? 0}
              />
            </span>
            <span className="eu-pdf-thumb-n" style={{ height: meta.labelHeight }}>
              <span>{n}</span>
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
