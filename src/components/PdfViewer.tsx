import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "../lib/api";
import { useToast } from "./ui";
import { DownloadIcon, PenIcon, TrashIcon, GridIcon } from "./icons";
import { OpenWithButton } from "./OpenWithButton";
import { get } from "../lib/i18n";

const isImage = (name: string) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);

/**
 * PDF viewer powered by PDF.js (ink/stylo drawing only via custom toolbar + postMessage).
 * Sélection for view, Stylo for drawing. Custom Euclide-themed minimal toolbar, direct ArrayBuffer loading via postMessage, annotations saved embedded.
 * Images use a fallback canvas annotator (pen + eraser only).
 */
export default function PdfViewer({ fileId, fileName }: { fileId: number; fileName: string }) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pdfSrc, setPdfSrc] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Image annotation fallback (for non-PDF files). Hooks always declared for rules of hooks.
  const [legacyMode] = useState(isImage(fileName));
  const [legacyZoom, setLegacyZoom] = useState(1.0);
  const [legacyTool, setLegacyTool] = useState<"pen" | "eraser">("pen");
  const [legacyColor, setLegacyColor] = useState("#007aff");
  const legacyContainerRef = useRef<HTMLDivElement>(null);
  const legacyPageCanvas = useRef<HTMLCanvasElement | null>(null);
  const legacyOverlay = useRef<HTMLCanvasElement | null>(null);
  const legacyAnnots = useRef<{ strokes: any[] }>({ strokes: [] });
  const legacyDrawing = useRef(false);
  const legacyCurrent = useRef<any>(null);

  // Load file url (convertFileSrc gives asset:// or http that works for pdf.js fetch + iframe)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const abs = await api.filePath(fileId);
        if (!abs) throw new Error("no path");
        const src = convertFileSrc(abs);
        if (!cancelled) {
          if (legacyMode) {
            // image path
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

  // Listen for messages from the embedded PDF.js viewer (ready, saved buffer).
  // useLayoutEffect to catch early 'euclide-*-loaded' posts from iframe script.
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
        // Iframe script activates editor. Default to selection mode.
        setCurrentEditorMode(0);
        setThumbnails([]);
        setCurrentPage(1);
        return;
      }

      if (d.type === "euclide-color-set" && d.color) {
        setCurrentColor(d.color);
        return;
      }

      if (d.type === "euclide-thumbnails" && d.thumbnails) {
        setThumbnails(d.thumbnails);
        return;
      }
      if (d.type === "euclide-page-change" && typeof d.page === "number") {
        setCurrentPage(d.page);
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
          // save back to the CURRENT document (in-place update, with internal versioning backup)
          await api.updateFile(fileId, dataUrl);
          // refresh versions list
          api.getFileVersions(fileId).then(setVersions).catch(() => {});
          window.dispatchEvent(new CustomEvent("eu:library-changed"));
          toast(get("pdf.annotationsSaved", "Annotations enregistrées dans {name}").replace("{name}", fileName), "success");
        } catch (e: any) {
          toast("Erreur lors de l'enregistrement des annotations", "error");
        }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [fileName, toast, fileId]);

  // PDF.js viewer (for PDFs)
  const [viewerReady, setViewerReady] = useState(false);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [currentEditorMode, setCurrentEditorMode] = useState<number>(0); // 0=select (NONE), 15=Ink (Stylo)
  const [versions, setVersions] = useState<any[]>([]);
  const [currentColor, setCurrentColor] = useState("#000000");
  const [showPages, setShowPages] = useState(false);
  const [thumbnails, setThumbnails] = useState<{ page: number; dataUrl: string }[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!showPages || thumbnails.length === 0) return;
    const el = document.querySelector(`[title="Page ${currentPage}"]`);
    if (el) (el as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPage, showPages, thumbnails.length]);

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

  // React to ready + pdfSrc. Timeout fallback if 'euclide-pdf-loaded' post is missed.
  useEffect(() => {
    if (viewerReady && pdfSrc && !legacyMode) {
      loadPdfIntoViewer();

      const timeout = setTimeout(() => {
        if (!pdfLoaded) {
          console.warn('[PdfViewer] pdf-loaded message not received in time, forcing loaded state');
          setPdfLoaded(true);
          setCurrentEditorMode(0);
        }
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [viewerReady, pdfSrc, legacyMode, pdfLoaded]);

  // Image annotator fallback (canvas overlay for images)
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
      ctx.globalAlpha = 1;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.beginPath();
      s.pts.forEach((p: any, k: number) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
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
      // load saved annots if any
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

  // load simple file versions history (for PDF mode) - fetch early so UI is visible.
  // Also ensure the pristine "default file" is snapshotted as a version the first time
  // this document is opened in the editor, so user can always revert to the original bytes.
  useEffect(() => {
    if (!legacyMode && fileId) {
      (async () => {
        try {
          await api.ensureOriginalVersion(fileId);
        } catch {}
        try {
          const v = await api.getFileVersions(fileId);
          setVersions(v);
        } catch {
          setVersions([]);
        }
      })();
    }
  }, [fileId, legacyMode]);

  const legacyPt = (e: React.PointerEvent) => {
    const ov = legacyOverlay.current!;
    const r = ov.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const legacyDown = (e: React.PointerEvent) => {
    if (!legacyMode) return;
    // image tools (pen/stylo + eraser only now)
    const tool = (window as any).__euclideImageTool || "pen";
    const color = (window as any).__euclideImageColor || "#007aff";
    legacyDrawing.current = true;
    legacyCurrent.current = {
      tool: tool === "eraser" ? "eraser" : "pen",
      color,
      size: tool === "eraser" ? 16 : 2.5,
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
    legacyAnnots.current = { strokes: [] };
    drawLegacy();
  };

  const legacySave = async () => {
    try {
      await api.saveAnnotations(fileId, JSON.stringify(legacyAnnots.current));
      toast(get("pdf.imageAnnotationsSaved", "Annotations image enregistrées"), "success");
    } catch {
      toast(get("messages.genericError", "Erreur"), "error");
    }
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
    try {
      const f = await api.saveExport(`${base} (annoté).png`, dataUrl);
      if (!f?.id) {
        toast(get("messages.genericError", "Erreur"), "error");
        return;
      }
      toast(get("pdf.exported", "Exporté : {name}").replace("{name}", f.name), "success");
    } catch {
      toast(get("messages.genericError", "Erreur"), "error");
    }
  };

  // RENDER
  if (legacyMode) {
    const PALETTE = ["#000000", "#FFFFFF", "#FF0000", "#00AA00", "#0066FF", "#FFAA00", "#AA00FF", "#00FFFF", "#007aff", "#333333"];
    // stash for pointer handlers (no prop drilling)
    (window as any).__euclideImageTool = legacyTool;
    (window as any).__euclideImageColor = legacyColor;

    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-hairline flex-wrap bg-surface">
          {(["pen","eraser"] as const).map((t) => (
            <button key={t} onClick={() => setLegacyTool(t)}
              className={`new-btn-ghost text-sm ${legacyTool===t ? "bg-surface-container text-tui-accent" : ""}`}>
              {t === "pen" ? "Stylo" : "Gomme"}
            </button>
          ))}
          <div className="flex items-center gap-1.5 ml-2">
            {PALETTE.map((c) => (
              <button key={c} onClick={() => setLegacyColor(c)}
                className={`w-6 h-6 rounded-full border border-hairline transition-all ${legacyColor===c ? "ring-2 ring-tui-accent" : "hover:ring-1 hover:ring-hairline"}`}
                style={{ background: c }} />
            ))}
            <div className="w-3.5 h-3.5 rounded border border-hairline" style={{ background: legacyColor }} title={`Couleur active : ${legacyColor}`} />
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
              style={{ cursor: "crosshair" }}
            />
            <button onClick={legacyClear} className="absolute top-2 right-2 text-xs new-btn-ghost bg-surface/80">Effacer</button>
          </div>
        </div>
      </div>
    );
  }

  // PDF.js powered editor (main path for PDFs)
  // Custom viewer.html + postMessage bytes + Euclide toolbar. PDF.js handles the engine.
  const viewerUrl = `/pdfjs/web/viewer.html?file=`; // ?file= prevents PDF.js from auto-loading its sample/weird default PDF

  // Toolbar actions (postMessage to iframe)
  const canControlEditor = !legacyMode && viewerReady && pdfLoaded;

  const setEditorMode = (mode: number) => {
    const ifr = iframeRef.current;
    if (!canControlEditor || !ifr?.contentWindow) {
      toast(get("pdf.viewerNotReadyForEdit", "Visualiseur non prêt pour l'édition"), "info");
      return;
    }
    ifr.contentWindow.postMessage({ type: "euclide-set-mode", mode }, "*");
    setCurrentEditorMode(mode);
  };

  const setEditorColor = (color: string) => {
    const ifr = iframeRef.current;
    if (!canControlEditor || !ifr?.contentWindow) return;
    ifr.contentWindow.postMessage({ type: "euclide-set-color", color }, "*");
    setCurrentColor(color);
  };

  const doZoom = (dir: number) => {
    const ifr = iframeRef.current;
    if (!ifr?.contentWindow) return;
    ifr.contentWindow.postMessage({ type: "euclide-zoom", dir }, "*");
  };

  const deleteSelected = () => {
    const ifr = iframeRef.current;
    if (!canControlEditor || !ifr?.contentWindow) {
      toast(get("pdf.viewerError", "Visualiseur non prêt"), "info");
      return;
    }
    ifr.contentWindow.postMessage({ type: "euclide-delete-selected" }, "*");
  };

  const togglePagesSidebar = () => {
    const next = !showPages;
    setShowPages(next);
    if (next && thumbnails.length === 0) {
      const ifr = iframeRef.current;
      if (ifr?.contentWindow) {
        ifr.contentWindow.postMessage({ type: "euclide-request-thumbnails" }, "*");
      }
    }
  };

  const triggerViewerSave = () => {
    const ifr = iframeRef.current;
    if (ifr?.contentWindow) {
      // force commit of any active ink stroke by switching to selection mode first
      ifr.contentWindow.postMessage({ type: "euclide-set-mode", mode: 0 }, "*");
      setCurrentEditorMode(0);
      setTimeout(() => {
        ifr?.contentWindow?.postMessage({ type: "euclide-save" }, "*");
      }, 40);
    } else {
      toast(get("pdf.viewerError", "Visualiseur non prêt"), "error");
    }
  };

  const PALETTE = ["#000000", "#FFFFFF", "#FF0000", "#00AA00", "#0066FF", "#FFAA00", "#AA00FF", "#00FFFF", "#007aff", "#333333"];

  return (
    <div className="h-full flex flex-col">
      {/* Custom toolbar. Only Sélection + Stylo (Ink) for drawing. */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-hairline flex-wrap bg-surface text-sm">
        {/* Mode selector + sidebar toggle */}
        <div className="flex items-center gap-1 border-r border-hairline pr-2 mr-1">
          <button
            onClick={() => setEditorMode(0)}
            className={`new-btn-ghost text-xs px-2 py-1 ${currentEditorMode === 0 ? "bg-surface-container text-primary" : ""}`}
            disabled={!canControlEditor}
            title="Sélection : visualiser (annotations statiques)"
          >
            Sélection
          </button>
          <button
            onClick={togglePagesSidebar}
            className={`new-btn-ghost flex items-center justify-center w-7 h-7 text-sm ${showPages ? "bg-surface-container text-primary" : ""}`}
            disabled={!canControlEditor}
            title="Pages / Vignettes (retractable à gauche)"
          >
            <GridIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* Annotation tools - only Stylo now */}
          <button
            onClick={() => setEditorMode(15)}
            className={`new-btn-ghost flex items-center gap-1 text-sm px-2 ${currentEditorMode === 15 ? "bg-surface-container text-primary" : ""}`}
            disabled={!canControlEditor}
            title="Stylo / Dessin à main levée (Ink)"
          >
            <PenIcon className="w-4 h-4" /> <span className="text-xs hidden sm:inline">Stylo</span>
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
              className={`w-5 h-5 rounded-full border border-hairline transition-all ${currentColor === c ? 'ring-2 ring-tui-accent' : 'hover:ring-1 hover:ring-hairline'}`}
              style={{ background: c }}
              disabled={!canControlEditor}
              title={`Couleur ${c}`}
            />
          ))}
          {/* explicit current color swatch, like whiteboard's active color indicator */}
          <div className="w-3.5 h-3.5 rounded border border-hairline" style={{ background: currentColor }} title={`Couleur active : ${currentColor}`} />
        </div>

        <div className="flex items-center gap-1 ml-2 pl-2 border-l border-hairline">
          <button onClick={() => doZoom(-1)} className="new-btn-ghost px-2" title="Zoom -">−</button>
          <button onClick={() => doZoom(1)} className="new-btn-ghost px-2" title="Zoom +">+</button>
        </div>

        {/* simple versioning: load previous baked states into the viewer; saving will update the main doc. Always visible for PDFs. */}
        {!legacyMode && (
          <div className="flex items-center gap-1 ml-2 pl-2 border-l border-hairline text-xs">
            <select
              className="new-btn-ghost text-xs px-1 py-0.5"
              onChange={async (e) => {
                const name = e.target.value;
                if (!name) return;
                try {
                  const dataUrl = await api.readVersionData(name);
                  const res = await fetch(dataUrl);
                  const buffer = await res.arrayBuffer();
                  const ifr = iframeRef.current;
                  if (ifr?.contentWindow) {
                    ifr.contentWindow.postMessage({ type: "euclide-open", buffer }, "*", [buffer]);
                    setPdfLoaded(false);
                    // keep viewerReady true (iframe is still alive); the pdf-loaded msg will re-enable toolbar
                    toast(get("pdf.versionLoaded", "Version chargée — modifiez et Enregistrer pour appliquer"), "success");
                  }
                } catch {
                  toast(get("pdf.versionLoadError", "Erreur chargement de la version"), "error");
                }
              }}
              value=""
            >
              <option value="" disabled>{get("pdf.versions", "Versions")} ({versions.length})</option>
              {versions.length === 0 ? (
                <option value="" disabled>{get("pdf.noVersionsYet", "Aucune version — ouvrez l'éditeur pour capturer l'original")}</option>
              ) : (
                versions.slice().reverse().map((v: any, i: number) => {
                  const isOriginal = v.timestamp === "original" || (typeof v.backup_name === "string" && v.backup_name.includes("__original"));
                  const label = isOriginal ? "Original" : `v${v.version} ${v.timestamp}`;
                  return (
                    <option key={i} value={v.backup_name}>
                      {label}
                    </option>
                  );
                })
              )}
            </select>
          </div>
        )}

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

      <div className="flex-1 min-h-0 bg-[#111] relative flex">
        {!legacyMode && showPages && (
          <div className="w-[150px] flex-shrink-0 border-r border-hairline bg-[#0a0a0a] overflow-y-auto p-1.5 text-[10px]">
            {thumbnails.length === 0 ? (
              <div className="p-2 text-body-mute">{get("pdf.thumbnailsLoading", "Chargement des pages…")}</div>
            ) : (
              thumbnails.map((t) => (
                <button
                  key={t.page}
                  onClick={() => {
                    const ifr = iframeRef.current;
                    if (ifr?.contentWindow) {
                      ifr.contentWindow.postMessage({ type: "euclide-set-page", page: t.page }, "*");
                    }
                    setCurrentPage(t.page);
                  }}
                  className={`w-full mb-2 overflow-hidden border-2 bg-[#111] ${currentPage === t.page ? "border-tui-accent ring-1 ring-inset ring-tui-accent/40" : "border-hairline"}`}
                  title={`Page ${t.page}`}
                >
                  <img src={t.dataUrl} className="w-full h-auto block" alt={`p${t.page}`} />
                  <div className="text-center text-[10px] leading-none py-0.5 text-body-mute bg-[#0a0a0a]">{t.page}</div>
                </button>
              ))
            )}
          </div>
        )}
        <div className="flex-1 relative min-w-0">
          {!legacyMode && !pdfLoaded && !error && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#111]/90">
              <div className="flex flex-col items-center gap-3">
                <div className="w-5 h-5 border-2 border-white/20 border-t-[#007aff] rounded-full animate-spin" />
                <p className="text-body-mute text-sm">Chargement du PDF…</p>
              </div>
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
                // Fallback: force ready if 'euclide-viewer-ready' post missed.
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
    </div>
  );
}
