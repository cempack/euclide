import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "../lib/api";
import { useToast } from "./ui";
import { DownloadIcon, HighlightIcon, PenIcon, TextIcon, TrashIcon } from "./icons";
import { OpenWithButton } from "./OpenWithButton";

const isImage = (name: string) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);

/**
 * PDF viewer powered by PDF.js annotation engine (text layer, search, ink/freetext/highlight/stamp editors, forms, etc.).
 * We use the full feature set but with:
 *   - zero Mozilla branding visible to the user
 *   - completely custom Euclide-themed toolbar (our icons from icons.tsx, accent colors, eu-btn styles)
 *   - direct ArrayBuffer transfer (via postMessage) for reliable document loading
 *   - annotations saved as standard embedded PDF (portable, opens in any reader)
 *
 * Images fall back to the previous lightweight canvas overlay.
 */
export default function PdfViewer({ fileId, fileName }: { fileId: number; fileName: string }) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pdfSrc, setPdfSrc] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // For legacy image annotation path (kept so opening images still works nicely).
  // NOTE: these hooks are *always* declared (top level) even for PDF path to satisfy rules of hooks.
  const [legacyMode] = useState(isImage(fileName));
  const [legacyZoom, setLegacyZoom] = useState(1.0);
  const [legacyTool, setLegacyTool] = useState<"pen" | "highlight" | "text" | "eraser">("pen");
  const [legacyColor, setLegacyColor] = useState("#6366F1");
  const legacyContainerRef = useRef<HTMLDivElement>(null);
  const legacyPageCanvas = useRef<HTMLCanvasElement | null>(null);
  const legacyOverlay = useRef<HTMLCanvasElement | null>(null);
  const legacyAnnots = useRef<{ strokes: any[]; texts: any[] }>({ strokes: [], texts: [] });
  const legacyDrawing = useRef(false);
  const legacyCurrent = useRef<any>(null);

  // Load file url (convertFileSrc gives asset:// or http that works for pdf.js fetch + iframe)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const abs = await api.filePath(fileId);
        const src = convertFileSrc(abs);
        if (!cancelled) {
          if (legacyMode) {
            // legacy path will load the image itself
            setPdfSrc(src);
          } else {
            setPdfSrc(src);
            setPdfLoaded(false);
            // pdfLoaded will be set true by the 'euclide-pdf-loaded' postMessage from the iframe after successful open
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError("Impossible d'ouvrir ce document.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [fileId, legacyMode]);

  // Listen for messages from the embedded PDF.js viewer (ready, save results)
  // Use useLayoutEffect to attach listener as early as possible (before paint, right after iframe DOM insert)
  // so we don't miss the 'euclide-viewer-ready' or 'euclide-pdf-loaded' posts from the child iframe's init script.
  // Previously with useEffect it could race and cause the loading overlay to stay forever.
  useLayoutEffect(() => {
    const onMsg = async (ev: MessageEvent) => {
      const d = ev.data;
      if (!d) return;

      if (d.type === "euclide-viewer-ready") {
        setViewerReady(true);
        return;
      }
      if (d.type === "euclide-pdf-loaded") {
        setPdfLoaded(true);
        // The iframe integration script handles activating the annotation editor.
        // Default to NONE mode (select/edit existing annotations)
        setCurrentEditorMode(0);
        return;
      }

      if (d.type === "euclide-pdf-saved" && d.buffer) {
        try {
          const buffer: ArrayBuffer = d.buffer;
          const blob = new Blob([buffer], { type: "application/pdf" });
          const dataUrl: string = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.onerror = reject;
            r.readAsDataURL(blob);
          });
          const base = fileName.replace(/\.[^.]+$/, "");
          const f = await api.saveExport(`${base} (annoté).pdf`, dataUrl);
          api.logEvent("pdf_export", f.name, null);
          toast(`PDF annoté enregistré : ${f.name}`, "success");
        } catch (e: any) {
          toast("Erreur lors de l'enregistrement du PDF annoté", "error");
        }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [fileName, toast]);

  // For the PDF.js-based viewer (PDF path)
  const [viewerReady, setViewerReady] = useState(false);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [currentEditorMode, setCurrentEditorMode] = useState<number>(0); // 0=select/edit existing (NONE), 3=FreeText, 9=Highlight, 15=Ink

  const loadPdfIntoViewer = async () => {
    const ifr = iframeRef.current;
    if (!pdfSrc || !ifr?.contentWindow) return;
    try {
      const res = await fetch(pdfSrc);
      if (!res.ok) throw new Error("fetch pdf failed");
      const buffer = await res.arrayBuffer();
      ifr.contentWindow.postMessage({ type: "euclide-open", buffer }, "*", [buffer]);
    } catch (e) {
      console.error(e);
      setError("Impossible de charger le PDF dans le visualiseur.");
    }
  };

  // React to ready + pdfSrc
  useEffect(() => {
    if (viewerReady && pdfSrc && !legacyMode) {
      loadPdfIntoViewer();

      // Robustness: if for any reason the 'euclide-pdf-loaded' postMessage from the iframe
      // is missed (race, error in pdf.js open, postMessage not delivered, etc.),
      // force-hide the loading overlay after a generous timeout so user isn't stuck forever.
      // We also force the editor mode so the toolbar reflects editable state.
      const timeout = setTimeout(() => {
        if (!pdfLoaded) {
          console.warn('[PdfViewer] pdf-loaded message not received in time, forcing loaded state to avoid stuck overlay');
          setPdfLoaded(true);
          setCurrentEditorMode(0);
        }
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [viewerReady, pdfSrc, legacyMode, pdfLoaded]);

  // ---------- LEGACY simple annotator for images (kept working) ----------
  const drawLegacy = () => {
    const cv = legacyPageCanvas.current;
    const ov = legacyOverlay.current;
    if (!cv || !ov) return;
    const ctx = ov.getContext("2d")!;
    ctx.clearRect(0, 0, ov.width, ov.height);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const s of legacyAnnots.current.strokes) {
      ctx.globalCompositeOperation = s.tool === "eraser" ? "destination-out" : "source-over";
      ctx.globalAlpha = s.tool === "highlight" ? 0.35 : 1;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.beginPath();
      s.pts.forEach((p: any, k: number) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    for (const t of legacyAnnots.current.texts) {
      ctx.fillStyle = t.color;
      ctx.font = `${t.size}px Inter, system-ui, sans-serif`;
      ctx.fillText(t.text, t.x, t.y);
    }
  };

  const loadLegacyImage = async () => {
    if (!legacyMode || !pdfSrc) return;
    const img = new Image();
    img.onload = () => {
      const cv = legacyPageCanvas.current;
      const ov = legacyOverlay.current;
      if (!cv || !ov) return;
      const w = Math.min(1100, img.naturalWidth * 1.2);
      const scale = w / img.naturalWidth;
      cv.width = w;
      cv.height = img.naturalHeight * scale;
      ov.width = cv.width;
      ov.height = cv.height;
      cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
      // load old json annots if any (for images we still use the old format)
      api.readAnnotations(fileId).then((saved) => {
        if (saved) {
          try { legacyAnnots.current = JSON.parse(saved); } catch {}
        }
        drawLegacy();
      }).catch(() => {});
    };
    img.src = pdfSrc;
  };

  useEffect(() => {
    if (legacyMode) loadLegacyImage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyMode, pdfSrc]);

  const legacyPt = (e: React.PointerEvent) => {
    const ov = legacyOverlay.current!;
    const r = ov.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const legacyDown = (e: React.PointerEvent) => {
    if (!legacyMode) return;
    // simple tools for images: reuse same 4 tools but minimal state here
    const tool = (window as any).__euclideImageTool || "pen";
    const color = (window as any).__euclideImageColor || "#6366F1";
    if (tool === "text") {
      const p = legacyPt(e);
      const txt = prompt("Texte :");
      if (txt) {
        legacyAnnots.current.texts.push({ x: p.x, y: p.y, text: txt, color, size: 18 });
        drawLegacy();
      }
      return;
    }
    legacyDrawing.current = true;
    legacyCurrent.current = {
      tool: tool === "eraser" ? "eraser" : tool === "highlight" ? "highlight" : "pen",
      color,
      size: tool === "highlight" ? 14 : tool === "eraser" ? 16 : 2.5,
      pts: [legacyPt(e)]
    };
    (e.target as any).setPointerCapture(e.pointerId);
  };
  const legacyMove = (e: React.PointerEvent) => {
    if (!legacyDrawing.current || !legacyCurrent.current) return;
    legacyCurrent.current.pts.push(legacyPt(e));
    const a = legacyAnnots.current;
    a.strokes.push(legacyCurrent.current);
    drawLegacy();
    a.strokes.pop();
  };
  const legacyUp = () => {
    if (legacyCurrent.current && legacyCurrent.current.pts.length > 1) {
      legacyAnnots.current.strokes.push(legacyCurrent.current);
    }
    legacyCurrent.current = null;
    legacyDrawing.current = false;
  };

  const legacyClear = () => {
    legacyAnnots.current = { strokes: [], texts: [] };
    drawLegacy();
  };

  const legacySave = async () => {
    await api.saveAnnotations(fileId, JSON.stringify(legacyAnnots.current));
    toast("Annotations image enregistrées", "success");
  };

  const legacyExport = async () => {
    const cv = legacyPageCanvas.current;
    const ov = legacyOverlay.current;
    if (!cv) return;
    const merged = document.createElement("canvas");
    merged.width = cv.width; merged.height = cv.height;
    const m = merged.getContext("2d")!;
    m.fillStyle = "#fff"; m.fillRect(0,0,merged.width,merged.height);
    m.drawImage(cv,0,0);
    if (ov) m.drawImage(ov,0,0);
    const dataUrl = merged.toDataURL("image/png");
    const base = fileName.replace(/\.[^.]+$/, "");
    const f = await api.saveExport(`${base} (annoté).png`, dataUrl);
    toast(`Exporté : ${f.name}`, "success");
  };

  // ---------- RENDER ----------
  if (legacyMode) {
    // Keep the old (but working) image annotator
    const PALETTE = ["#000000", "#FFFFFF", "#FF0000", "#00AA00", "#0066FF", "#FFAA00", "#AA00FF", "#00FFFF", "#6366F1", "#333333"];
    // stash for the pointer handlers (no prop drilling)
    (window as any).__euclideImageTool = legacyTool;
    (window as any).__euclideImageColor = legacyColor;

    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-hairline flex-wrap bg-surface">
          {(["pen","highlight","text","eraser"] as const).map((t) => (
            <button key={t} onClick={() => setLegacyTool(t)}
              className={`new-btn-ghost text-sm ${legacyTool===t ? "bg-surface-container text-accent-sunset" : ""}`}>
              {t === "pen" ? "Stylo" : t === "highlight" ? "Surligneur" : t === "text" ? "Texte" : "Gomme"}
            </button>
          ))}
          <div className="flex items-center gap-1.5 ml-2">
            {PALETTE.map((c) => (
              <button key={c} onClick={() => setLegacyColor(c)}
                className={`w-6 h-6 rounded-full border border-hairline ${legacyColor===c ? "ring-2 ring-accent-sunset scale-110" : ""}`}
                style={{ background: c }} />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1">
              <button onClick={() => setLegacyZoom(z => Math.max(0.5, z-0.1))} className="new-btn-ghost px-2.5">−</button>
              <span className="text-xs text-body-mute w-10 text-center tabular-nums">{Math.round(legacyZoom*100)}%</span>
              <button onClick={() => setLegacyZoom(z => Math.min(3, z+0.1))} className="new-btn-ghost px-2.5">+</button>
            </div>
            <OpenWithButton fileId={fileId} className="new-btn-ghost" />
            <button onClick={legacyExport} className="new-btn-ghost"><DownloadIcon className="w-4 h-4" /></button>
            <button onClick={legacySave} className="new-btn-primary">Enregistrer</button>
          </div>
        </div>
        <div ref={legacyContainerRef} className="flex-1 overflow-auto bg-[#1a1a1a] p-6" style={{ zoom: legacyZoom }}>
          <div className="relative mx-auto shadow-card bg-[#f8f7f4] inline-block border border-hairline rounded">
            <canvas ref={(el) => (legacyPageCanvas.current = el)} className="block" />
            <canvas
              ref={(el) => (legacyOverlay.current = el)}
              onPointerDown={legacyDown}
              onPointerMove={legacyMove}
              onPointerUp={legacyUp}
              onPointerLeave={legacyUp}
              className="absolute inset-0 touch-none"
              style={{ cursor: legacyTool === "text" ? "text" : "crosshair" }}
            />
            <button onClick={legacyClear} className="absolute top-2 right-2 text-xs new-btn-ghost bg-surface/80">Effacer</button>
          </div>
        </div>
      </div>
    );
  }

  // ========== PDF.JS POWERED EDITOR (main path for PDFs) ==========
  // We use a clean viewer.html (no ?file param) + transfer bytes via postMessage for reliable loading
  // + fully custom toolbar in Euclide theme + our icons. The PDF.js engine (annotation editor etc.) is still used.
  const viewerUrl = `/pdfjs/web/viewer.html`;

  // Custom toolbar actions for the embedded editor
  const canControlEditor = !legacyMode && viewerReady && pdfLoaded;

  const setEditorMode = (mode: number) => {
    const ifr = iframeRef.current;
    if (!canControlEditor || !ifr?.contentWindow) {
      toast("Visualiseur PDF non prêt pour l'édition", "info");
      return;
    }
    ifr.contentWindow.postMessage({ type: "euclide-set-mode", mode }, "*");
    setCurrentEditorMode(mode);
  };

  const setEditorColor = (color: string) => {
    const ifr = iframeRef.current;
    if (!canControlEditor || !ifr?.contentWindow) return;
    ifr.contentWindow.postMessage({ type: "euclide-set-color", color }, "*");
  };

  const doZoom = (dir: number) => {
    const ifr = iframeRef.current;
    if (!ifr?.contentWindow) return;
    ifr.contentWindow.postMessage({ type: "euclide-zoom", dir }, "*");
  };

  const deleteSelected = () => {
    const ifr = iframeRef.current;
    if (!canControlEditor || !ifr?.contentWindow) {
      toast("Visualiseur non prêt", "info");
      return;
    }
    ifr.contentWindow.postMessage({ type: "euclide-delete-selected" }, "*");
  };

  const triggerViewerSave = () => {
    const ifr = iframeRef.current;
    if (ifr?.contentWindow) {
      ifr.contentWindow.postMessage({ type: "euclide-save" }, "*");
    } else {
      toast("Visualiseur non prêt", "error");
    }
  };

  const PALETTE = ["#000000", "#FFFFFF", "#FF0000", "#00AA00", "#0066FF", "#FFAA00", "#AA00FF", "#00FFFF", "#6366F1", "#333333"];

  return (
    <div className="h-full flex flex-col">
      {/* Custom Euclide-themed toolbar. Buttons send postMessage to control the embedded PDF.js annotation editor (full support for select/edit existing incl. FreeText text content, move/resize/rearrange annotations, new ink/highlight/text, colors, delete). */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-hairline flex-wrap bg-surface text-sm">
        {/* Editing mode selector */}
        <div className="flex items-center gap-1 border-r border-hairline pr-2 mr-1">
          <button
            onClick={() => setEditorMode(0)}
            className={`new-btn-ghost text-xs px-2 py-1 ${currentEditorMode === 0 ? "bg-surface-container text-primary" : ""}`}
            disabled={!canControlEditor}
            title="Mode sélection : cliquer pour éditer, déplacer, redimensionner les annotations existantes"
          >
            Sélection
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* Create annotation tools - only in edit modes */}
          <button
            onClick={() => setEditorMode(15)}
            className={`new-btn-ghost flex items-center gap-1 text-sm px-2 ${currentEditorMode === 15 ? "bg-surface-container text-primary" : ""}`}
            disabled={!canControlEditor}
            title="Stylo / Dessin à main levée (Ink)"
          >
            <PenIcon className="w-4 h-4" /> <span className="text-xs hidden sm:inline">Stylo</span>
          </button>
          <button
            onClick={() => setEditorMode(9)}
            className={`new-btn-ghost flex items-center gap-1 text-sm px-2 ${currentEditorMode === 9 ? "bg-surface-container text-primary" : ""}`}
            disabled={!canControlEditor}
            title="Surligneur"
          >
            <HighlightIcon className="w-4 h-4" /> <span className="text-xs hidden sm:inline">Surligneur</span>
          </button>
          <button
            onClick={() => setEditorMode(3)}
            className={`new-btn-ghost flex items-center gap-1 text-sm px-2 ${currentEditorMode === 3 ? "bg-surface-container text-primary" : ""}`}
            disabled={!canControlEditor}
            title="Ajouter ou éditer du texte (FreeText - déplaçable, redimensionnable, éditable)"
          >
            <TextIcon className="w-4 h-4" /> <span className="text-xs hidden sm:inline">Texte</span>
          </button>
          <button
            onClick={deleteSelected}
            className="new-btn-ghost flex items-center gap-1 text-sm px-2"
            disabled={!canControlEditor}
            title="Supprimer l'annotation sélectionnée (ou touche Suppr)"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 ml-1 pl-2 border-l border-hairline">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setEditorColor(c)}
              className="w-5 h-5 rounded-full border border-hairline transition-transform hover:scale-110"
              style={{ background: c }}
              disabled={!canControlEditor}
              title={`Couleur ${c}`}
            />
          ))}
        </div>

        <div className="flex items-center gap-1 ml-2 pl-2 border-l border-hairline">
          <button onClick={() => doZoom(-1)} className="new-btn-ghost px-2" title="Zoom -">−</button>
          <button onClick={() => doZoom(1)} className="new-btn-ghost px-2" title="Zoom +">+</button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <OpenWithButton fileId={fileId} className="new-btn-ghost text-xs" label="Ouvrir dehors" />
          <button
            onClick={triggerViewerSave}
            className="new-btn-primary text-sm"
            disabled={!canControlEditor}
            title="Enregistrer le PDF avec les annotations intégrées (format PDF standard, portable)"
          >
            Enregistrer
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 bg-[#111] relative">
        {!legacyMode && !pdfLoaded && !error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#111]/80">
            <p className="text-body-mute">Chargement du PDF et de l'éditeur d'annotations…</p>
          </div>
        )}
        {error && <p className="text-center text-red-400 py-10">{error}</p>}
        {viewerUrl && !error && (
          <iframe
            ref={iframeRef}
            src={viewerUrl}
            className="absolute inset-0 w-full h-full border-0 bg-[#111]"
            title="PDF viewer"
            allow="clipboard-read; clipboard-write"
            onLoad={() => {
              // Fallback: the iframe (viewer.html + pdf.js mjs) has loaded its document.
              // The internal script should have posted 'euclide-viewer-ready' via webviewerloaded,
              // but if the message was missed for any reason, force ready after a short delay
              // so we still attempt to load the PDF bytes and avoid permanent loading state.
              setTimeout(() => {
                if (!viewerReady) {
                  console.warn('[PdfViewer] euclide-viewer-ready message missed after iframe load, forcing ready');
                  setViewerReady(true);
                }
              }, 1200);
            }}
          />
        )}
      </div>
    </div>
  );
}
