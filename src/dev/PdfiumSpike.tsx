import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import { DocumentManagerPluginPackage } from "@embedpdf/plugin-document-manager";
import { DocumentContent } from "@embedpdf/plugin-document-manager/react";
import { RenderPluginPackage } from "@embedpdf/plugin-render";
import { RenderLayer } from "@embedpdf/plugin-render/react";
import { ScrollPluginPackage } from "@embedpdf/plugin-scroll";
import { Scroller } from "@embedpdf/plugin-scroll/react";
import { TilingPluginPackage } from "@embedpdf/plugin-tiling";
import { TilingLayer } from "@embedpdf/plugin-tiling/react";
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport";
import { Viewport } from "@embedpdf/plugin-viewport/react";
import { ZoomMode, ZoomPluginPackage } from "@embedpdf/plugin-zoom";
import { useZoom } from "@embedpdf/plugin-zoom/react";
import wasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";
import sample from "./fixtures/cours.pdf?url";

/**
 * Development page (?pdfium): the 0.6.0 spike, PDFium (WebAssembly, in a
 * worker) through EmbedPDF, on a sample document or ?pdfium=<url>. Marks
 * `performance` when the engine is up and the first page is drawn.
 */
// Absolute: the engine fetches from a worker, whose base is not the page's.
const url = new URL(new URLSearchParams(location.search).get("pdfium") || sample, location.href).href;
const wasm = new URL(wasmUrl, location.href).href;
performance.mark("pdfium:page");

function Zoom({ documentId }: { documentId: string }) {
  const { state, provides } = useZoom(documentId);
  return (
    <span className="flex gap-1 items-center">
      <button className="eu-btn-ghost eu-btn-sm" onClick={() => provides?.zoomOut()}>
        −
      </button>
      <span data-testid="zoom">{Math.round(state.currentZoomLevel * 100)} %</span>
      <button className="eu-btn-ghost eu-btn-sm" onClick={() => provides?.zoomIn()}>
        +
      </button>
    </span>
  );
}

export default function PdfiumSpike() {
  const { engine, isLoading, error } = usePdfiumEngine({ wasmUrl: wasm, worker: true, fontFallback: null });
  if (error) return <p data-testid="info">engine error {String(error)}</p>;
  if (isLoading || !engine) return <p data-testid="info">engine…</p>;
  performance.mark("pdfium:engine");
  const plugins = [
    createPluginRegistration(DocumentManagerPluginPackage, {
      initialDocuments: [{ url, documentId: "doc", mode: "auto" }],
    }),
    createPluginRegistration(ViewportPluginPackage),
    createPluginRegistration(ScrollPluginPackage),
    createPluginRegistration(RenderPluginPackage),
    createPluginRegistration(TilingPluginPackage),
    createPluginRegistration(ZoomPluginPackage, { defaultZoomLevel: ZoomMode.FitWidth }),
  ];
  return (
    <EmbedPDF engine={engine} plugins={plugins}>
      <DocumentContent documentId="doc">
        {({ documentState, isLoaded, isError }) => (
          <div className="h-full flex flex-col">
            <div className="flex gap-2 p-2 border-b border-line items-center">
              <span data-testid="info">
                {isError
                  ? "error"
                  : isLoaded
                    ? `pages=${documentState.document?.pageCount ?? 0}`
                    : "loading…"}
              </span>
              {isLoaded && <Zoom documentId="doc" />}
            </div>
            {isLoaded && (
              <Viewport documentId="doc" className="flex-1 bg-panel-alt" data-testid="viewport">
                <Scroller
                  documentId="doc"
                  renderPage={({ width, height, pageIndex }) => (
                    <div
                      style={{ width, height, position: "relative", background: "var(--color-paper)" }}
                      data-page={pageIndex}
                    >
                      {/* The whole page at a low scale, sharp tiles over it. */}
                      <RenderLayer
                        documentId="doc"
                        pageIndex={pageIndex}
                        scale={1}
                        style={{ position: "absolute", inset: 0, width, height }}
                      />
                      <TilingLayer
                        documentId="doc"
                        pageIndex={pageIndex}
                        style={{ position: "absolute", inset: 0 }}
                      />
                    </div>
                  )}
                />
              </Viewport>
            )}
          </div>
        )}
      </DocumentContent>
    </EmbedPDF>
  );
}
