import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { changed } from "../../api/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Brush,
  ChevronDown,
  ChevronUp,
  Circle,
  Eraser,
  FileDown,
  FileOutput,
  FilePlus,
  Files,
  Grid3x3,
  Highlighter,
  History,
  Minus,
  MousePointer2,
  MoveUpRight,
  PanelLeft,
  PenLine,
  Plus,
  Presentation as PresentIcon,
  Printer,
  Redo2,
  RotateCcw,
  RotateCw,
  ScanLine,
  Search,
  Shapes,
  Slash,
  Square,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  Undo2,
  X,
} from "lucide-react";
import { api, fileUrl, versionUrl, type FileVersion } from "../../lib/api";
import { q } from "../../api/queries";
import { errorMessage } from "../../lib/errors";
import { openFile } from "../../lib/files";
import { tr, type StringKey } from "../../lib/i18n";
import { keysOf, useShortcut } from "../../lib/keymap";
import { logged, reportError } from "../../lib/report";
import { editors } from "../../stores/editors";
import { useConfirm, useToast } from "../../components/ui";
import { OpenWithButton } from "../../components/OpenWithButton";
import { Toolbar, ToolGroup, ToolSep, ToolSpacer } from "../../components/layout";
import { Icon } from "../../ui/Icon";
import type { LucideIcon } from "lucide-react";
import { Menu, type MenuEntry } from "../../ui/Menu";
import { tip } from "../../ui/Tooltip";
import { ColorChoice } from "./ColorChoice";
import { HIGHLIGHT, INK } from "./palette";
import { PdfView, type FindState, type PdfTool, type PdfViewHandle, type PrintPage } from "./PdfView";
import { printDialog, sheetReady } from "../notes/PrintSheet";
import { ImageView } from "./ImageView";
import { Presentation } from "./Presentation";
import { editPages, pagesLabel, parsePages, type PageEdit } from "./pageEdits";

const isImage = (name: string) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);

/** A document tab: a PDF (PDFium, annotated with EmbedPDF) or an image (drawn over). */
export default function DocumentPane({
  tabId,
  fileId,
  fileName,
  courseId = null,
  visible = true,
}: {
  tabId: string;
  fileId: number;
  fileName: string;
  /** The file's course, where the tab knows it: copies go beside the file. */
  courseId?: number | null;
  /** The tab is in front. */
  visible?: boolean;
}) {
  return isImage(fileName) ? (
    <ImageView tabId={tabId} fileId={fileId} fileName={fileName} />
  ) : (
    <PdfPane tabId={tabId} fileId={fileId} fileName={fileName} courseId={courseId} visible={visible} />
  );
}

