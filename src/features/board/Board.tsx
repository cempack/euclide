import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { changed } from "../../api/client";
import { createPortal, flushSync } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Circle as CircleIcon,
  Crosshair,
  DraftingCompass,
  Ellipsis,
  Eraser,
  FilePlus2,
  Grid3x3,
  Hand,
  Highlighter,
  History,
  ImagePlus,
  Maximize,
  MousePointer2,
  PenLine,
  Pencil,
  Redo2,
  Ruler,
  Sigma,
  Slash,
  Square,
  SquareFunction,
  Trash2,
  TriangleRight,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import { q } from "../../api/queries";
import { Toolbar, ToolGroup, ToolSpacer } from "../../components/layout";
import { useConfirm, useToast } from "../../components/ui";
import katex from "katex";
import { api, isTauri, versionUrl, type FileItem, type FileVersion } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { openFile } from "../../lib/files";
import { tr, type StringKey } from "../../lib/i18n";
import { keysOf, useShortcut } from "../../lib/keymap";
import { logged, reportError } from "../../lib/report";
import { useAutosave } from "../../lib/useAutosave";
import { editors } from "../../stores/editors";
import { tabs, useActiveId } from "../../stores/tabs";
import { Icon } from "../../ui/Icon";
import { MenuButton, type MenuEntry } from "../../ui/Menu";
import { tip } from "../../ui/Tooltip";
import { printDialog, sheetReady } from "../notes/PrintSheet";
import { PICTURE_TYPES, fileStem, imageExtension, isImageName, pastedPictures } from "../notes/images";
import { addDropTarget } from "../../shell/drop";
import { loadPictures, onAssetsReady, picture } from "./assets";
import { compile } from "./expr";
import { checkMath, measureMath } from "./math";
import {
  InstrumentLayer,
  alongEdge,
  edgeNear,
  placeInstrument,
  type Instrument,
  type InstrumentKind,
} from "./instruments";
import {
  CM,
  boardJson,
  boundsOf,
  contentBounds,
  dist,
  distanceTo,
  gridStep,
  itemAt,
  moveItem,
  newId,
  nextLabel,
  parseBoard,
  resizable,
  resizeItem,
  sheetsOf,
  snap,
  withPicture,
  type Background,
  type Item,
  type MathItem,
  type P,
  type Picture,
  type Sheet,
  type Text,
  type View,
} from "./model";
import { drawBackground, drawItem, drawItems, plotFunction, renderBoardReady } from "./render";

type Tool =
  | "select"
  | "hand"
  | "pen"
  | "highlighter"
  | "eraser"
  | "segment"
  | "circle"
  | "rect"
  | "point"
  | "text"
  | "math"
  | "plot";

/** The page on screen. */
interface Doc {
  items: Item[];
  background: Background;
}

/**
 * The board at a moment: every page (the one shown is `doc`), which one,
 * and how it was shown.
 */
interface Step {
  doc: Doc;
  pages: Sheet[];
  page: number;
  view: View;
}

/**
 * What one undo takes back: the board before the change and after it. Undo
 * shows it as it was, redo as it became, on the page where it happened.
 */
interface Change {
  before: Step;
  after: Step;
}

const COLORS = ["#111213", "#1d4ed8", "#d32f2f", "#2e7d32", "#7b1fa2", "#ef6c00"];
const HIGHLIGHTS = ["#ffe600", "#7ee787", "#ff8fc7", "#79c0ff"];
/** What a swatch is called (its tooltip, and its name for a screen reader). */
const COLOR_NAMES: Record<string, StringKey> = {
  "#111213": "board.colorBlack",
  "#1d4ed8": "board.colorBlue",
  "#d32f2f": "board.colorRed",
  "#2e7d32": "board.colorGreen",
  "#7b1fa2": "board.colorPurple",
  "#ef6c00": "board.colorOrange",
  "#ffe600": "board.colorYellow",
  "#7ee787": "board.colorLightGreen",
  "#ff8fc7": "board.colorPink",
  "#79c0ff": "board.colorLightBlue",
};
const WIDTHS = [
  { value: 2, label: "board.thin" },
  { value: 3.5, label: "board.medium" },
  { value: 7, label: "board.thick" },
] as const;
const TEXT_SIZES = [
  { value: 18, label: "board.small" },
  { value: 26, label: "board.medium" },
  { value: 40, label: "board.large" },
] as const;
const BACKGROUNDS: { value: Background; label: StringKey }[] = [
  { value: "plain", label: "board.bgPlain" },
  { value: "seyes", label: "board.bgSeyes" },
  { value: "squares", label: "board.bgSquares" },
  { value: "dots", label: "board.bgDots" },
  { value: "axes", label: "board.bgAxes" },
];

const TOOLS: { tool: Tool; icon: LucideIcon; label: StringKey }[][] = [
  [
    { tool: "select", icon: MousePointer2, label: "board.select" },
    { tool: "hand", icon: Hand, label: "board.hand" },
    { tool: "pen", icon: PenLine, label: "board.pen" },
    { tool: "highlighter", icon: Highlighter, label: "board.highlighter" },
    { tool: "eraser", icon: Eraser, label: "board.eraser" },
  ],
  [
    { tool: "segment", icon: Slash, label: "board.segment" },
    { tool: "circle", icon: CircleIcon, label: "board.circle" },
    { tool: "rect", icon: Square, label: "board.rect" },
    { tool: "point", icon: Crosshair, label: "board.point" },
    { tool: "text", icon: Type, label: "board.text" },
    { tool: "math", icon: Sigma, label: "board.math" },
    { tool: "plot", icon: SquareFunction, label: "board.plot" },
  ],
];

/** A protractor, drawn like the lucide set (there is no such glyph there). */
function ProtractorGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 17a10 10 0 0 1 20 0Z" />
      <path d="M7 17a5 5 0 0 1 10 0" />
      <path d="M12 17v-2" />
    </svg>
  );
}

const INSTRUMENTS: { kind: InstrumentKind; label: StringKey; icon: React.ReactNode }[] = [
  { kind: "ruler", label: "board.ruler", icon: <Icon icon={Ruler} size={16} /> },
  { kind: "square", label: "board.square", icon: <Icon icon={TriangleRight} size={16} /> },
  { kind: "protractor", label: "board.protractor", icon: <ProtractorGlyph /> },
  { kind: "compass", label: "board.compass", icon: <Icon icon={DraftingCompass} size={16} /> },
];

/** Tools whose clicks land on remarkable places (points, crossings, grid). */
const SNAPPING: Tool[] = ["segment", "circle", "rect", "point"];

type Gesture =
  | { type: "pan"; x: number; y: number; from: View }
  | { type: "ink"; pts: number[]; edge: [P, P] | null; start: P }
  | { type: "erase"; removed: Set<string> }
  | { type: "shape"; tool: "segment" | "circle" | "rect"; a: P; b: P }
  | { type: "point"; p: P }
  | { type: "pinch"; d0: number; mid0: P; from: View }
  // The selection tool: `base` is the board before, for one undo.
  | { type: "move"; id: string; from: P; base: Doc; moved: boolean }
  | { type: "resize"; id: string; base: Doc };

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 8;

/**
 * The whiteboard: an infinite sheet of paper (plain, Seyès, small squares,
 * dots or axes) with freehand ink, exact figures that snap to points and
 * crossings, function graphs, and instruments (ruler, set square,
 * protractor, compass). Saved as format 3 (see model.ts), with a preview
 * for the Documents grid.
 */
