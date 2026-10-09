import { useCallback, useEffect, useRef, useState } from "react";
import { changed } from "../../api/client";
import { Eraser, ImageDown, Minus, PenLine, Plus, Trash2, Undo2 } from "lucide-react";
import { api, fileUrl } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { tr } from "../../lib/i18n";
import { keysOf } from "../../lib/keymap";
import { logged, reportError } from "../../lib/report";
import { editors } from "../../stores/editors";
import { useToast } from "../../components/ui";
import { OpenWithButton } from "../../components/OpenWithButton";
import { Toolbar, ToolGroup, ToolSep, ToolSpacer } from "../../components/layout";
import { Icon } from "../../ui/Icon";
import { tip } from "../../ui/Tooltip";
import { ColorChoice } from "./ColorChoice";
import { INK } from "./palette";

type Point = { x: number; y: number };
type Stroke = { tool: "pen" | "eraser"; color: string; size: number; pts: Point[] };

/** Saved drawings use the canvas the old annotator drew on: kept, so they line up. */
function baseSize(img: HTMLImageElement) {
  const width = Math.min(1100, img.naturalWidth * 1.2);
  return { width, height: img.naturalHeight * (width / img.naturalWidth) };
}

function paint(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const s of strokes) {
    ctx.globalCompositeOperation = s.tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.beginPath();
    s.pts.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}

/**
 * An image (a photo of the board, a scan) with a pen and an eraser drawn
 * over it. The drawing is kept apart from the image, so the original is
 * never touched; « Exporter » makes an annotated copy in the library.
 */