/** "20261003_140512" → "3 oct. 2026, 14:05". */
function versionDate(v: FileVersion): string {
  if (v.timestamp === "original") return tr("pdf.original");
  const m = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/.exec(v.timestamp);
  if (!m) return v.label || v.timestamp;
  const date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return date.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The pen's widths, in points: what « Fin », « Moyen » and « Épais » draw on the page. */
const SIZES: { value: number; label: StringKey; dot: number }[] = [
  { value: 1, label: "board.thin", dot: 4 },
  { value: 2, label: "board.medium", dot: 7 },
  { value: 4, label: "board.thick", dot: 11 },
];

/** What the zoom menu offers besides fitting the page. */
const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

const TOOLS: { id: PdfTool; icon: LucideIcon; label: StringKey; hint: StringKey }[] = [
  { id: "select", icon: MousePointer2, label: "pdf.select", hint: "pdf.selectTitle" },
  { id: "pen", icon: PenLine, label: "pdf.pen", hint: "pdf.penTitle" },
  { id: "highlight", icon: Highlighter, label: "pdf.highlight", hint: "pdf.highlightTitle" },
  { id: "text", icon: Type, label: "pdf.text", hint: "pdf.textTitle" },
];

/** Drawn by dragging, in the pen's colour and width. */
const SHAPE_TOOLS: { id: PdfTool; icon: LucideIcon; label: StringKey }[] = [
  { id: "line", icon: Slash, label: "pdf.line" },
  { id: "arrow", icon: MoveUpRight, label: "pdf.arrow" },
  { id: "rect", icon: Square, label: "pdf.rect" },
  { id: "ellipse", icon: Circle, label: "pdf.ellipse" },
];
const isShape = (tool: PdfTool) => SHAPE_TOOLS.some((s) => s.id === tool);

/**
 * What the « Surligneur » does: mark the text it is dragged over (free-hand
 * away from text), underline it, strike it out, or draw free-hand anywhere.
 */
const MARKUP_TOOLS: { id: PdfTool; icon: LucideIcon; label: StringKey }[] = [
  { id: "highlight", icon: Highlighter, label: "pdf.markText" },
  { id: "underline", icon: Underline, label: "pdf.underline" },
  { id: "strikeout", icon: Strikethrough, label: "pdf.strikeout" },
  { id: "marker", icon: Brush, label: "pdf.marker" },
];
const isMarkup = (tool: PdfTool) => MARKUP_TOOLS.some((m) => m.id === tool);
/** In the highlighter's colours; a line under or through text takes the pen's. */
const usesMarker = (tool: PdfTool) => tool === "highlight" || tool === "marker";

function PdfPane({
  tabId,
  fileId,
  fileName,
  courseId,
  visible,
}: {
  tabId: string;
  fileId: number;
  fileName: string;
  courseId: number | null;
  visible: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const viewRef = useRef<PdfViewHandle>(null);
  const [tool, setTool] = useState<PdfTool>("select");
  const [ink, setInk] = useState(INK[2].value);
  const [marker, setMarker] = useState(HIGHLIGHT[0].value);
  const [size, setSize] = useState(SIZES[1].value);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [zoomAnchor, setZoomAnchor] = useState<HTMLElement | null>(null);
  const [shapesAnchor, setShapesAnchor] = useState<HTMLElement | null>(null);
  /** The shape the « Formes » button shows: the last one picked. */
  const [shape, setShape] = useState<PdfTool>("line");
  /** What the « Surligneur » button takes up again: the last one picked. */
  const [markup, setMarkup] = useState<PdfTool>("highlight");
  /** The search bar: open or not, what it looks for, what was found. */
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<FindState>({ query: "", total: 0, current: 0, searching: false });
  const findRef = useRef<HTMLInputElement>(null);
  /** The pages to put in a new document, as typed; null while the bar is closed. */
  const [extractText, setExtractText] = useState<string | null>(null);
  const [extractBad, setExtractBad] = useState(false);
  const extractId = useId();
  /** The page count, once the document is open. */
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [pageText, setPageText] = useState("1");
  const [scale, setScale] = useState(1);
  const [showPages, setShowPages] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  /** The viewer asks for the document's password. */
  const [locked, setLocked] = useState(false);
  /** Shown one page at a time to the whole screen (Presentation.tsx). */
  const [presenting, setPresenting] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  /** The page the view opens at after a change to the pages: the one changed. */
  const [landing, setLanding] = useState(0);
  /** The file's address, taken again after a restore (the file changed underneath). */
  const [current, setCurrent] = useState(() => ({ url: fileUrl(fileId), revision: 0 }));
  /** An older version shown instead of the file (read-only). */
  const [viewing, setViewing] = useState<FileVersion | null>(null);
  const [versionsAnchor, setVersionsAnchor] = useState<HTMLElement | null>(null);
  // New annotations carry the teacher's name, as in other PDF readers.
  const author = (useQuery(q.setting("teacher_display_name")).data ?? "").trim();
  const versions = useQuery({
    queryKey: ["library", "versions", fileId],
    queryFn: () => api.getFileVersions(fileId),
  });

  useEffect(() => {
    editors.setDirty(tabId, dirty);
  }, [tabId, dirty]);

  const save = useCallback(async () => {
    const view = viewRef.current;
    if (!view || viewing) return;
    setSaving(true);
    try {
      const bytes = await view.save();
      // The file is replaced; what it was becomes a version (write_file_bytes).
      if (bytes) await api.writeFileBytes(fileId, bytes);
      view.markSaved();
      void queryClient.invalidateQueries({ queryKey: ["library", "versions", fileId] });
      changed("library");
    } catch (err) {
      reportError("pdf.save", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
      throw err;
    } finally {
      setSaving(false);
    }
  }, [fileId, queryClient, toast, viewing]);

  useEffect(() => editors.registerFlush(tabId, save), [tabId, save]);

  /** An old version takes the view's place: unsaved annotations first. */
  const openVersion = async (v: FileVersion) => {
    if (dirty && !viewing) {
      const choice = await confirm.dirty({
        title: tr("confirm.unsavedTitle"),
        message: tr("pdf.unsavedVersionMessage"),
      });
      if (choice === "cancel") return;
      if (choice === "save") {
        try {
          await save();
        } catch {
          return; // save() said why
        }
      }
      setDirty(false);
    }
    setViewing(v);
  };

  const restore = async (v: FileVersion) => {
    try {
      const res = await fetch(versionUrl(v.id));
      if (!res.ok) throw new Error(await res.text());
      await api.writeFileBytes(fileId, new Uint8Array(await res.arrayBuffer()));
      setViewing(null);
      setDirty(false);
      setCurrent((c) => ({ url: fileUrl(fileId), revision: c.revision + 1 }));
      void queryClient.invalidateQueries({ queryKey: ["library", "versions", fileId] });
      changed("library");
      toast(tr("pdf.restored"), "success");
    } catch (err) {
      reportError("pdf.restore", err);
      toast(errorMessage(err, tr("pdf.versionLoadError")), "error");
    }
  };

  const url = viewing ? versionUrl(viewing.id) : current.url;
  // Each document gets a view of its own (a restored file is a new document).
  const viewKey = viewing ? `version:${viewing.id}` : `file:${current.revision}`;
  // Another document in the view: the last one is closed, forget it.
  const [docFor, setDocFor] = useState(viewKey);
  if (docFor !== viewKey) {
    setDocFor(viewKey);
    setPages(0);
    setLocked(false);
    setHistory({ canUndo: false, canRedo: false });
    setFinding(false);
    setQuery("");
  }
  const count = pages;
  const color = usesMarker(tool) ? marker : ink;
  const versionItems: MenuEntry[] = (versions.data ?? [])
    .slice()
    .reverse()
    .map((v) => ({ label: versionDate(v), icon: History, onSelect: () => void openVersion(v) }));
  const shapeItems: MenuEntry[] = SHAPE_TOOLS.map((s) => ({
    label: tr(s.label),
    icon: s.icon,
    onSelect: () => {
      setShape(s.id);
      setTool(s.id);
    },
  }));
  const shapeIcon = SHAPE_TOOLS.find((s) => s.id === shape)?.icon ?? Shapes;
  const zoomItems: MenuEntry[] = [
    { label: tr("pdf.zoomFit"), icon: ScanLine, onSelect: () => viewRef.current?.zoomTo("width") },
    { label: tr("pdf.zoomPage"), onSelect: () => viewRef.current?.zoomTo("page") },
    "separator",
    ...ZOOM_PRESETS.map((z) => ({
      label: `${Math.round(z * 100)} %`,
      onSelect: () => viewRef.current?.zoomTo(z),
    })),
    "separator",
    { label: tr("pdf.rotate"), icon: RotateCw, onSelect: () => viewRef.current?.rotate() },
  ];

  // Looks while it is typed, once the typing pauses: a long document is
  // searched page by page in PDFium's worker.
  useEffect(() => {
    if (!finding) return;
    const wait = window.setTimeout(() => viewRef.current?.find(query), 250);
    return () => window.clearTimeout(wait);
  }, [finding, query]);

  const openFind = () => {
    setExtractText(null);
    setFinding(true);
    // Once the bar is there.
    window.setTimeout(() => {
      findRef.current?.focus();
      findRef.current?.select();
    });
  };
  const closeFind = () => {
    setFinding(false);
    setQuery("");
    viewRef.current?.stopFind();
  };
  // Ctrl+F looks in the document while it is the tab in front, as in a PDF reader.
  useShortcut("documents", openFind, visible && !!pages);

  /** Pages being drawn for paper: how many of how many. */
  const [printing, setPrinting] = useState<{ done: number; total: number } | null>(null);
  const [sheet, setSheet] = useState<PrintPage[]>([]);
  const busyPrinting = useRef(false);
  /** The pages as they show, drawn for paper, then the system's print dialog. */
  const print = async () => {
    const view = viewRef.current;
    if (!view || !pages || busyPrinting.current) return;
    busyPrinting.current = true;
    setPrinting({ done: 0, total: pages });
    let drawn: PrintPage[] = [];
    try {
      drawn = await view.printPages((done, total) => setPrinting({ done, total }));
      flushSync(() => setSheet(drawn));
      await sheetReady();
      await printDialog();
    } catch (err) {
      reportError("pdf.print", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    } finally {
      setSheet([]);
      for (const p of drawn) URL.revokeObjectURL(p.url);
      setPrinting(null);
      busyPrinting.current = false;
    }
  };
  useShortcut("print", () => void print(), visible && !!pages);

  const present = () => {
    if (!pages) return;
    closeFind();
    setPresenting(true);
  };

  /** A copy with the annotations fixed in its pages, beside the file: for students. */
  const [copying, setCopying] = useState(false);
  const exportCopy = async () => {
    const view = viewRef.current;
    if (!view || !pages || copying) return;
    setCopying(true);
    try {
      const bytes = await view.flatCopy();
      const name = tr("pdf.copyName", { name: fileName.replace(/\.pdf$/i, "") });
      const f = await api.createFileBytes(name, bytes, { courseId });
      changed("library");
      toast(tr("pdf.copySaved", { name: f.name }), "success", {
        action: { label: tr("print.open"), run: () => openFile({ ...f, courseId: f.course_id }) },
      });
    } catch (err) {
      reportError("pdf.exportCopy", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    } finally {
      setCopying(false);
    }
  };

  // The « Pages » menu: a page turned, inserted or deleted is written as the
  // file's new content, with what is not saved yet; the content before stays
  // a version, which « Annuler » brings back.
  const [pagesAnchor, setPagesAnchor] = useState<HTMLElement | null>(null);
  const changingPages = useRef(false);
  const undoPages = async () => {
    const list = await api.getFileVersions(fileId);
    const before = list[list.length - 1];
    if (before) await restore(before);
  };
  const changePages = async (edit: PageEdit, done: StringKey, at: number) => {
    const view = viewRef.current;
    if (!view || viewing || changingPages.current) return;
    changingPages.current = true;
    try {
      const bytes = await editPages(await view.documentBytes(), edit);
      await api.writeFileBytes(fileId, bytes);
      setLanding(at);
      setDirty(false);
      setCurrent((c) => ({ url: fileUrl(fileId), revision: c.revision + 1 }));
      void queryClient.invalidateQueries({ queryKey: ["library", "versions", fileId] });
      changed("library");
      toast(tr(done), "success", { action: { label: tr("common.undo"), run: () => void undoPages() } });
    } catch (err) {
      reportError("pdf.pages", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    } finally {
      changingPages.current = false;
    }
  };
  const deletePage = async () => {
    const n = page;
    const ok = await confirm.ask({
      title: tr("pdf.deletePageTitle", { n }),
      message: tr("pdf.deletePageMessage"),
      confirmLabel: tr("common.delete"),
      danger: true,
    });
    if (ok) await changePages({ kind: "delete", page: n - 1 }, "pdf.pageDeleted", Math.min(n, pages - 1));
  };
  const extract = async () => {
    const view = viewRef.current;
    const list = parsePages(extractText ?? "", pages);
    if (!list) {
      setExtractBad(true);
      return;
    }
    if (!view || changingPages.current) return;
    changingPages.current = true;
    try {
      const bytes = await editPages(await view.documentBytes(), { kind: "extract", pages: list });
      const name = tr("pdf.extractName", { name: fileName.replace(/\.pdf$/i, ""), pages: pagesLabel(list) });
      const f = await api.createFileBytes(name, bytes, { courseId });
      changed("library");
      setExtractText(null);
      toast(tr("pdf.extracted", { name: f.name }), "success", {
        action: { label: tr("print.open"), run: () => openFile({ ...f, courseId: f.course_id }) },
      });
    } catch (err) {
      reportError("pdf.extract", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    } finally {
      changingPages.current = false;
    }
  };
  const pageItems: MenuEntry[] = [
    {
      label: tr("pdf.turnRight", { n: page }),
      icon: RotateCw,
      onSelect: () => void changePages({ kind: "rotate", page: page - 1, turn: 1 }, "pdf.pageTurned", page),
    },
    {
      label: tr("pdf.turnLeft", { n: page }),
      icon: RotateCcw,
      onSelect: () => void changePages({ kind: "rotate", page: page - 1, turn: -1 }, "pdf.pageTurned", page),
    },
    "separator",
    {
      label: tr("pdf.insertBlank", { n: page }),
      icon: FilePlus,
      onSelect: () =>
        void changePages({ kind: "insert", after: page - 1, paper: "blank" }, "pdf.pageInserted", page + 1),
    },
    {
      label: tr("pdf.insertSquared", { n: page }),
      icon: Grid3x3,
      onSelect: () =>
        void changePages({ kind: "insert", after: page - 1, paper: "squared" }, "pdf.pageInserted", page + 1),
    },
    "separator",
    {
      label: tr("pdf.extract"),
      icon: FileOutput,
      onSelect: () => {
        closeFind();
        setExtractBad(false);
        setExtractText(String(page));
      },
    },
    "separator",
    {
      label: tr("pdf.deletePage", { n: page }),
      icon: Trash2,
      danger: true,
      disabled: pages < 2,
      onSelect: () => void deletePage(),
    },
  ];
  // F5, as for a note's slides.
  useShortcut("present", present, visible && !!pages && !presenting);
  // A tab put away (Ctrl+1…) takes its presentation with it.
  if (presenting && !visible) setPresenting(false);

  const findStatus = found.searching
    ? tr("pdf.searching")
    : !found.query
      ? ""
      : found.total
        ? tr("pdf.searchCount", { current: found.current, total: found.total })
        : tr("pdf.searchNone");

  const goTo = (n: number) => {
    const target = Math.min(Math.max(1, n), count || 1);
    viewRef.current?.goTo(target);
    setPageText(String(target));
  };

  return (
    <div className="h-full flex flex-col">
      <Toolbar className="h-9 py-0">
        <ToolGroup>
          <button
            type="button"
            onClick={() => setShowPages((s) => !s)}
            aria-pressed={showPages}
            aria-label={tr("pdf.pagesTitle")}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm eu-btn-toggle"
            {...tip(tr("pdf.pagesTitle"))}
          >
            <Icon icon={PanelLeft} />
          </button>
        </ToolGroup>
        <ToolSep />
        <ToolGroup label={tr("pdf.mode")}>
          {TOOLS.map((t) => {
            // The highlighter takes up the way it was last used.
            const marks = t.id === "highlight";
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTool(marks ? markup : t.id)}
                aria-pressed={marks ? isMarkup(tool) : tool === t.id}
                disabled={!pages || !!viewing}
                aria-label={tr(t.label)}
                className="eu-btn-quiet eu-btn-sm eu-btn-toggle"
                {...tip(tr(t.hint))}
              >
                <Icon icon={(marks && MARKUP_TOOLS.find((m) => m.id === markup)?.icon) || t.icon} size={14} />
                <span className="hidden @7xl:inline">{tr(t.label)}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={(e) => setShapesAnchor(e.currentTarget)}
            aria-pressed={isShape(tool)}
            aria-haspopup="menu"
            disabled={!pages || !!viewing}
            aria-label={tr("pdf.shapes")}
            className="eu-btn-quiet eu-btn-sm eu-btn-toggle"
            {...tip(tr("pdf.shapesTitle"))}
          >
            <Icon icon={shapeIcon} size={14} />
            <span className="hidden @7xl:inline">{tr("pdf.shapes")}</span>
          </button>
          <Menu
            open={!!shapesAnchor}
            anchor={shapesAnchor}
            items={shapeItems}
            label={tr("pdf.shapes")}
            onClose={() => setShapesAnchor(null)}
          />
          <button
            type="button"
            onClick={() => setTool("eraser")}
            aria-pressed={tool === "eraser"}
            disabled={!pages || !!viewing}
            aria-label={tr("pdf.eraser")}
            className="eu-btn-quiet eu-btn-sm eu-btn-toggle"
            {...tip(tr("pdf.eraserTitle"))}
          >
            <Icon icon={Eraser} size={14} />
            <span className="hidden @7xl:inline">{tr("pdf.eraser")}</span>
          </button>
          <button
            type="button"
            onClick={() => viewRef.current?.deleteSelected()}
            disabled={!pages || !!viewing}
            aria-label={tr("pdf.deleteAnnotation")}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
            {...tip(tr("pdf.deleteAnnotationTitle"))}
          >
            <Icon icon={Trash2} />
          </button>
          <button
            type="button"
            onClick={() => viewRef.current?.undo()}
            disabled={!history.canUndo || !!viewing}
            aria-label={tr("common.undo")}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
            {...tip(tr("common.undo"), "mod+Z")}
          >
            <Icon icon={Undo2} />
          </button>
          <button
            type="button"
            onClick={() => viewRef.current?.redo()}
            disabled={!history.canRedo || !!viewing}
            aria-label={tr("common.redo")}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
            {...tip(tr("common.redo"), "mod+Y")}
          >
            <Icon icon={Redo2} />
          </button>
        </ToolGroup>
        {isMarkup(tool) && !viewing && (
          <ToolGroup collapse label={tr("pdf.highlight")}>
            <div className="eu-segment eu-segment-sm">
              {MARKUP_TOOLS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={tool === m.id}
                  aria-label={tr(m.label)}
                  onClick={() => {
                    setMarkup(m.id);
                    setTool(m.id);
                  }}
                  {...tip(tr(m.label))}
                >
                  <Icon icon={m.icon} size={14} />
                </button>
              ))}
            </div>
          </ToolGroup>
        )}
        {tool !== "select" && tool !== "eraser" && !viewing && (
          <ToolGroup collapse label={tr("pdf.colorsFor")}>
            <ColorChoice
              colors={usesMarker(tool) ? HIGHLIGHT : INK}
              value={color}
              onChange={usesMarker(tool) ? setMarker : setInk}
            />
          </ToolGroup>
        )}
        {(tool === "pen" || isShape(tool)) && !viewing && (
          <ToolGroup collapse label={tr("board.size")}>
            <div className="eu-segment eu-segment-sm">
              {SIZES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={size === o.value}
                  aria-label={tr(o.label)}
                  onClick={() => setSize(o.value)}
                  {...tip(tr(o.label))}
                >
                  <span className="block rounded-full bg-current" style={{ width: o.dot, height: o.dot }} />
                </button>
              ))}
            </div>
          </ToolGroup>
        )}
        <ToolSep />
        <ToolGroup>
          <button
            type="button"
            onClick={() => (finding ? closeFind() : openFind())}
            aria-pressed={finding}
            disabled={!pages}
            aria-label={tr("pdf.search")}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm eu-btn-toggle"
            {...tip(tr("pdf.search"), keysOf("documents"))}
          >
            <Icon icon={Search} />
          </button>
        </ToolGroup>
        <ToolGroup collapse label={tr("pdf.pageInput")}>
          <input
            value={pageText}
            onChange={(e) => setPageText(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") goTo(Number(pageText));
            }}
            onBlur={() => setPageText(String(page))}
            inputMode="numeric"
            aria-label={tr("pdf.pageInput")}
            className="eu-input eu-field-sm w-11 text-center font-mono"
          />
          <span className="font-mono text-caption text-ink-muted whitespace-nowrap">
            {tr("pdf.pageOf", { count: count || "…" })}
          </span>
          <button
            type="button"
            onClick={(e) => setPagesAnchor(e.currentTarget)}
            disabled={!pages || !!viewing}
            aria-haspopup="menu"
            aria-label={tr("pdf.pagesMenu")}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
            {...tip(tr("pdf.pagesMenuTitle"))}
          >
            <Icon icon={Files} size={14} />
          </button>
          <Menu
            open={!!pagesAnchor}
            anchor={pagesAnchor}
            items={pageItems}
            label={tr("pdf.pagesMenu")}
            onClose={() => setPagesAnchor(null)}
          />
        </ToolGroup>
        <ToolGroup collapse label={tr("whiteboard.zoom")}>
          <button
            type="button"
            onClick={() => viewRef.current?.zoom(-1)}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
            aria-label={tr("pdf.zoomOut")}
            {...tip(tr("pdf.zoomOut"))}
          >
            <Icon icon={Minus} />
          </button>
          <button
            type="button"
            onClick={(e) => setZoomAnchor(e.currentTarget)}
            disabled={!pages}
            aria-haspopup="menu"
            className="eu-btn-quiet eu-btn-sm font-mono text-caption text-ink-muted w-14 justify-center px-0"
            {...tip(tr("pdf.zoom"))}
          >
            {Math.round(scale * 100)} %
          </button>
          <Menu
            open={!!zoomAnchor}
            anchor={zoomAnchor}
            items={zoomItems}
            label={tr("pdf.zoom")}
            onClose={() => setZoomAnchor(null)}
          />
          <button
            type="button"
            onClick={() => viewRef.current?.zoom(1)}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
            aria-label={tr("pdf.zoomIn")}
            {...tip(tr("pdf.zoomIn"))}
          >
            <Icon icon={Plus} />
          </button>
          <button
            type="button"
            onClick={() => viewRef.current?.zoom(0)}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
            aria-label={tr("pdf.zoomFit")}
            {...tip(tr("pdf.zoomFit"))}
          >
            <Icon icon={ScanLine} />
          </button>
        </ToolGroup>
        <ToolSpacer />
        <ToolGroup collapse label={tr("pdf.versions")}>
          <button
            type="button"
            onClick={(e) => setVersionsAnchor(e.currentTarget)}
            disabled={!versionItems.length}
            className="eu-btn-quiet eu-btn-sm"
            aria-haspopup="menu"
            {...tip(versionItems.length ? tr("pdf.versions") : tr("pdf.noVersionsYet"))}
          >
            <Icon icon={History} size={14} />
            <span className="hidden @3xl:inline">
              {tr("pdf.versions")} ({versionItems.length})
            </span>
          </button>
          <Menu
            open={!!versionsAnchor}
            anchor={versionsAnchor}
            items={versionItems}
            label={tr("pdf.versions")}
            placement="bottom-end"
            onClose={() => setVersionsAnchor(null)}
          />
        </ToolGroup>
        <ToolGroup>
          <button
            type="button"
            onClick={present}
            disabled={!pages}
            aria-label={tr("pdf.present")}
            className="eu-btn-quiet eu-btn-sm"
            {...tip(tr("pdf.presentTitle"), keysOf("present"))}
          >
            <Icon icon={PresentIcon} size={14} />
          </button>
          <button
            type="button"
            onClick={() => void print()}
            disabled={!pages || !!printing}
            aria-label={tr("pdf.print")}
            aria-busy={!!printing}
            className="eu-btn-quiet eu-btn-sm"
            {...tip(printing ? tr("pdf.printing") : tr("pdf.print"), keysOf("print"))}
          >
            <Icon icon={Printer} size={14} />
            {printing && (
              <span className="font-mono text-caption">
                {printing.done}/{printing.total}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => void exportCopy()}
            disabled={!pages || copying}
            aria-label={tr("pdf.exportCopy")}
            aria-busy={copying}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
            {...tip(tr("pdf.exportCopyTitle"))}
          >
            <Icon icon={FileDown} size={14} />
          </button>
          <OpenWithButton fileId={fileId} className="eu-btn-quiet eu-btn-sm" label={tr("openWith.label")} />
          <button
            type="button"
            onClick={() =>
              void save()
                .then(() => toast(tr("pdf.annotationsSaved", { name: fileName }), "success"))
                .catch(logged("pdf.saveButton"))
            }
            disabled={!dirty || saving || !!viewing}
            className="eu-btn-primary eu-btn-sm"
            {...tip(tr("common.save"), keysOf("save"))}
          >
            {tr("common.save")}
          </button>
        </ToolGroup>
      </Toolbar>

      {viewing && (
        <div className="shrink-0 flex items-center gap-3 px-3 py-1.5 border-b border-line bg-warn-soft text-warn eu-t-small">
          <Icon icon={History} size={14} />
          <span className="flex-1 min-w-0 truncate">
            {viewing.timestamp === "original"
              ? tr("pdf.viewingOriginal")
              : tr("pdf.viewingVersion", { date: versionDate(viewing) })}
          </span>
          <button type="button" onClick={() => void restore(viewing)} className="eu-btn-ghost eu-btn-sm">
            <Icon icon={RotateCcw} size={14} />
            {tr("pdf.restore")}
          </button>
          <button type="button" onClick={() => setViewing(null)} className="eu-btn-quiet eu-btn-sm">
            {tr("pdf.backToCurrent")}
          </button>
        </div>
      )}

      <div ref={stageRef} className={presenting ? "eu-pdf-presenting" : "flex-1 min-h-0 flex bg-stage"}>
        <div className="flex-1 min-w-0 relative">
          {finding && (
            <div className="eu-pdf-find" role="search">
              <Icon icon={Search} size={14} className="text-ink-muted shrink-0" />
              <input
                ref={findRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.shiftKey) viewRef.current?.findPrevious();
                    else viewRef.current?.findNext();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    closeFind();
                  }
                }}
                placeholder={tr("pdf.search")}
                aria-label={tr("pdf.search")}
                className="eu-input eu-field-sm w-52"
              />
              <span className="font-mono text-caption text-ink-muted min-w-20 text-center" aria-live="polite">
                {findStatus}
              </span>
              <button
                type="button"
                onClick={() => viewRef.current?.findPrevious()}
                disabled={!found.total}
                aria-label={tr("pdf.searchPrevious")}
                className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                {...tip(tr("pdf.searchPrevious"), "shift+enter")}
              >
                <Icon icon={ChevronUp} />
              </button>
              <button
                type="button"
                onClick={() => viewRef.current?.findNext()}
                disabled={!found.total}
                aria-label={tr("pdf.searchNext")}
                className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                {...tip(tr("pdf.searchNext"), "enter")}
              >
                <Icon icon={ChevronDown} />
              </button>
              <button
                type="button"
                onClick={closeFind}
                aria-label={tr("pdf.searchClose")}
                className="eu-btn-quiet eu-btn-icon eu-btn-sm"
                {...tip(tr("pdf.searchClose"), "esc")}
              >
                <Icon icon={X} />
              </button>
            </div>
          )}
          {extractText !== null && (
            <form
              className="eu-pdf-find"
              aria-label={tr("pdf.extract")}
              onSubmit={(e) => {
                e.preventDefault();
                void extract();
              }}
            >
              <label htmlFor={extractId} className="eu-t-small text-ink-muted whitespace-nowrap">
                {tr("pdf.extractPages")}
              </label>
              <input
                id={extractId}
                autoFocus
                value={extractText}
                onChange={(e) => {
                  setExtractText(e.target.value);
                  setExtractBad(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setExtractText(null);
                }}
                placeholder="3-5"
                aria-invalid={extractBad}
                className="eu-input eu-field-sm w-28"
              />
              {extractBad && (
                <span role="alert" className="eu-t-caption text-danger whitespace-nowrap">
                  {tr("pdf.extractBad", { count: pages })}
                </span>
              )}
              <button type="submit" className="eu-btn-primary eu-btn-sm">
                {tr("pdf.extractGo")}
              </button>
              <button
                type="button"
                onClick={() => setExtractText(null)}
                aria-label={tr("common.close")}
                className="eu-btn-quiet eu-btn-icon eu-btn-sm"
              >
                <Icon icon={X} />
              </button>
            </form>
          )}
          {failed ? (
            <div className="h-full grid place-items-center p-6">
              <div className="max-w-[44ch] text-center text-stage-ink">
                <p className="eu-t-title">{tr("pdf.openFailed")}</p>
                <p className="eu-t-small text-stage-muted mt-1.5">{tr("pdf.openFailedHint")}</p>
                <p className="eu-t-caption text-stage-muted mt-1 selectable">{failed}</p>
                <div className="mt-4 flex justify-center">
                  <OpenWithButton
                    fileId={fileId}
                    className="eu-btn-ghost eu-btn-sm"
                    label={tr("openWith.label")}
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              {!pages && !locked && (
                <div className="absolute inset-0 z-10 grid place-items-center text-stage-muted eu-t-small">
                  {tr("pdf.loading")}
                </div>
              )}
              <PdfView
                key={viewKey}
                ref={viewRef}
                url={url}
                tool={viewing ? "select" : tool}
                color={color}
                size={size}
                readOnly={!!viewing}
                author={author}
                showPages={showPages && !presenting}
                active={visible}
                presenting={presenting}
                startPage={landing}
                onReady={(info) => {
                  setPages(info.pages);
                  setFailed(null);
                }}
                onPage={(n) => {
                  setPage(n);
                  setPageText(String(n));
                }}
                onScale={setScale}
                onDirty={setDirty}
                onHistory={setHistory}
                onFind={setFound}
                onLocked={setLocked}
                onError={(err) => {
                  reportError("pdf.open", err);
                  setFailed(errorMessage(err, ""));
                }}
              />
            </>
          )}
          {presenting && (
            <Presentation
              stage={stageRef}
              view={viewRef}
              pages={pages}
              first={page}
              scale={scale}
              tool={viewing ? "select" : tool}
              onTool={setTool}
              canUndo={history.canUndo}
              readOnly={!!viewing}
              onClose={(shown) => {
                setPresenting(false);
                // At the top of the page shown last, once the zoom from before is back.
                window.setTimeout(() => viewRef.current?.goTo(shown), 150);
              }}
            />
          )}
        </div>
      </div>

      {sheet.length > 0 &&
        createPortal(
          <div className="eu-print" data-theme="light" aria-hidden>
            {sheet.map((p) => (
              <div key={p.url} className={p.wide ? "eu-print-pdf is-wide" : "eu-print-pdf"}>
                <img src={p.url} alt="" />
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