export default function Board({
  tabId,
  fileId,
  initialCourseId,
  visible = true,
}: {
  tabId: string;
  fileId?: number;
  initialCourseId?: number;
  visible?: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const active = useActiveId() === tabId;
  const courses = useQuery(q.courses()).data ?? [];

  const [doc, setDoc] = useState<Doc>({ items: [], background: "plain" });
  // Every page; the one shown is `doc`, its place here may be behind it.
  const [pages, setPages] = useState<Sheet[]>([{ items: [], background: "plain" }]);
  const [page, setPage] = useState(0);
  const [history, setHistory] = useState<{ past: Change[]; future: Change[] }>({ past: [], future: [] });
  const [view, setView] = useState<View>({ x: -3 * CM, y: -2 * CM, zoom: 1 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [highlight, setHighlight] = useState(HIGHLIGHTS[0]);
  const [width, setWidth] = useState<number>(WIDTHS[1].value);
  const [textSize, setTextSize] = useState<number>(TEXT_SIZES[1].value);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [editing, setEditing] = useState<{ p: P; text: string; size: number; color: string } | null>(null);
  // A formula being written: `id` when it replaces one on the board.
  const [editingMath, setEditingMath] = useState<{
    id: string | null;
    p: P;
    tex: string;
    size: number;
    color: string;
  } | null>(null);
  const [mathError, setMathError] = useState("");
  // What the selection tool holds.
  const [selected, setSelected] = useState<string | null>(null);
  // Bumped when a picture or a formula is ready to draw.
  const [assets, setAssets] = useState(0);
  const [plotExpr, setPlotExpr] = useState("");
  const [plotError, setPlotError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [currentFileId, setCurrentFileId] = useState(fileId);
  const [courseId, setCourseId] = useState<number | null>(initialCourseId ?? null);
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [printImages, setPrintImages] = useState<string[]>([]);
  const [panning, setPanning] = useState(false);

  // The latest values, for pointer handlers and the save that quitting asks for.
  const docRef = useRef(doc);
  const pagesRef = useRef(pages);
  const pageRef = useRef(page);
  const viewRef = useRef(view);
  const sizeRef = useRef(size);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const mathRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, P>());
  const spaceDown = useRef(false);
  const placed = useRef(false);
  useEffect(() => {
    docRef.current = doc;
    pagesRef.current = pages;
    pageRef.current = page;
    viewRef.current = view;
    sizeRef.current = size;
  });

  /** The board as it is, for an undo step. */
  const step = (): Step => ({
    doc: docRef.current,
    pages: pagesRef.current,
    page: pageRef.current,
    view: viewRef.current,
  });
  /** A change made since `before`, as one undo. */
  const remember = (before: Step) => {
    const after = step();
    setHistory((h) => ({ past: [...h.past.slice(-99), { before, after }], future: [] }));
    setDirty(true);
  };
  /** A change the teacher can undo. */
  const commit = (next: Doc) => {
    const before = step();
    docRef.current = next;
    setDoc(next);
    remember(before);
  };
  /** A change shown while a gesture runs; the gesture commits it at its end. */
  const show = (next: Doc) => {
    docRef.current = next;
    setDoc(next);
  };
  /** The board as a step left it, on the page it was on. */
  const restore = (s: Step) => {
    docRef.current = s.doc;
    setDoc(s.doc);
    pagesRef.current = s.pages;
    setPages(s.pages);
    if (s.page !== pageRef.current) {
      pageRef.current = s.page;
      setPage(s.page);
      setSelected(null);
      changeView(s.view);
    }
    setDirty(true);
  };
  const undo = () => {
    const last = history.past[history.past.length - 1];
    if (!last) return;
    setHistory({ past: history.past.slice(0, -1), future: [last, ...history.future] });
    restore(last.before);
  };
  const redo = () => {
    const next = history.future[0];
    if (!next) return;
    setHistory({ past: [...history.past, next], future: history.future.slice(1) });
    restore(next.after);
  };

  // ---- pages -------------------------------------------------------------------

  /** Every page, the one shown as it is now (saving, exporting, turning pages). */
  const allPages = (): Sheet[] =>
    pagesRef.current.map((s, i) =>
      i === pageRef.current ? { ...docRef.current, view: viewRef.current } : s,
    );

  /** `sheets` as the board's pages, page `n` on screen as it was left (else all of it in view). */
  const showPages = (sheets: Sheet[], n: number) => {
    const at = Math.max(0, Math.min(n, sheets.length - 1));
    pagesRef.current = sheets;
    setPages(sheets);
    pageRef.current = at;
    setPage(at);
    const d = { items: sheets[at].items, background: sheets[at].background };
    docRef.current = d;
    setDoc(d);
    setSelected(null);
    const v = sheets[at].view;
    if (v) changeView(v);
    else fit(d);
  };

  /** The selection tool's item, off the board. */
  const removeSelected = () => {
    const d = docRef.current;
    if (!selected || !d.items.some((i) => i.id === selected)) return;
    commit({ ...d, items: d.items.filter((i) => i.id !== selected) });
    setSelected(null);
  };

  /** The board's name, from its tab (exports, pictures added). */
  const title = () =>
    tabs
      .list()
      .find((t) => t.id === tabId)
      ?.title?.replace(/\.euboard$/i, "") || tr("app.tabWhiteboard");

  const changeView = (next: View) => {
    const v = { ...next, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next.zoom)) };
    viewRef.current = v;
    setView(v);
  };
  /** Zoom by `factor`, the world point under (sx, sy) staying put. */
  const zoomAt = (factor: number, sx: number, sy: number) => {
    const v = viewRef.current;
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor));
    changeView({ x: v.x + sx / v.zoom - sx / zoom, y: v.y + sy / v.zoom - sy / zoom, zoom });
  };
  /** Everything drawn in view (or the start of the sheet when nothing is). */
  const fit = (d: Doc = docRef.current) => {
    const { w, h } = sizeRef.current;
    if (!w || !h) return;
    const box = contentBounds(d.items);
    if (!box) {
      changeView(
        d.background === "axes" ? { x: -w / 2, y: -h / 2, zoom: 1 } : { x: -3 * CM, y: -2 * CM, zoom: 1 },
      );
      return;
    }
    const pad = 1.5 * CM;
    // The tool palette covers the left edge.
    const left = 64;
    const zoom = Math.max(
      MIN_ZOOM,
      Math.min(2, (w - left) / (box.x1 - box.x0 + 2 * pad), h / (box.y1 - box.y0 + 2 * pad)),
    );
    changeView({
      x: (box.x0 + box.x1) / 2 - (w + left) / 2 / zoom,
      y: (box.y0 + box.y1) / 2 - h / 2 / zoom,
      zoom,
    });
  };

  // ---- loading ---------------------------------------------------------------

  useEffect(() => {
    if (!fileId) return;
    let live = true;
    api
      .readBoard(fileId)
      .then((raw) => {
        if (!live) return;
        const b = parseBoard(raw);
        const sheets = sheetsOf(b);
        const at = b.page ?? 0;
        pagesRef.current = sheets;
        setPages(sheets);
        pageRef.current = at;
        setPage(at);
        const d = { items: sheets[at].items, background: sheets[at].background };
        docRef.current = d;
        setDoc(d);
        setHistory({ past: [], future: [] });
        setDirty(false);
        const v = sheets[at].view;
        if (v) {
          placed.current = true;
          changeView(v);
        } else if (sizeRef.current.w) {
          placed.current = true;
          fit(d);
        }
      })
      .catch((err) => {
        reportError("board.read", err);
        toast(errorMessage(err, tr("messages.genericError")), "error");
      });
    return () => {
      live = false;
    };
    // fit and changeView read refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, toast]);

  useEffect(() => {
    if (!currentFileId) return;
    api.getFileVersions(currentFileId).then(setVersions).catch(logged("board.versions"));
  }, [currentFileId]);

  // ---- size and drawing ------------------------------------------------------

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      const next = { w: wrap.clientWidth, h: wrap.clientHeight };
      if (!next.w || !next.h) return;
      sizeRef.current = next;
      setSize(next);
      if (!placed.current) {
        placed.current = true;
        fit();
      }
    });
    ro.observe(wrap);
    return () => ro.disconnect();
    // fit reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A short board (a small window, a projector of 768 lines) folds the tool
  // palette into two columns, rather than hiding its last tools under a
  // scroll nobody sees. Its height in one column is measured while it is in
  // one column, and kept for the way back.
  const paletteRef = useRef<HTMLDivElement>(null);
  const [fold, setFold] = useState(false);
  useEffect(() => {
    const wrap = wrapRef.current;
    const palette = paletteRef.current;
    if (!wrap || !palette) return;
    let tall = 0;
    const ro = new ResizeObserver(() => {
      if (palette.dataset.fold === undefined)
        tall = palette.scrollHeight + palette.offsetHeight - palette.clientHeight;
      if (tall) setFold(tall > wrap.clientHeight - 2 * palette.offsetTop);
    });
    ro.observe(wrap);
    ro.observe(palette);
    return () => ro.disconnect();
  }, []);

  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  useEffect(() => {
    const { w, h } = size;
    if (!w || !h || !visible) return;
    for (const c of [bgRef.current, inkRef.current, liveRef.current]) {
      if (!c) continue;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
    }
    const bg = bgRef.current?.getContext("2d");
    const ink = inkRef.current?.getContext("2d");
    // A formula being rewritten shows in its editor, not twice.
    const hidden = editingMath?.id;
    const items = hidden ? doc.items.filter((i) => i.id !== hidden) : doc.items;
    if (bg) drawBackground(bg, doc.background, view, w, h, dpr);
    if (ink) drawItems(ink, items, view, w, h, dpr, boundsOf);
  }, [doc, view, size, dpr, visible, assets, editingMath?.id]);

  useEffect(() => onAssetsReady(() => setAssets((n) => n + 1)), []);

  /** The preview of what is being drawn, and the snap marker. */
  const drawLive = (preview: Item | null, marker: P | null) => {
    const c = liveRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const v = viewRef.current;
    const { w } = sizeRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr * v.zoom, 0, 0, dpr * v.zoom, -v.x * v.zoom * dpr, -v.y * v.zoom * dpr);
    if (preview) drawItem(ctx, preview, v, w);
    if (marker) {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.setLineDash([]);
      ctx.strokeStyle = "#1d4ed8";
      ctx.lineWidth = 1.5 / v.zoom;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, 7 / v.zoom, 0, 2 * Math.PI);
      ctx.stroke();
    }
  };

  // ---- pointer ---------------------------------------------------------------

  const worldOf = (e: { clientX: number; clientY: number }): P => {
    const r = wrapRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: v.x + (e.clientX - r.left) / v.zoom, y: v.y + (e.clientY - r.top) / v.zoom };
  };
  const screenOf = (e: { clientX: number; clientY: number }): P => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const snapped = (p: P) => {
    const v = viewRef.current;
    const s = snap(p, docRef.current.items, 10 / v.zoom, gridStep(docRef.current.background));
    return s ? s.p : p;
  };
  const strokeColor = () => (tool === "highlighter" ? highlight : color);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (editing) {
      commitText();
      return;
    }
    if (editingMath) {
      void commitMath();
      return;
    }
    if (tool === "math" && e.button === 0 && !spaceDown.current) {
      // Keep the focus for the formula's field that opens.
      e.preventDefault();
      const p = worldOf(e);
      const hit = [...docRef.current.items]
        .reverse()
        .find((i): i is MathItem => i.kind === "math" && distanceTo(i, p) === 0);
      setMathError("");
      setEditingMath(
        hit
          ? { id: hit.id, p: hit.p, tex: hit.tex, size: hit.size, color: hit.color }
          : { id: null, p, tex: "", size: textSize, color },
      );
      return;
    }
    if (tool === "text" && e.button === 0 && !spaceDown.current) {
      // Keep the focus for the text field that opens.
      e.preventDefault();
      const p = worldOf(e);
      const hit = [...docRef.current.items]
        .reverse()
        .find((i): i is Text => i.kind === "text" && distanceTo(i, p) === 0);
      if (hit) {
        commit({ ...docRef.current, items: docRef.current.items.filter((i) => i.id !== hit.id) });
        setEditing({ p: hit.p, text: hit.text, size: hit.size, color: hit.color });
      } else setEditing({ p, text: "", size: textSize, color });
      return;
    }
    wrapRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, screenOf(e));
    if (pointers.current.size === 2) {
      // Two fingers: pinch and pan; what one finger began is dropped.
      const [a, b] = [...pointers.current.values()];
      gesture.current = {
        type: "pinch",
        d0: dist(a, b),
        mid0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        from: viewRef.current,
      };
      drawLive(null, null);
      return;
    }
    if (e.button === 1 || tool === "hand" || spaceDown.current) {
      gesture.current = { type: "pan", x: e.clientX, y: e.clientY, from: viewRef.current };
      setPanning(true);
      return;
    }
    if (e.button !== 0) return;
    const p = worldOf(e);
    const v = viewRef.current;
    if (tool === "select") {
      const hit = itemAt(docRef.current.items, p, 8 / v.zoom);
      setSelected(hit?.id ?? null);
      // Beside everything, the sheet moves.
      if (hit) gesture.current = { type: "move", id: hit.id, from: p, base: docRef.current, moved: false };
      else {
        gesture.current = { type: "pan", x: e.clientX, y: e.clientY, from: v };
        setPanning(true);
      }
      return;
    }
    if (tool === "pen" || tool === "highlighter") {
      const edge = tool === "pen" ? edgeNear(p, instruments, 14 / v.zoom) : null;
      const start = edge ? alongEdge(p, edge) : p;
      gesture.current = { type: "ink", pts: [start.x, start.y], edge, start };
    } else if (tool === "eraser") {
      gesture.current = { type: "erase", removed: new Set() };
      eraseAt(p);
    } else if (tool === "segment" || tool === "circle" || tool === "rect") {
      const a = snapped(p);
      const edge = tool === "segment" ? edgeNear(p, instruments, 14 / v.zoom) : null;
      const start = edge ? alongEdge(a, edge) : a;
      gesture.current = { type: "shape", tool, a: start, b: start };
    } else if (tool === "point") {
      gesture.current = { type: "point", p: snapped(p) };
    }
  };

  const eraseAt = (p: P) => {
    const g = gesture.current;
    if (g?.type !== "erase") return;
    const reach = 8 / viewRef.current.zoom;
    for (const item of docRef.current.items) {
      // A picture goes with the selection tool: erasing the ink over it leaves it.
      if (g.removed.has(item.id) || (item.kind === "ink" && item.erase) || item.kind === "image") continue;
      const pad = "width" in item ? item.width / 2 : 0;
      const f = item.kind === "plot" ? (plotFunction(item.expr) ?? undefined) : undefined;
      if (distanceTo(item, p, f) <= reach + pad) g.removed.add(item.id);
    }
    const ink = inkRef.current?.getContext("2d");
    if (ink && g.removed.size)
      drawItems(
        ink,
        docRef.current.items.filter((i) => !g.removed.has(i.id)),
        viewRef.current,
        sizeRef.current.w,
        sizeRef.current.h,
        dpr,
        boundsOf,
      );
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, screenOf(e));
    const g = gesture.current;
    if (!g) {
      // Hovering: show where a click would snap.
      if (SNAPPING.includes(tool) && e.pointerType !== "touch") {
        const p = worldOf(e);
        const s = snapped(p);
        drawLive(null, s !== p ? s : null);
      }
      return;
    }
    if (g.type === "pinch") {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const [a, b] = pts;
      const d = dist(a, b);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (g.from.zoom * d) / (g.d0 || 1)));
      // The world point under the first midpoint follows the fingers.
      const wx = g.from.x + g.mid0.x / g.from.zoom;
      const wy = g.from.y + g.mid0.y / g.from.zoom;
      changeView({ x: wx - mid.x / zoom, y: wy - mid.y / zoom, zoom });
      return;
    }
    if (g.type === "pan") {
      changeView({
        ...g.from,
        x: g.from.x - (e.clientX - g.x) / g.from.zoom,
        y: g.from.y - (e.clientY - g.y) / g.from.zoom,
      });
      return;
    }
    const p = worldOf(e);
    if (g.type === "move") {
      const dx = p.x - g.from.x;
      const dy = p.y - g.from.y;
      // A click is not a move.
      if (!g.moved && Math.hypot(dx, dy) * viewRef.current.zoom < 3) return;
      g.moved = true;
      show({ ...g.base, items: g.base.items.map((i) => (i.id === g.id ? moveItem(i, dx, dy) : i)) });
      return;
    }
    if (g.type === "resize") {
      const item = g.base.items.find((i) => i.id === g.id);
      if (!item || !resizable(item)) return;
      const width = Math.max(12 / viewRef.current.zoom, p.x - item.p.x);
      show({ ...g.base, items: g.base.items.map((i) => (i.id === g.id ? resizeItem(item, width) : i)) });
      return;
    }
    if (g.type === "ink") {
      if (g.edge) {
        const q = alongEdge(p, g.edge);
        g.pts = [g.start.x, g.start.y, q.x, q.y];
      } else {
        // Skip points closer than a screen pixel: lighter files, smoother lines.
        const n = g.pts.length;
        if (Math.hypot(p.x - g.pts[n - 2], p.y - g.pts[n - 1]) * viewRef.current.zoom < 1) return;
        // Events coalesced between frames (pens send many) keep their detail.
        const extra = e.nativeEvent.getCoalescedEvents?.() ?? [];
        for (const ev of extra.slice(0, -1)) {
          const c = worldOf(ev);
          g.pts.push(c.x, c.y);
        }
        g.pts.push(p.x, p.y);
      }
      drawLive(inkPreview(g.pts), null);
    } else if (g.type === "erase") {
      eraseAt(p);
    } else if (g.type === "shape") {
      let b = snapped(p);
      if (g.tool === "segment") {
        const edge = edgeNear(g.a, instruments, 1e-6) ?? edgeNear(p, instruments, 14 / viewRef.current.zoom);
        if (edge && dist(alongEdge(g.a, edge), g.a) < 1e-6) b = alongEdge(b, edge);
      }
      g.b = b;
      drawLive(shapeOf(g), b !== p ? b : null);
    } else if (g.type === "point") {
      g.p = snapped(p);
      drawLive(null, g.p);
    }
  };

  const inkPreview = (pts: number[]): Item => ({
    id: "live",
    kind: "ink",
    pts,
    color: strokeColor(),
    width: tool === "highlighter" ? 18 : width,
    opacity: tool === "highlighter" ? 0.38 : 1,
  });
  const shapeOf = (g: Extract<Gesture, { type: "shape" }>): Item => {
    const base = { id: newId(), color, width };
    if (g.tool === "segment") return { ...base, kind: "segment", a: g.a, b: g.b };
    if (g.tool === "circle") return { ...base, kind: "circle", c: g.a, r: dist(g.a, g.b) };
    return { ...base, kind: "rect", a: g.a, b: g.b };
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.type === "pinch") {
      if (pointers.current.size === 0) gesture.current = null;
      return;
    }
    gesture.current = null;
    drawLive(null, null);
    if (!g) return;
    const d = docRef.current;
    if (g.type === "pan") setPanning(false);
    else if (g.type === "move" || g.type === "resize") {
      // One undo for the whole move.
      if (d !== g.base) {
        docRef.current = g.base;
        commit(d);
      }
    } else if (g.type === "ink") {
      commit({ ...d, items: [...d.items, { ...inkPreview(g.pts), id: newId() }] });
    } else if (g.type === "erase") {
      if (g.removed.size) commit({ ...d, items: d.items.filter((i) => !g.removed.has(i.id)) });
    } else if (g.type === "shape") {
      if (dist(g.a, g.b) * viewRef.current.zoom >= 3) commit({ ...d, items: [...d.items, shapeOf(g)] });
    } else if (g.type === "point") {
      commit({
        ...d,
        items: [...d.items, { id: newId(), kind: "point", p: g.p, label: nextLabel(d.items), color }],
      });
    }
  };

  // Wheel: scroll pans, Ctrl + wheel (and a trackpad pinch) zooms. Not
  // passive, so the page does not scroll too.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(Math.exp(-e.deltaY * 0.0018), e.clientX - r.left, e.clientY - r.top);
      } else {
        const v = viewRef.current;
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;
        changeView({ ...v, x: v.x + dx / v.zoom, y: v.y + dy / v.zoom });
      }
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
    // zoomAt and changeView read refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- text ------------------------------------------------------------------

  const editingOpen = editing != null;
  useEffect(() => {
    if (editingOpen) textRef.current?.focus();
  }, [editingOpen]);

  const commitText = () => {
    if (!editing) return;
    const text = editing.text.replace(/\s+$/, "");
    setEditing(null);
    if (!text) return;
    const d = docRef.current;
    commit({
      ...d,
      items: [
        ...d.items,
        { id: newId(), kind: "text", p: editing.p, text, size: editing.size, color: editing.color },
      ],
    });
  };

  // ---- formulas ----------------------------------------------------------------

  const editingMathOpen = editingMath != null;
  useEffect(() => {
    if (editingMathOpen) mathRef.current?.focus();
  }, [editingMathOpen]);

  /**
   * The formula being written goes on the board (in place of the one it
   * rewrites); emptied, that one goes. One KaTeX cannot set keeps its field
   * open, with what is wrong.
   */
  const commitMath = async () => {
    const m = editingMath;
    if (!m) return;
    const tex = m.tex.trim();
    const d = docRef.current;
    const before = m.id ? d.items.find((i) => i.id === m.id) : undefined;
    if (!tex) {
      setEditingMath(null);
      if (before) commit({ ...d, items: d.items.filter((i) => i !== before) });
      return;
    }
    const error = checkMath(tex);
    if (error) {
      setMathError(error);
      mathRef.current?.focus();
      return;
    }
    setEditingMath(null);
    setMathError("");
    if (before?.kind === "math" && before.tex === tex && before.size === m.size && before.color === m.color)
      return;
    try {
      const { w, h } = await measureMath(tex, m.size);
      const item: MathItem = {
        id: m.id ?? newId(),
        kind: "math",
        p: m.p,
        tex,
        size: m.size,
        color: m.color,
        w,
        h,
      };
      const now = docRef.current;
      commit({
        ...now,
        items: before ? now.items.map((i) => (i.id === item.id ? item : i)) : [...now.items, item],
      });
    } catch (err) {
      reportError("board.math", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    }
  };

  // ---- turning pages -----------------------------------------------------------

  /** Another page, as it was left; a text or a formula being written goes on its own page first. */
  const goTo = async (n: number) => {
    if (n < 0 || n >= pagesRef.current.length || n === pageRef.current) return;
    if (editing) commitText();
    if (editingMath) await commitMath();
    showPages(allPages(), n);
  };

  /** A blank page after this one, on the same paper. */
  const addPage = () => {
    if (editing) commitText();
    const before = step();
    const sheets = allPages();
    const at = pageRef.current + 1;
    showPages(
      [...sheets.slice(0, at), { items: [], background: docRef.current.background }, ...sheets.slice(at)],
      at,
    );
    remember(before);
  };

  const deletePage = async () => {
    if (pagesRef.current.length < 2) return;
    if (docRef.current.items.length) {
      const ok = await confirm.ask({
        title: tr("board.deletePageTitle", { n: pageRef.current + 1 }),
        message: tr("board.deletePageMessage"),
        confirmLabel: tr("board.deletePage"),
        danger: true,
      });
      if (!ok) return;
    }
    const before = step();
    showPages(
      allPages().filter((_, i) => i !== pageRef.current),
      pageRef.current,
    );
    remember(before);
  };

  // Keys, while this board is the tab in front: Space holds the hand,
  // Ctrl+Z / Ctrl+Y undo and redo (not while typing a text).
  useEffect(() => {
    if (!active || !visible) return;
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      if (e.code === "Space" && !e.repeat) {
        spaceDown.current = true;
        setPanning(true);
        e.preventDefault();
      }
      if (selected && tool === "select" && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        removeSelected();
        return;
      }
      if (selected && e.key === "Escape") {
        setSelected(null);
        return;
      }
      // A presentation clicker sends these.
      if (e.key === "PageDown" || e.key === "PageUp") {
        e.preventDefault();
        void goTo(pageRef.current + (e.key === "PageDown" ? 1 : -1));
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && !e.altKey && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redo();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDown.current = false;
        setPanning(false);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });

  /** The selected formula, back in its field. */
  const editSelectedMath = () => {
    const item = docRef.current.items.find((i) => i.id === selected);
    if (item?.kind !== "math") return;
    setTool("math");
    setSelected(null);
    setMathError("");
    setEditingMath({ id: item.id, p: item.p, tex: item.tex, size: item.size, color: item.color });
  };

  // ---- pictures ----------------------------------------------------------------

  /**
   * Pictures from the library on the board, centred on `at` (else the
   * middle of the screen), at most 60 % of it, under the drawing; the last
   * one selected, to move it or size it at once.
   */
  const placePictures = async (files: FileItem[], at?: P) => {
    if (!files.length) return;
    await loadPictures(files.map((f) => f.id));
    const v = viewRef.current;
    const { w: sw, h: sh } = sizeRef.current;
    const centre = at ?? { x: v.x + sw / 2 / v.zoom, y: v.y + sh / 2 / v.zoom };
    let d = docRef.current;
    let last: Picture | null = null;
    files.forEach((f, i) => {
      const img = picture(f.id);
      // Its pixels as the screen showed them (a screenshot at 150 % is 1.5 times larger).
      const natural = img ? { w: img.naturalWidth / dpr, h: img.naturalHeight / dpr } : { w: 320, h: 240 };
      const k = Math.min(1, (0.6 * sw) / v.zoom / natural.w, (0.6 * sh) / v.zoom / natural.h);
      const w = natural.w * k;
      const h = natural.h * k;
      const step = (24 * i) / v.zoom;
      last = {
        id: newId(),
        kind: "image",
        p: { x: centre.x - w / 2 + step, y: centre.y - h / 2 + step },
        w,
        h,
        file: f.id,
      };
      d = { ...d, items: withPicture(d.items, last) };
    });
    commit(d);
    if (last) {
      setTool("select");
      setSelected((last as Picture).id);
    }
  };

  /** Pictures picked or pasted: into the documents (with the board's course), then onto the board. */
  const addPictures = async (files: File[], at?: P) => {
    const pictures = files.filter((f) => PICTURE_TYPES.includes(f.type));
    if (!pictures.length) return;
    const stem = fileStem(title());
    const added: FileItem[] = [];
    try {
      for (const file of pictures) {
        const named = isImageName(file.name) && file.name !== "image.png";
        const name = named ? file.name : `${stem} - image.${imageExtension(file.type)}`;
        added.push(await api.createFileBytes(name, await file.arrayBuffer(), { courseId }));
      }
    } catch (err) {
      reportError("board.picture", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    }
    // Those saved before a failure still go on the board.
    if (!added.length) return;
    changed("library");
    await placePictures(added, at);
  };

  /** Pictures dropped from the file explorer, where they were dropped. */
  const addPicturePaths = async (paths: string[], at: P) => {
    try {
      const added = await api.importPaths(paths, courseId);
      changed("library");
      await placePictures(added, at);
    } catch (err) {
      reportError("board.dropPicture", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    }
  };

  // Pasted pictures (not while typing a text or a formula).
  useEffect(() => {
    if (!active || !visible) return;
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA"].includes(t.tagName)))
        return;
      const pictures = e.clipboardData ? pastedPictures(e.clipboardData) : [];
      if (!pictures.length) return;
      e.preventDefault();
      void addPictures(pictures);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  // Pictures dropped on the sheet go on it.
  const dropPictures = useRef(addPicturePaths);
  useEffect(() => {
    dropPictures.current = addPicturePaths;
  });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    return addDropTarget({
      el,
      takes: (paths) => paths.every(isImageName),
      drop: (paths, at) => void dropPictures.current(paths, worldOf({ clientX: at.x, clientY: at.y })),
      title: tr("dragDrop.boardTitle"),
      hint: tr("dragDrop.boardHint"),
    });
  }, []);

  // ---- plots -----------------------------------------------------------------

  const addPlot = () => {
    const c = compile(plotExpr);
    if (!c.ok) {
      setPlotError(c.error);
      return;
    }
    setPlotError("");
    const d = docRef.current;
    const expr = plotExpr.replace(/^\s*(?:[a-zA-Z]\s*\(\s*x\s*\)|y)\s*=\s*/, "").trim();
    commit({
      background: "axes",
      items: [...d.items, { id: newId(), kind: "plot", expr, color, width: Math.max(width, 2.5) }],
    });
    if (d.background !== "axes") {
      const { w, h } = sizeRef.current;
      changeView({
        x: -w / 2 / viewRef.current.zoom,
        y: -h / 2 / viewRef.current.zoom,
        zoom: viewRef.current.zoom,
      });
    }
    setPlotExpr("");
  };

  // ---- saving, exporting -----------------------------------------------------

  // The board's file once it has one: a save that starts while the first is
  // on its way must update that file, not create a second board.
  const fileIdRef = useRef(currentFileId);
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const loggedSave = useRef(false);
  const autosaveFailed = useRef(false);
  // A save the timer made leaves the Documents preview behind; it is drawn
  // when the teacher leaves the board.
  const thumbStale = useRef(false);

  const refreshThumbnail = (id: number) => {
    // The first page: the Documents grid shows a board by it.
    const d = pageRef.current === 0 ? docRef.current : pagesRef.current[0];
    thumbStale.current = false;
    // The Documents grid shows boards by their preview.
    if (!isTauri() || !d.items.length) return;
    void renderBoardReady(d.items, d.background, 1, 480)
      .then((canvas) =>
        canvas.toBlob(
          (blob) =>
            void blob
              ?.arrayBuffer()
              .then((buf) => api.saveThumbnail(id, buf))
              .then(() => changed("thumbnails"))
              .catch(logged("board.thumbnail")),
          "image/jpeg",
          0.85,
        ),
      )
      .catch(logged("board.thumbnail"));
  };

  /**
   * `quiet`: no « Enregistré » (quitting, closing). `autosave`: the timer,
   * while the teacher draws: no preview, and edits minutes apart share one
   * version.
   */
  const saveOnce = async (quiet: boolean, autosave: boolean) => {
    // Not while the teacher types in a text box: it would close it.
    if (editing && !autosave) commitText();
    const d = docRef.current;
    try {
      const f = await api.saveBoard({
        file_id: fileIdRef.current ?? null,
        course_id: courseId,
        json: boardJson(allPages(), pageRef.current),
        autosave,
      });
      if (!f?.id) throw new Error(tr("messages.genericError"));
      const created = fileIdRef.current == null;
      fileIdRef.current = f.id;
      setCurrentFileId(f.id);
      if (created) tabs.retarget(tabId, `whiteboard:${f.id}`, f.name, { fileId: f.id, isNew: false });
      else tabs.rename(tabId, f.name);
      if (!loggedSave.current) {
        api.logEvent("whiteboard_save", f.name, courseId);
        loggedSave.current = true;
      }
      // What was drawn while the save ran is still to save.
      if (docRef.current === d) setDirty(false);
      autosaveFailed.current = false;
      if (!quiet) toast(tr("whiteboard.saved"), "success");
      changed("library");
      api.getFileVersions(f.id).then(setVersions).catch(logged("board.versions"));
      if (autosave) thumbStale.current = true;
      else refreshThumbnail(f.id);
    } catch (err) {
      reportError("board.save", err);
      // Once per run of failures: the timer would say it every few seconds.
      if (!autosave || !autosaveFailed.current)
        toast(errorMessage(err, tr("messages.genericError")), "error");
      if (autosave) autosaveFailed.current = true;
      throw err;
    }
  };
  const saveOnceRef = useRef(saveOnce);
  useEffect(() => {
    saveOnceRef.current = saveOnce;
  });
  /** One save after another, each with the board as it is when it runs. */
  const save = (quiet = false, autosave = false) => {
    const next = () => saveOnceRef.current(quiet, autosave);
    const run = saving.current.then(next, next);
    saving.current = run.catch(() => undefined);
    return run;
  };

  useEffect(() => {
    editors.setDirty(tabId, dirty);
    return () => editors.setDirty(tabId, false);
  }, [tabId, dirty]);
  // Quitting with « Enregistrer » saves without a toast.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => editors.registerFlush(tabId, () => saveRef.current(true), { autosaves: true }), [tabId]);
  useAutosave({ dirty, change: doc, visible, save: () => save(true, true).catch(() => undefined) });
  // Leaving the board (another tab, another program, closing it): its preview
  // catches up with what the timer saved.
  useEffect(() => {
    const catchUp = () => {
      if (thumbStale.current && fileIdRef.current != null) refreshThumbnail(fileIdRef.current);
    };
    if (!visible) catchUp();
    window.addEventListener("blur", catchUp);
    return () => {
      window.removeEventListener("blur", catchUp);
      catchUp();
    };
  }, [visible]);
  useShortcut("save", () => void save().catch(() => undefined), active);

  const exportPng = async () => {
    const d = docRef.current;
    try {
      const canvas = await renderBoardReady(d.items, d.background, 2);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error(tr("messages.genericError"));
      const name = pagesRef.current.length > 1 ? `${title()} - page ${pageRef.current + 1}` : title();
      const f = await api.createFileBytes(`${name}.png`, await blob.arrayBuffer(), { courseId });
      changed("library");
      toast(tr("board.exported", { name: f.name }), "success", {
        action: { label: tr("print.open"), run: () => openFile(f) },
      });
    } catch (err) {
      reportError("board.exportPng", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    }
  };

  const exportPdf = async () => {
    // One sheet of paper per page with something on it.
    const sheets = allPages().filter((s, i) => s.items.length || i === pageRef.current);
    const images: string[] = [];
    for (const s of sheets)
      images.push((await renderBoardReady(s.items, s.background, 2.5)).toDataURL("image/png"));
    flushSync(() => setPrintImages(images));
    try {
      await sheetReady();
      if (!isTauri()) {
        await printDialog();
        return;
      }
      try {
        const f = await api.printToPdf(title(), courseId);
        changed("library");
        toast(tr("print.saved", { name: f.name }), "success", {
          action: { label: tr("print.open"), run: () => openFile(f) },
        });
      } catch (err) {
        reportError("board.exportPdf", err);
        toast(tr("print.fallback"), "info");
        await printDialog();
      }
    } finally {
      setPrintImages([]);
    }
  };

  /** Everything on the page shown. */
  const clearAll = async () => {
    if (!docRef.current.items.length) return;
    const several = pagesRef.current.length > 1;
    const ok = await confirm.ask({
      title: tr(several ? "board.clearPageTitle" : "board.clearTitle"),
      message: tr("board.clearMessage"),
      confirmLabel: tr(several ? "board.clearPage" : "board.clear"),
      danger: true,
    });
    if (ok) commit({ ...docRef.current, items: [] });
  };

  const loadVersion = async (v: FileVersion) => {
    try {
      const res = await fetch(versionUrl(v.id));
      const b = parseBoard(await res.text());
      const before = step();
      showPages(sheetsOf(b), pageRef.current);
      remember(before);
      toast(tr("pdf.versionLoaded"), "success");
    } catch (err) {
      reportError("board.version", err);
      toast(errorMessage(err, tr("pdf.versionLoadError")), "error");
    }
  };

  const toggleInstrument = (kind: InstrumentKind) => {
    const at = instruments.findIndex((i) => i.kind === kind);
    if (at >= 0) setInstruments(instruments.filter((_, i) => i !== at));
    else setInstruments([...instruments, placeInstrument(kind, view, size.w, size.h, instruments)]);
  };

  // ---- view ------------------------------------------------------------------

  const moreItems: MenuEntry[] = [
    { label: tr("board.exportPng"), onSelect: () => void exportPng() },
    { label: tr("board.exportPdf"), onSelect: () => void exportPdf() },
    "separator",
    {
      label: tr(pages.length > 1 ? "board.clearPage" : "board.clear"),
      danger: true,
      disabled: !doc.items.length,
      onSelect: () => void clearAll(),
    },
    {
      label: tr("board.deletePage"),
      danger: true,
      disabled: pages.length < 2,
      onSelect: () => void deletePage(),
    },
  ];
  const versionItems: MenuEntry[] = versions
    .slice()
    .reverse()
    .map((v) => ({
      label: v.timestamp === "original" ? tr("pdf.original") : `v${v.version} · ${v.created_at.slice(0, 16)}`,
      onSelect: () => void loadVersion(v),
    }));

  const swatches = (list: string[], value: string, set: (c: string) => void) => (
    <ToolGroup className="gap-2" label={tr("board.color")}>
      {list.map((c) => (
        <button
          key={c}
          type="button"
          className="eu-board-swatch"
          style={{ background: c }}
          aria-pressed={value === c}
          aria-label={tr(COLOR_NAMES[c])}
          {...tip(tr(COLOR_NAMES[c]))}
          onClick={() => set(c)}
        />
      ))}
    </ToolGroup>
  );
  const choice = <T extends number>(
    options: readonly { value: T; label: StringKey }[],
    value: number,
    set: (v: T) => void,
  ) => (
    <ToolGroup label={tr("board.size")}>
      <div className="eu-segment eu-segment-sm">
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => set(o.value)}>
            {tr(o.label)}
          </button>
        ))}
      </div>
    </ToolGroup>
  );

  const selectedItem = selected ? (doc.items.find((i) => i.id === selected) ?? null) : null;
  let context: React.ReactNode;
  if (tool === "pen" || tool === "segment" || tool === "circle" || tool === "rect")
    context = (
      <>
        {swatches(COLORS, color, setColor)}
        {choice(WIDTHS, width, setWidth)}
      </>
    );
  else if (tool === "highlighter") context = swatches(HIGHLIGHTS, highlight, setHighlight);
  else if (tool === "point") context = swatches(COLORS, color, setColor);
  else if (tool === "text" || tool === "math")
    context = (
      <>
        {swatches(COLORS, color, setColor)}
        {choice(TEXT_SIZES, textSize, setTextSize)}
        {tool === "math" && <span className="eu-t-caption truncate">{tr("board.mathHint")}</span>}
      </>
    );
  else if (tool === "select")
    context = selectedItem ? (
      <ToolGroup className="gap-1 min-w-0" label={tr("board.select")}>
        {selectedItem.kind === "math" && (
          <button type="button" className="eu-btn-ghost eu-btn-sm" onClick={editSelectedMath}>
            <Icon icon={Pencil} size={14} />
            {tr("board.editMath")}
          </button>
        )}
        <button type="button" className="eu-btn-ghost eu-btn-sm hover:text-danger" onClick={removeSelected}>
          <Icon icon={Trash2} size={14} />
          {tr("board.removeSelected")}
        </button>
        <span className="eu-t-caption truncate">{tr("board.selectedHint")}</span>
      </ToolGroup>
    ) : (
      <span className="eu-t-caption truncate">{tr("board.selectHint")}</span>
    );
  else if (tool === "plot")
    context = (
      <ToolGroup className="gap-2 min-w-0" label={tr("board.plot")}>
        <span className="eu-t-body font-medium text-ink whitespace-nowrap">f(x) =</span>
        <input
          className={`eu-input eu-field-sm w-56 font-mono ${plotError ? "border-danger" : ""}`}
          value={plotExpr}
          placeholder="2x² − 3x + 1"
          onChange={(e) => {
            setPlotExpr(e.target.value);
            setPlotError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && addPlot()}
          aria-label={tr("board.plotInput")}
          aria-invalid={!!plotError}
          {...tip(plotError || tr("board.plotHint"))}
        />
        <button className="eu-btn-primary eu-btn-sm" onClick={addPlot} disabled={!plotExpr.trim()}>
          {tr("board.plotDraw")}
        </button>
        {swatches(COLORS, color, setColor)}
      </ToolGroup>
    );
  else
    context = (
      <span className="eu-t-caption truncate">
        {tool === "eraser" ? tr("board.eraserHint") : tr("board.handHint")}
      </span>
    );

  const zoomPercent = `${Math.round(view.zoom * 100)} %`;
  const cursor = panning
    ? "grabbing"
    : tool === "hand"
      ? "grab"
      : tool === "select"
        ? "default"
        : tool === "text" || tool === "math"
          ? "text"
          : tool === "eraser"
            ? "cell"
            : "crosshair";
  // The selection's frame, in the board's pixels.
  const selectedBox = selectedItem && tool === "select" ? boundsOf(selectedItem) : null;

  return (
    <div className="h-full flex flex-col min-h-0">
      <Toolbar className="h-11 py-0">
        {context}
        <ToolSpacer />
        <ToolGroup collapse label={tr("board.background")}>
          <MenuButton
            label={tr("board.background")}
            className="eu-btn-quiet eu-btn-sm"
            items={BACKGROUNDS.map((b) => ({
              label: `${doc.background === b.value ? "✓ " : ""}${tr(b.label)}`,
              onSelect: () =>
                doc.background !== b.value && commit({ ...docRef.current, background: b.value }),
            }))}
          >
            <Icon icon={Grid3x3} size={14} />
            <span className="hidden @3xl:inline">
              {tr(BACKGROUNDS.find((b) => b.value === doc.background)!.label)}
            </span>
          </MenuButton>
        </ToolGroup>
        <ToolGroup collapse className="gap-0" label={tr("board.zoom")}>
          <button
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
            onClick={() => zoomAt(1 / 1.25, size.w / 2, size.h / 2)}
            aria-label={tr("board.zoomOut")}
            data-tip={tr("board.zoomOut")}
          >
            <Icon icon={ZoomOut} size={14} />
          </button>
          <button
            className="eu-btn-quiet eu-btn-sm tabular-nums w-16"
            onClick={() => zoomAt(1 / view.zoom, size.w / 2, size.h / 2)}
            data-tip={tr("board.zoomReset")}
          >
            {zoomPercent}
          </button>
          <button
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
            onClick={() => zoomAt(1.25, size.w / 2, size.h / 2)}
            aria-label={tr("board.zoomIn")}
            data-tip={tr("board.zoomIn")}
          >
            <Icon icon={ZoomIn} size={14} />
          </button>
          <button
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
            onClick={() => fit()}
            aria-label={tr("board.fit")}
            data-tip={tr("board.fit")}
          >
            <Icon icon={Maximize} size={14} />
          </button>
        </ToolGroup>
        <ToolGroup className="gap-0" label={tr("board.pages")}>
          {pages.length > 1 && (
            <>
              <button
                className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                onClick={() => void goTo(page - 1)}
                disabled={page === 0}
                aria-label={tr("board.prevPage")}
                {...tip(tr("board.prevPage"), "PageUp")}
              >
                <Icon icon={ChevronLeft} size={14} />
              </button>
              <span
                className="eu-t-meta tabular-nums px-1 whitespace-nowrap"
                aria-label={tr("board.pageOf", { n: page + 1, count: pages.length })}
              >
                {page + 1} / {pages.length}
              </span>
              <button
                className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                onClick={() => void goTo(page + 1)}
                disabled={page === pages.length - 1}
                aria-label={tr("board.nextPage")}
                {...tip(tr("board.nextPage"), "PageDown")}
              >
                <Icon icon={ChevronRight} size={14} />
              </button>
            </>
          )}
          <button
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
            onClick={addPage}
            aria-label={tr("board.addPage")}
            data-tip={tr("board.addPage")}
          >
            <Icon icon={FilePlus2} size={14} />
          </button>
        </ToolGroup>
        <ToolGroup className="gap-0" label={tr("board.history")}>
          <button
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
            onClick={undo}
            disabled={!history.past.length}
            aria-label={tr("board.undo")}
            {...tip(tr("board.undo"), "mod+Z")}
          >
            <Icon icon={Undo2} size={14} />
          </button>
          <button
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
            onClick={redo}
            disabled={!history.future.length}
            aria-label={tr("board.redo")}
            {...tip(tr("board.redo"), "mod+Y")}
          >
            <Icon icon={Redo2} size={14} />
          </button>
        </ToolGroup>
        <ToolGroup collapse label={tr("notes.courseTitle")}>
          <select
            className="eu-select eu-field-sm w-[140px]"
            value={courseId ?? ""}
            onChange={(e) => {
              setCourseId(e.target.value ? Number(e.target.value) : null);
              setDirty(true);
            }}
            aria-label={tr("notes.courseTitle")}
            data-tip={tr("notes.courseTitle")}
          >
            <option value="">{tr("notes.general")}</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </ToolGroup>
        <ToolGroup className="gap-1" label={tr("common.save")}>
          {versionItems.length > 0 && (
            <MenuButton label={tr("pdf.versions")} items={versionItems}>
              <Icon icon={History} size={14} />
            </MenuButton>
          )}
          <MenuButton label={tr("common.more")} items={moreItems}>
            <Icon icon={Ellipsis} size={14} />
          </MenuButton>
          <button
            onClick={() => void save().catch(() => undefined)}
            disabled={!dirty && !!currentFileId}
            className="eu-btn-primary eu-btn-sm"
            {...tip(tr("common.save"), keysOf("save"))}
          >
            {tr("common.save")}
          </button>
        </ToolGroup>
      </Toolbar>

      <div
        ref={wrapRef}
        className="eu-board"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => !gesture.current && drawLive(null, null)}
      >
        <canvas ref={bgRef} aria-hidden />
        <canvas ref={inkRef} role="img" aria-label={tr("app.tabWhiteboard")} />
        <canvas ref={liveRef} aria-hidden />
        <InstrumentLayer
          instruments={instruments}
          view={view}
          color={color}
          width={width}
          onChange={(i, next) => setInstruments(instruments.map((x, j) => (j === i ? next : x)))}
          onClose={(i) => setInstruments(instruments.filter((_, j) => j !== i))}
          onDraw={(item) => commit({ ...docRef.current, items: [...docRef.current.items, item] })}
          snapPoint={(p) => snapped(p)}
        />
        {editing && (
          <textarea
            ref={textRef}
            className="eu-board-text"
            value={editing.text}
            style={{
              left: (editing.p.x - view.x) * view.zoom,
              top: (editing.p.y - view.y) * view.zoom,
              fontSize: editing.size * view.zoom,
              color: editing.color,
            }}
            rows={Math.max(1, editing.text.split("\n").length)}
            onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(null);
              else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commitText();
              }
            }}
            aria-label={tr("board.text")}
          />
        )}
        {selectedItem && selectedBox && (
          <div
            className="eu-board-selection"
            style={{
              left: (selectedBox.x0 - view.x) * view.zoom - 4,
              top: (selectedBox.y0 - view.y) * view.zoom - 4,
              width: (selectedBox.x1 - selectedBox.x0) * view.zoom + 8,
              height: (selectedBox.y1 - selectedBox.y0) * view.zoom + 8,
            }}
          >
            {resizable(selectedItem) && (
              <div
                className="eu-board-handle"
                aria-hidden
                onPointerDown={(e) => {
                  e.stopPropagation();
                  wrapRef.current?.setPointerCapture(e.pointerId);
                  pointers.current.set(e.pointerId, screenOf(e));
                  gesture.current = { type: "resize", id: selectedItem.id, base: docRef.current };
                }}
              />
            )}
          </div>
        )}
        {editingMath && (
          <div
            className="eu-board-math"
            style={{
              left: (editingMath.p.x - view.x) * view.zoom,
              top: (editingMath.p.y - view.y) * view.zoom,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div
              className="eu-board-math-preview"
              style={{ fontSize: editingMath.size * view.zoom, color: editingMath.color }}
              // KaTeX's own markup, from the formula typed here.
              dangerouslySetInnerHTML={{
                __html: katex.renderToString(editingMath.tex || "\\phantom{x}", {
                  displayMode: true,
                  throwOnError: false,
                  output: "html",
                }),
              }}
            />
            <input
              ref={mathRef}
              className={`eu-input eu-field-sm font-mono ${mathError ? "border-danger" : ""}`}
              value={editingMath.tex}
              placeholder={"\\frac{1}{2}, \\sqrt{x}, \\vec{u}"}
              spellCheck={false}
              onChange={(e) => {
                setEditingMath({ ...editingMath, tex: e.target.value });
                setMathError("");
              }}
              onBlur={() => void commitMath()}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setEditingMath(null);
                  setMathError("");
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  void commitMath();
                }
              }}
              aria-label={tr("board.mathInput")}
              aria-invalid={!!mathError}
              aria-describedby={mathError ? "eu-board-math-error" : undefined}
            />
            {mathError && (
              <div id="eu-board-math-error" className="eu-board-math-error" role="alert">
                <p>{tr("board.mathError")}</p>
                {/* KaTeX's own words, in English, for the place of the mistake. */}
                <p className="font-mono opacity-80" lang="en">
                  {mathError}
                </p>
              </div>
            )}
          </div>
        )}

        <div
          ref={paletteRef}
          className="eu-board-palette"
          data-fold={fold || undefined}
          role="toolbar"
          aria-orientation="vertical"
          aria-label={tr("board.tools")}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {TOOLS.map((group, gi) => (
            <div key={gi} className="eu-board-palette-group">
              {group.map((t) => (
                <button
                  key={t.tool}
                  type="button"
                  className="eu-btn-quiet eu-btn-icon eu-btn-toggle"
                  aria-pressed={tool === t.tool}
                  aria-label={tr(t.label)}
                  data-tip={tr(t.label)}
                  data-tip-place="right"
                  onClick={() => {
                    if (editing) commitText();
                    if (editingMath) void commitMath();
                    if (t.tool !== "select") setSelected(null);
                    setTool(t.tool);
                    drawLive(null, null);
                  }}
                >
                  <Icon icon={t.icon} size={16} />
                </button>
              ))}
            </div>
          ))}
          <div className="eu-board-palette-group">
            <button
              type="button"
              className="eu-btn-quiet eu-btn-icon"
              aria-label={tr("board.picture")}
              data-tip={tr("board.pictureTip")}
              data-tip-place="right"
              onClick={() => pickerRef.current?.click()}
            >
              <Icon icon={ImagePlus} size={16} />
            </button>
            <input
              ref={pickerRef}
              type="file"
              accept={PICTURE_TYPES.join(",")}
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                void addPictures(files);
              }}
            />
          </div>
          <div className="eu-board-palette-group">
            {INSTRUMENTS.map((ins) => (
              <button
                key={ins.kind}
                type="button"
                className="eu-btn-quiet eu-btn-icon eu-btn-toggle eu-board-out"
                aria-pressed={instruments.some((i) => i.kind === ins.kind)}
                aria-label={tr(ins.label)}
                data-tip={tr(ins.label)}
                data-tip-place="right"
                onClick={() => toggleInstrument(ins.kind)}
              >
                {ins.icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {printImages.length > 0 &&
        createPortal(
          <div className="eu-print" data-theme="light" aria-hidden>
            {printImages.map((src, i) => (
              <img key={i} src={src} alt="" className="eu-print-board" />
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
