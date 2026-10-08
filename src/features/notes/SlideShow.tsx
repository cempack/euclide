import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isTauri } from "../../lib/api";
import { tr } from "../../lib/i18n";
import { logged } from "../../lib/report";
import { Markdown } from "./Markdown";
import { isTitleSlide, splitSlides } from "./slides";

/**
 * The window full screen while presenting (and back after). In a browser,
 * the slides element itself: the whole page would cover it in the top layer.
 */
async function fullscreen(on: boolean, el: HTMLElement) {
  if (isTauri()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setFullscreen(on);
  } else if (on) {
    await el.requestFullscreen?.();
  } else if (document.fullscreenElement) {
    await document.exitFullscreen();
  }
}

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * A note presented as slides, full screen, on paper. Keys: → Espace PgSuiv
 * (a presentation clicker) forward; ← PgPréc back; Début / Fin; B or N a
 * black screen, W or Blanc a white one; Échap to leave. A click goes
 * forward, a right click back.
 */
export default function Slides({
  markdown,
  title,
  onClose,
}: {
  markdown: string;
  title: string;
  onClose: () => void;
}) {
  const slides = splitSlides(markdown);
  const count = Math.max(1, slides.length);
  const [index, setIndex] = useState(0);
  const [blank, setBlank] = useState<null | "black" | "white">(null);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  const [idle, setIdle] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [fontsReady, setFontsReady] = useState(false);

  const go = (to: number) => {
    setBlank(null);
    setIndex(Math.max(0, Math.min(count - 1, to)));
  };

  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    void fullscreen(true, dialog).catch(logged("slides.fullscreen"));
    void document.fonts.ready.then(() => setFontsReady(true));
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const ro = new ResizeObserver(() => {
      const box = boxRef.current;
      if (box) setSize({ w: box.clientWidth, h: box.clientHeight });
    });
    if (boxRef.current) ro.observe(boxRef.current);
    return () => {
      window.clearInterval(tick);
      ro.disconnect();
      void fullscreen(false, dialog).catch(logged("slides.fullscreen"));
    };
  }, []);

  // The pointer disappears when it stops moving, like in a slideshow.
  useEffect(() => {
    if (idle) return;
    const t = window.setTimeout(() => setIdle(true), 2000);
    return () => window.clearTimeout(t);
  }, [idle, index]);

  // The largest text that fits: start big, shrink until nothing overflows.
  useLayoutEffect(() => {
    const box = boxRef.current;
    const body = bodyRef.current;
    if (!box || !body || !size.w) return;
    const title = isTitleSlide(slides[index] ?? "");
    let px = Math.min(size.h / (title ? 7 : 11), size.w / (title ? 14 : 20));
    body.style.fontSize = `${px}px`;
    for (
      let i = 0;
      i < 30 && (body.scrollHeight > box.clientHeight || body.scrollWidth > box.clientWidth);
      i++
    ) {
      px *= 0.92;
      body.style.fontSize = `${px}px`;
    }
    // slides is derived from markdown, which does not change while presenting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, size, fontsReady]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (blank && !["Escape"].includes(k)) {
      setBlank(null);
      e.preventDefault();
      return;
    }
    if (["ArrowRight", "ArrowDown", " ", "PageDown", "Enter"].includes(k)) go(index + 1);
    else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(k)) go(index - 1);
    else if (k === "Home") go(0);
    else if (k === "End") go(count - 1);
    else if (k === "b" || k === "B" || k === "n" || k === "N" || k === ".") setBlank("black");
    else if (k === "w" || k === "W" || k === ",") setBlank("white");
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const slide = slides[index] ?? "";
  const titleSlide = isTitleSlide(slide);
  return (
    <dialog
      ref={dialogRef}
      className={`eu-slides ${idle ? "cursor-none" : ""}`}
      aria-label={tr("slides.label", { title })}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={onKeyDown}
      onMouseMove={() => setIdle(false)}
      onClick={() => (blank ? setBlank(null) : go(index + 1))}
      onContextMenu={(e) => {
        e.preventDefault();
        go(index - 1);
      }}
    >
      <div ref={boxRef} className={`eu-slide ${titleSlide ? "eu-slide-title" : ""}`}>
        <div ref={bodyRef} className="eu-slide-body" aria-live="polite">
          {slide ? <Markdown body={slide} /> : <p className="text-paper-ink/60">{tr("slides.empty")}</p>}
        </div>
      </div>
      <div className="eu-slides-progress" style={{ width: `${((index + 1) / count) * 100}%` }} />
      <div className={`eu-slides-chip ${idle ? "opacity-0" : ""}`}>
        {index + 1} / {count} · {clock(now - startedAt)}
      </div>
      {blank && (
        <div className={`eu-slides-blank ${blank === "white" ? "bg-paper" : "eu-slides-blank-black"}`} />
      )}
    </dialog>
  );
}
