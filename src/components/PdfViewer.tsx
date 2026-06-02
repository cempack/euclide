import { useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { jsPDF } from "jspdf";
import { api } from "../lib/api";
import { useToast } from "./ui";
import { DownloadIcon, HighlightIcon, PenIcon, TextIcon, TrashIcon } from "./icons";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

type Tool = "pen" | "highlight" | "text" | "eraser";
interface Pt {
  x: number;
  y: number;
}
interface Stroke {
  tool: Exclude<Tool, "text">;
  color: string;
  size: number;
  pts: Pt[];
}
interface TextItem {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
}
interface PageAnnot {
  strokes: Stroke[];
  texts: TextItem[];
}

const PALETTE = ["#fa520f", "#1f1f1f", "#ff8105", "#ffa110", "#ffd06a"];
const isImage = (name: string) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);

export default function PdfViewer({ fileId, fileName }: { fileId: number; fileName: string }) {
  const toast = useToast();
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(PALETTE[0]);
  const [zoom, setZoom] = useState(1.1);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageCanvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const overlayCanvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const annots = useRef<PageAnnot[]>([]);
  const drawing = useRef(false);
  const currentStroke = useRef<Stroke | null>(null);
  const pdfRef = useRef<any>(null);

  const sizeFor = (t: Tool) => (t === "highlight" ? 16 : t === "eraser" ? 18 : 3);

  const drawOverlay = useCallback((i: number) => {
    const cv = overlayCanvases.current[i];
    const a = annots.current[i];
    if (!cv || !a) return;
    const ctx = cv.getContext("2d")!;
    const w = cv.width;
    const h = cv.height;
    ctx.clearRect(0, 0, w, h);
    for (const s of a.strokes) {
      ctx.globalCompositeOperation = s.tool === "eraser" ? "destination-out" : "source-over";
      ctx.globalAlpha = s.tool === "highlight" ? 0.35 : 1;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size * (w / 1000);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      s.pts.forEach((p, k) => (k ? ctx.lineTo(p.x * w, p.y * h) : ctx.moveTo(p.x * w, p.y * h)));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    for (const txt of a.texts) {
      ctx.fillStyle = txt.color;
      ctx.font = `${txt.size * (w / 1000)}px Inter, system-ui, sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(txt.text, txt.x * w, txt.y * h);
    }
  }, []);

  // Render the document
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const abs = await api.filePath(fileId);
        const src = convertFileSrc(abs);

        // load saved annotations first
        const saved = await api.readAnnotations(fileId).catch(() => null);

        if (isImage(fileName)) {
          // images render as a single page
          annots.current = saved ? JSON.parse(saved) : [{ strokes: [], texts: [] }];
          if (!annots.current[0]) annots.current[0] = { strokes: [], texts: [] };
          setNumPages(1);
          setLoading(false);
          return;
        }

        const doc = await pdfjsLib.getDocument(src).promise;
        if (cancelled) return;
        pdfRef.current = doc;
        annots.current = saved ? JSON.parse(saved) : [];
        setNumPages(doc.numPages);
        for (let i = 0; i < doc.numPages; i++) {
          if (!annots.current[i]) annots.current[i] = { strokes: [], texts: [] };
        }
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError("Impossible d'ouvrir ce document.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  // Render pages whenever numPages / zoom changes
  useEffect(() => {
    if (loading || error || numPages === 0) return;
    const doc = pdfRef.current;
    const width = (containerRef.current?.clientWidth ?? 800) - 64;

    const renderImage = async () => {
      const abs = await api.filePath(fileId);
      const img = new Image();
      img.onload = () => {
        const cv = pageCanvases.current[0];
        const ov = overlayCanvases.current[0];
        if (!cv || !ov) return;
        const scale = Math.min((width * zoom) / img.naturalWidth, 1.5);
        cv.width = img.naturalWidth * scale;
        cv.height = img.naturalHeight * scale;
        ov.width = cv.width;
        ov.height = cv.height;
        cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
        drawOverlay(0);
      };
      img.src = convertFileSrc(abs);
    };

    const renderPdf = async () => {
      for (let i = 0; i < numPages; i++) {
        const page = await doc.getPage(i + 1);
        const base = page.getViewport({ scale: 1 });
        const scale = ((width * zoom) / base.width) || 1;
        const viewport = page.getViewport({ scale });
        const cv = pageCanvases.current[i];
        const ov = overlayCanvases.current[i];
        if (!cv || !ov) continue;
        cv.width = viewport.width;
        cv.height = viewport.height;
        ov.width = viewport.width;
        ov.height = viewport.height;
        await page.render({ canvasContext: cv.getContext("2d")!, viewport }).promise;
        drawOverlay(i);
      }
    };

    if (isImage(fileName)) renderImage();
    else renderPdf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, numPages, zoom]);

  const ptOf = (e: React.PointerEvent, i: number): Pt => {
    const cv = overlayCanvases.current[i]!;
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const onDown = (e: React.PointerEvent, i: number) => {
    if (tool === "text") {
      const p = ptOf(e, i);
      const text = window.prompt("Texte a ajouter :");
      if (text) {
        annots.current[i].texts.push({ x: p.x, y: p.y, text, color, size: 20 });
        setDirty(true);
        drawOverlay(i);
      }
      return;
    }
    drawing.current = true;
    currentStroke.current = { tool: tool as Stroke["tool"], color, size: sizeFor(tool), pts: [ptOf(e, i)] };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent, i: number) => {
    if (!drawing.current || !currentStroke.current) return;
    currentStroke.current.pts.push(ptOf(e, i));
    const a = annots.current[i];
    // draw live by temporarily including the current stroke
    a.strokes.push(currentStroke.current);
    drawOverlay(i);
    a.strokes.pop();
  };
  const onUp = (i: number) => {
    if (currentStroke.current && currentStroke.current.pts.length) {
      annots.current[i].strokes.push(currentStroke.current);
      setDirty(true);
      drawOverlay(i);
    }
    currentStroke.current = null;
    drawing.current = false;
  };

  const clearPage = (i: number) => {
    annots.current[i] = { strokes: [], texts: [] };
    setDirty(true);
    drawOverlay(i);
  };

  const save = async () => {
    await api.saveAnnotations(fileId, JSON.stringify(annots.current));
    setDirty(false);
    toast("Annotations enregistrees", "success");
  };

  const exportPdf = async () => {
    toast("Export en cours...", "info");
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    let first = true;
    for (let i = 0; i < numPages; i++) {
      const cv = pageCanvases.current[i];
      const ov = overlayCanvases.current[i];
      if (!cv) continue;
      const merged = document.createElement("canvas");
      merged.width = cv.width;
      merged.height = cv.height;
      const mctx = merged.getContext("2d")!;
      mctx.fillStyle = "#ffffff";
      mctx.fillRect(0, 0, merged.width, merged.height);
      mctx.drawImage(cv, 0, 0);
      if (ov) mctx.drawImage(ov, 0, 0);
      const img = merged.toDataURL("image/jpeg", 0.92);
      const pw = pdf.internal.pageSize.getWidth();
      const ph = (merged.height / merged.width) * pw;
      if (!first) pdf.addPage();
      pdf.addImage(img, "JPEG", 0, 0, pw, ph);
      first = false;
    }
    const dataUrl = pdf.output("datauristring");
    const base = fileName.replace(/\.[^.]+$/, "");
    const f = await api.saveExport(`${base} (annote).pdf`, dataUrl);
    api.logEvent("pdf_export", f.name, null);
    toast(`Exporte : ${f.name}`, "success");
  };

  const toolBtn = (id: Tool, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setTool(id)}
      className={`eu-btn-ghost ${tool === id ? "bg-[#fff8e0] text-[#fa520f]" : "text-[#6a6a6a]"}`}
      title={label}
    >
      {icon}
    </button>
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-[#ededed] flex-wrap bg-white">
        {toolBtn("pen", "Stylo", <PenIcon className="w-4 h-4" />)}
        {toolBtn("highlight", "Surligneur", <HighlightIcon className="w-4 h-4" />)}
        {toolBtn("text", "Texte", <TextIcon className="w-4 h-4" />)}
        {toolBtn("eraser", "Gomme", <TrashIcon className="w-4 h-4" />)}
        <div className="flex items-center gap-1.5 ml-2">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full border border-[#ededed] transition-transform ${
                color === c ? "ring-2 ring-[#fa520f] scale-110" : ""
              }`}
              style={{ background: c }}
            />
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button onClick={() => setZoom((z) => Math.max(0.6, z - 0.15))} className="eu-btn-ghost text-[#6a6a6a] px-2.5">
              −
            </button>
            <span className="text-xs text-[#6a6a6a] w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))} className="eu-btn-ghost text-[#6a6a6a] px-2.5">
              +
            </button>
          </div>
          <button onClick={() => api.openFile(fileId)} className="eu-btn-ghost text-[#6a6a6a]">
            Ouvrir dehors
          </button>
          <button onClick={exportPdf} className="eu-btn-ghost text-[#6a6a6a]" title="Exporter le PDF annote">
            <DownloadIcon className="w-4 h-4" />
          </button>
          <button onClick={save} className="eu-btn-primary">
            {dirty ? "Enregistrer *" : "Enregistrer"}
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto bg-[#fafafa] py-6">
        {loading && <p className="text-center eu-sub py-10">Chargement...</p>}
        {error && <p className="text-center text-red-500 py-10">{error}</p>}
        {!loading && !error && (
          <div className="flex flex-col items-center gap-5">
            {Array.from({ length: numPages }).map((_, i) => (
              <div key={i} className="relative shadow-card rounded-md overflow-hidden bg-white">
                <canvas ref={(el) => (pageCanvases.current[i] = el)} className="block" />
                <canvas
                  ref={(el) => (overlayCanvases.current[i] = el)}
                  onPointerDown={(e) => onDown(e, i)}
                  onPointerMove={(e) => onMove(e, i)}
                  onPointerUp={() => onUp(i)}
                  onPointerLeave={() => onUp(i)}
                  className="absolute inset-0 w-full h-full touch-none"
                  style={{ cursor: tool === "text" ? "text" : "crosshair" }}
                />
                <button
                  onClick={() => clearPage(i)}
                  className="absolute top-2 right-2 eu-btn-ghost bg-white text-[#6a6a6a] text-xs py-1 px-2 opacity-70 hover:opacity-100"
                >
                  Effacer la page
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
