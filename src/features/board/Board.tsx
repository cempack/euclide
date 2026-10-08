import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { changed } from "../../api/client";
import { createPortal, flushSync } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Circle as CircleIcon,
  Crosshair,
  DraftingCompass,
  Ellipsis,
  Eraser,
  Grid3x3,
  Hand,
  Highlighter,
  History,
  Maximize,
  PenLine,
  Redo2,
  Ruler,
  Slash,
  Square,
  SquareFunction,
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
import { api, isTauri, versionUrl, type FileVersion } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { openFile } from "../../lib/files";
import { tr, type StringKey } from "../../lib/i18n";
import { keysOf, useShortcut } from "../../lib/keymap";
import { logged, reportError } from "../../lib/report";
import { editors } from "../../stores/editors";
import { tabs, useActiveId } from "../../stores/tabs";
import { Icon } from "../../ui/Icon";
import { MenuButton, type MenuEntry } from "../../ui/Menu";
import { tip } from "../../ui/Tooltip";
import { printDialog, sheetReady } from "../notes/PrintSheet";
import { compile } from "./expr";
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
  boundsOf,
  contentBounds,
  dist,
  distanceTo,
  gridStep,
  newId,
  nextLabel,
  parseBoard,
  snap,
  type Background,
  type Item,
  type P,
  type Text,
  type View,
} from "./model";
import { drawBackground, drawItem, drawItems, plotFunction, renderBoard } from "./render";

type Tool =
  "hand" | "pen" | "highlighter" | "eraser" | "segment" | "circle" | "rect" | "point" | "text" | "plot";

