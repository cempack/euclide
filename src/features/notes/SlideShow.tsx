import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { api } from "../../lib/api";
import { fullscreen } from "../../lib/fullscreen";
import { tr } from "../../lib/i18n";
import { logged } from "../../lib/report";
import { useIdle } from "../../lib/useIdle";
import { Icon } from "../../ui/Icon";
import { tip } from "../../ui/Tooltip";
import { Markdown } from "./Markdown";
import { isTitleSlide, splitSlides } from "./slides";

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * A note presented as slides, full screen, on paper. Keys: → Espace PgSuiv
 * (a presentation clicker) forward; ← PgPréc back; Début / Fin; B or N a
 * black screen, W or Blanc a white one; Échap to leave. A click goes
 * forward, a right click back. The bar at the bottom (gone while the
 * pointer rests) does the same for a touch screen, and leaves.
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
  // The pointer and the bar go when the pointer rests, as in a slideshow.
  const { idle, wake, hold } = useIdle(2000);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [fontsReady, setFontsReady] = useState(false);
  // Pictures loaded (or failed) so far: each one changes the slide's height.
  const [pictures, setPictures] = useState(0);

  const go = (to: number) => {
    setBlank(null);
    setIndex(Math.max(0, Math.min(count - 1, to)));
  };

  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    // The keys are the slides', not the bar's first button.
    dialog.focus();
    // Counted for the statistics (jobs/stats.rs), like any action.
    api.logEvent("slides_present", "", null).catch(() => {});
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

  // A picture that loads, or fails and leaves a notice in its place, changes
  // the slide's height: fit again. Neither event bubbles, but both are seen
  // on their way down; listening before the first paint misses none.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const changed = () => setPictures((n) => n + 1);
    body.addEventListener("load", changed, true);
    body.addEventListener("error", changed, true);
    return () => {
      body.removeEventListener("load", changed, true);
      body.removeEventListener("error", changed, true);
    };
  }, []);

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
  }, [index, size, fontsReady, pictures]);

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
      tabIndex={-1}
      className={`eu-slides ${idle ? "cursor-none" : ""}`}
      aria-label={tr("slides.label", { title })}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={onKeyDown}
      onPointerMove={wake}
      onPointerDown={wake}
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
      {/* A click on the bar is the bar's, not the next slide; it leaves the
          focus on the slides, which take the keys. */}
      <div
        role="toolbar"
        aria-label={tr("slides.present")}
        className="eu-pdf-present-bar"
        data-idle={idle || undefined}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onMouseDown={(e) => e.preventDefault()}
        onPointerEnter={() => hold(true)}
        onPointerLeave={() => hold(false)}
      >
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index <= 0}
          aria-label={tr("slides.prev")}
          className="eu-pdf-present-btn"
          {...tip(tr("slides.prev"), "←")}
        >
          <Icon icon={ChevronLeft} />
        </button>
        <span className="eu-pdf-present-count">
          {index + 1} / {count}
        </span>
        <button
          type="button"
          onClick={() => go(index + 1)}
          disabled={index >= count - 1}
          aria-label={tr("slides.next")}
          className="eu-pdf-present-btn"
          {...tip(tr("slides.next"), "→")}
        >
          <Icon icon={ChevronRight} />
        </button>
        <span className="eu-pdf-present-clock">{clock(now - startedAt)}</span>
        <span className="eu-pdf-present-sep" />
        <button
          type="button"
          onClick={onClose}
          className="eu-pdf-present-btn"
          {...tip(tr("pdf.presentExit"), "esc")}
        >
          <Icon icon={X} />
          {tr("pdf.presentExit")}
        </button>
      </div>
      {blank && (
        <div className={`eu-slides-blank ${blank === "white" ? "bg-paper" : "eu-slides-blank-black"}`} />
      )}
    </dialog>
  );
}