export function ImageView({ tabId, fileId, fileName }: { tabId: string; fileId: number; fileName: string }) {
  const toast = useToast();
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState(INK[1].value);
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);

  const redraw = useCallback(() => {
    const ctx = inkRef.current?.getContext("2d");
    if (ctx) paint(ctx, current.current ? [...strokes.current, current.current] : strokes.current);
  }, []);

  // The image, then its saved drawing.
  useEffect(() => {
    const img = new Image();
    let cancelled = false;
    img.onload = async () => {
      if (cancelled) return;
      const base = baseSize(img);
      setSize(base);
      const canvas = imageRef.current!;
      canvas.width = base.width;
      canvas.height = base.height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, base.width, base.height);
      inkRef.current!.width = base.width;
      inkRef.current!.height = base.height;
      try {
        const saved = await api.readAnnotations(fileId);
        const parsed = saved ? (JSON.parse(saved) as { strokes?: Stroke[] }) : null;
        strokes.current = Array.isArray(parsed?.strokes) ? parsed.strokes : [];
      } catch (err) {
        // A damaged drawing: the image alone, and a trace in the log.
        reportError("image.readAnnotations", err);
        strokes.current = [];
      }
      redraw();
    };
    img.onerror = () => !cancelled && setFailed(true);
    img.src = fileUrl(fileId);
    return () => {
      cancelled = true;
    };
  }, [fileId, redraw]);

  useEffect(() => {
    editors.setDirty(tabId, dirty);
  }, [tabId, dirty]);

  const save = useCallback(async () => {
    try {
      await api.saveAnnotations(fileId, JSON.stringify({ strokes: strokes.current }));
      setDirty(false);
    } catch (err) {
      reportError("image.saveAnnotations", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
      throw err;
    }
  }, [fileId, toast]);

  useEffect(() => editors.registerFlush(tabId, save), [tabId, save]);

  /** A pointer position in drawing coordinates, whatever the zoom. */
  const point = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    const k = e.currentTarget.width / rect.width;
    return { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k };
  };

  const change = () => {
    setDirty(true);
    redraw();
  };

  const exportPng = async () => {
    const image = imageRef.current;
    const ink = inkRef.current;
    if (!image || !ink) return;
    const merged = document.createElement("canvas");
    merged.width = image.width;
    merged.height = image.height;
    const ctx = merged.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    ctx.drawImage(ink, 0, 0);
    try {
      const blob = await new Promise<Blob | null>((resolve) => merged.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("L'image n'a pas pu être créée.");
      const name = `${fileName.replace(/\.[^.]+$/, "")} (annoté).png`;
      const f = await api.createFileBytes(name, await blob.arrayBuffer());
      changed("library");
      toast(tr("pdf.exported", { name: f?.name ?? name }), "success");
    } catch (err) {
      reportError("image.export", err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    }
  };

  return (
    <div className="h-full flex flex-col">
      <Toolbar className="h-9 py-0">
        <ToolGroup label={tr("pdf.mode")}>
          <button
            type="button"
            onClick={() => setTool("pen")}
            aria-pressed={tool === "pen"}
            className="eu-btn-quiet eu-btn-sm eu-btn-toggle"
            {...tip(tr("pdf.penTitle"))}
          >
            <Icon icon={PenLine} size={14} />
            <span className="hidden @2xl:inline">{tr("pdf.pen")}</span>
          </button>
          <button
            type="button"
            onClick={() => setTool("eraser")}
            aria-pressed={tool === "eraser"}
            className="eu-btn-quiet eu-btn-sm eu-btn-toggle"
            {...tip(tr("pdf.eraser"))}
          >
            <Icon icon={Eraser} size={14} />
            <span className="hidden @2xl:inline">{tr("pdf.eraser")}</span>
          </button>
        </ToolGroup>
        <ToolSep />
        <ToolGroup collapse label={tr("pdf.colorsFor")}>
          <ColorChoice colors={INK} value={color} onChange={setColor} />
        </ToolGroup>
        <ToolSep />
        <ToolGroup collapse>
          <button
            type="button"
            onClick={() => {
              strokes.current.pop();
              change();
            }}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
            aria-label={tr("pdf.undo")}
            {...tip(tr("pdf.undo"))}
          >
            <Icon icon={Undo2} />
          </button>
          <button
            type="button"
            onClick={() => {
              strokes.current = [];
              change();
            }}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm hover:text-danger"
            aria-label={tr("pdf.clearAll")}
            {...tip(tr("pdf.clearAll"))}
          >
            <Icon icon={Trash2} />
          </button>
        </ToolGroup>
        <ToolGroup collapse label={tr("whiteboard.zoom")}>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)))}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
            aria-label={tr("pdf.zoomOut")}
          >
            <Icon icon={Minus} />
          </button>
          <span className="font-mono text-caption text-ink-muted w-10 text-center">
            {Math.round(zoom * 100)} %
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
            aria-label={tr("pdf.zoomIn")}
          >
            <Icon icon={Plus} />
          </button>
        </ToolGroup>
        <ToolSpacer />
        <ToolGroup>
          <button
            type="button"
            onClick={() => void exportPng()}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
            aria-label={tr("pdf.exportPng")}
            {...tip(tr("pdf.exportPng"))}
          >
            <Icon icon={ImageDown} />
          </button>
          <OpenWithButton
            fileId={fileId}
            className="eu-btn-quiet eu-btn-sm"
            labelClassName="hidden @6xl:inline"
          />
          <button
            type="button"
            onClick={() =>
              void save()
                .then(() => toast(tr("pdf.imageAnnotationsSaved"), "success"))
                .catch(logged("image.save"))
            }
            disabled={!dirty}
            className="eu-btn-primary eu-btn-sm"
            {...tip(tr("common.save"), keysOf("save"))}
          >
            {tr("common.save")}
          </button>
        </ToolGroup>
      </Toolbar>
      <div className="flex-1 min-h-0 overflow-auto bg-stage p-6">
        {failed ? (
          <p className="text-center text-stage-muted py-10">{tr("pdf.openFailed")}</p>
        ) : (
          <div
            className="relative mx-auto shadow-pop bg-paper"
            style={size ? { width: size.width * zoom, height: size.height * zoom } : undefined}
          >
            <canvas ref={imageRef} className="absolute inset-0 w-full h-full" />
            <canvas
              ref={inkRef}
              className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                current.current = {
                  tool,
                  color,
                  size: tool === "eraser" ? 16 : 2.5,
                  pts: [point(e)],
                };
              }}
              onPointerMove={(e) => {
                if (!current.current) return;
                current.current.pts.push(point(e));
                redraw();
              }}
              onPointerUp={() => {
                const stroke = current.current;
                current.current = null;
                if (stroke && stroke.pts.length > 1) {
                  strokes.current.push(stroke);
                  change();
                }
              }}
              onPointerCancel={() => {
                current.current = null;
                redraw();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