interface Doc {
  items: Item[];
  background: Background;
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
  | { type: "pinch"; d0: number; mid0: P; from: View };

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
  const [history, setHistory] = useState<{ past: Doc[]; future: Doc[] }>({ past: [], future: [] });
  const [view, setView] = useState<View>({ x: -3 * CM, y: -2 * CM, zoom: 1 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [highlight, setHighlight] = useState(HIGHLIGHTS[0]);
  const [width, setWidth] = useState<number>(WIDTHS[1].value);
  const [textSize, setTextSize] = useState<number>(TEXT_SIZES[1].value);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [editing, setEditing] = useState<{ p: P; text: string; size: number; color: string } | null>(null);
  const [plotExpr, setPlotExpr] = useState("");
  const [plotError, setPlotError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [currentFileId, setCurrentFileId] = useState(fileId);
  const [courseId, setCourseId] = useState<number | null>(initialCourseId ?? null);
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [printImage, setPrintImage] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);

  // The latest values, for pointer handlers and the save that quitting asks for.
  const docRef = useRef(doc);
  const viewRef = useRef(view);
  const sizeRef = useRef(size);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, P>());
  const spaceDown = useRef(false);
  const placed = useRef(false);
  useEffect(() => {
    docRef.current = doc;
    viewRef.current = view;
    sizeRef.current = size;
  });

  /** A change the teacher can undo. */
  const commit = (next: Doc) => {
    const prev = docRef.current;
    docRef.current = next;
    setDoc(next);
    setHistory((h) => ({ past: [...h.past.slice(-99), prev], future: [] }));
    setDirty(true);
  };
  const undo = () => {
    const prev = history.past[history.past.length - 1];
    if (!prev) return;
    setHistory({ past: history.past.slice(0, -1), future: [docRef.current, ...history.future] });
    docRef.current = prev;
    setDoc(prev);
    setDirty(true);
  };
  const redo = () => {
    const next = history.future[0];
    if (!next) return;
    setHistory({ past: [...history.past, docRef.current], future: history.future.slice(1) });
    docRef.current = next;
    setDoc(next);
    setDirty(true);
  };

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
        const d = { items: b.items, background: b.background };
        docRef.current = d;
        setDoc(d);
        setHistory({ past: [], future: [] });
        setDirty(false);
        if (b.view) {
          placed.current = true;
          changeView(b.view);
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
    if (bg) drawBackground(bg, doc.background, view, w, h, dpr);
    if (ink) drawItems(ink, doc.items, view, w, h, dpr, boundsOf);
  }, [doc, view, size, dpr, visible]);

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
      if (g.removed.has(item.id) || (item.kind === "ink" && item.erase)) continue;
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
    else if (g.type === "ink") {
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

  const title = () =>
    tabs
      .list()
      .find((t) => t.id === tabId)
      ?.title?.replace(/\.euboard$/i, "") || tr("app.tabWhiteboard");

  const save = async (quiet = false) => {
    if (editing) commitText();
    const d = docRef.current;
    try {
      const f = await api.saveBoard({
        file_id: currentFileId ?? null,
        course_id: courseId,
        json: JSON.stringify({ version: 3, background: d.background, items: d.items, view: viewRef.current }),
      });
      if (!f?.id) throw new Error(tr("messages.genericError"));
      setCurrentFileId(f.id);
      if (!currentFileId) tabs.retarget(tabId, `whiteboard:${f.id}`, f.name, { fileId: f.id, isNew: false });
      else tabs.rename(tabId, f.name);
      api.logEvent("whiteboard_save", f.name, courseId);
      setDirty(false);
      if (!quiet) toast(tr("whiteboard.saved"), "success");
      changed("library");
      api.getFileVersions(f.id).then(setVersions).catch(logged("board.versions"));
      // The Documents grid shows boards by their preview.
      if (isTauri() && d.items.length) {
        renderBoard(d.items, d.background, 1, 480).toBlob(
          (blob) =>
            void blob
              ?.arrayBuffer()
              .then((buf) => api.saveThumbnail(f.id, buf))
              .then(() => changed("thumbnails"))
              .catch(logged("board.thumbnail")),
          "image/jpeg",
          0.85,
        );
      }
    } catch (err) {
      reportError("board.save", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
      throw err;
    }
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
  useEffect(() => editors.registerFlush(tabId, () => saveRef.current(true)), [tabId]);
  useShortcut("save", () => void save().catch(() => undefined), active);

  const exportPng = async () => {
    const d = docRef.current;
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        renderBoard(d.items, d.background, 2).toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error(tr("messages.genericError"));
      const f = await api.createFileBytes(`${title()}.png`, await blob.arrayBuffer(), { courseId });
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
    const d = docRef.current;
    flushSync(() => setPrintImage(renderBoard(d.items, d.background, 2.5).toDataURL("image/png")));
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
      setPrintImage(null);
    }
  };

  const clearAll = async () => {
    if (!docRef.current.items.length) return;
    const ok = await confirm.ask({
      title: tr("board.clearTitle"),
      message: tr("board.clearMessage"),
      confirmLabel: tr("board.clear"),
      danger: true,
    });
    if (ok) commit({ ...docRef.current, items: [] });
  };

  const loadVersion = async (v: FileVersion) => {
    try {
      const res = await fetch(versionUrl(v.id));
      const b = parseBoard(await res.text());
      commit({ items: b.items, background: b.background });
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
    { label: tr("board.clear"), danger: true, disabled: !doc.items.length, onSelect: () => void clearAll() },
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
  else if (tool === "text")
    context = (
      <>
        {swatches(COLORS, color, setColor)}
        {choice(TEXT_SIZES, textSize, setTextSize)}
      </>
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
      : tool === "text"
        ? "text"
        : tool === "eraser"
          ? "cell"
          : "crosshair";

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

        <div
          className="eu-board-palette"
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
                  className="eu-btn-toggle eu-btn-icon"
                  aria-pressed={tool === t.tool}
                  aria-label={tr(t.label)}
                  data-tip={tr(t.label)}
                  data-tip-place="right"
                  onClick={() => {
                    if (editing) commitText();
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
            {INSTRUMENTS.map((ins) => (
              <button
                key={ins.kind}
                type="button"
                className="eu-btn-toggle eu-btn-icon eu-board-out"
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

      {printImage &&
        createPortal(
          <div className="eu-print" data-theme="light" aria-hidden>
            <img src={printImage} alt="" className="eu-print-board" />
          </div>,
          document.body,
        )}
    </div>
  );
}
