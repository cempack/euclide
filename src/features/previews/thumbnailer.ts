import { api, fileUrl, isTauri } from "../../lib/api";
import { changed, onChanged } from "../../api/client";
import { reportError } from "../../lib/report";

/**
 * Draws the Documents grid's previews (page 1 of a PDF, an image) while
 * Euclide is idle, one document at a time, and hands them to Rust
 * (thumbs.rs), which keeps them until the document changes.
 */
const WIDTH = 320;
let running = false;
/** Documents that could not be drawn this session: not retried in a loop. */
const failed = new Set<number>();

function idle(): Promise<void> {
  const ric = (window as { requestIdleCallback?: Window["requestIdleCallback"] }).requestIdleCallback;
  return new Promise((resolve) =>
    ric ? ric(() => resolve(), { timeout: 3000 }) : window.setTimeout(resolve, 300),
  );
}

function jpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
}

async function drawPdf(id: number): Promise<Blob | null> {
  const { openPdf } = await import("../pdf/engine");
  const task = openPdf({ url: fileUrl(id) });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: WIDTH / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return await jpeg(canvas);
  } finally {
    void task.destroy();
  }
}

async function drawImage(id: number): Promise<Blob | null> {
  const img = new Image();
  img.src = fileUrl(id);
  await img.decode();
  const scale = Math.min(1, WIDTH / img.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d")!;
  // JPEG has no transparency: a transparent picture sits on paper.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return jpeg(canvas);
}

async function pass() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const jobs = (await api.missingThumbnails()).filter((j) => !failed.has(j.id));
      if (!jobs.length) return;
      for (const job of jobs) {
        await idle();
        try {
          const blob = job.kind === "pdf" ? await drawPdf(job.id) : await drawImage(job.id);
          if (!blob) throw new Error("aperçu vide");
          await api.saveThumbnail(job.id, await blob.arrayBuffer());
        } catch (err) {
          failed.add(job.id);
          reportError(`thumbs.${job.kind}`, err);
        }
      }
      changed("thumbnails");
    }
  } catch (err) {
    reportError("thumbs.pass", err);
  } finally {
    running = false;
  }
}

/** Starts drawing once startup has settled, and again when the library changes. */
export function startThumbnailer(): () => void {
  if (!isTauri()) return () => {};
  const kick = () => void pass();
  const first = window.setTimeout(kick, 12_000);
  const stop = onChanged("library", kick);
  return () => {
    window.clearTimeout(first);
    stop();
  };
}
