import { useEffect, useRef } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import { tr } from "../../lib/i18n";

const WIDTH = 120;

/**
 * The pages as small pictures, each drawn the first time it scrolls into
 * view (a 200-page manual does not render 200 pages up front).
 */
export function Thumbnails({
  doc,
  page,
  onGo,
}: {
  doc: PDFDocumentProxy;
  page: number;
  onGo: (page: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const tasks: RenderTask[] = [];
    const drawn = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const canvas = entry.target.querySelector("canvas");
          const n = Number((entry.target as HTMLElement).dataset.page);
          if (!canvas || drawn.has(n)) continue;
          drawn.add(n);
          void doc.getPage(n).then((p) => {
            const base = p.getViewport({ scale: 1 });
            const dpr = window.devicePixelRatio || 1;
            const viewport = p.getViewport({ scale: (WIDTH / base.width) * dpr });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const task = p.render({ canvas, viewport });
            tasks.push(task);
            task.promise.catch(() => {
              // Cancelled when the list closes: nothing to do.
            });
          });
        }
      },
      { root: list, rootMargin: "200px" },
    );
    for (const item of list.querySelectorAll("[data-page]")) observer.observe(item);
    return () => {
      observer.disconnect();
      for (const task of tasks) task.cancel();
    };
  }, [doc]);

  // The current page stays in sight as the document scrolls.
  useEffect(() => {
    listRef.current?.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ block: "nearest" });
  }, [page]);

  return (
    <div
      ref={listRef}
      className="h-full overflow-y-auto p-2 flex flex-col gap-2"
      aria-label={tr("pdf.pages")}
    >
      {Array.from({ length: doc.numPages }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          data-page={n}
          onClick={() => onGo(n)}
          aria-current={n === page ? "page" : undefined}
          aria-label={tr("pdf.pageN", { n })}
          className={`eu-pdf-thumb ${n === page ? "eu-pdf-thumb-current" : ""}`}
        >
          <canvas className="block w-full h-auto bg-paper" style={{ minHeight: WIDTH * 1.2 }} />
          <span className="block text-center font-mono text-caption text-stage-muted py-1">{n}</span>
        </button>
      ))}
    </div>
  );
}
