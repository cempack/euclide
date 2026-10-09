import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  Highlighter,
  MousePointer2,
  PenLine,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { fullscreen } from "../../lib/fullscreen";
import { tr, type StringKey } from "../../lib/i18n";
import { typingIn, useShortcut } from "../../lib/keymap";
import { logged } from "../../lib/report";
import { Icon } from "../../ui/Icon";
import { tip } from "../../ui/Tooltip";
import type { PdfTool, PdfViewHandle } from "./PdfView";

/** The bar's tools: a pointer to show with, then what draws on the page. */
const TOOLS: { id: PdfTool; icon: LucideIcon; label: StringKey }[] = [
  { id: "select", icon: MousePointer2, label: "pdf.pointer" },
  { id: "pen", icon: PenLine, label: "pdf.pen" },
  { id: "highlight", icon: Highlighter, label: "pdf.highlight" },
  { id: "eraser", icon: Eraser, label: "pdf.eraser" },
];

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * A PDF presented, one page at a time to the whole screen, as a note's
 * slides are. Keys: → Espace PgSuiv (a presentation clicker) forward;
 * ← PgPréc back; Début / Fin; B or N a black screen, W a white one; Échap
 * to leave. A notch of the wheel turns a page. The bar at the bottom (gone
 * while the pointer rests) has the pointer, the pen, the highlighter, the
 * eraser and undo: what is drawn stays in the document.
 *
 * It lives in the viewer's stage, which DocumentPane lays over the window
 * (`.eu-pdf-presenting`); the viewer fits the page and stops scrolling.
 */
export function Presentation({
  stage,
  view,
  pages,
  first,
  scale,
  tool,
  onTool,
  canUndo,
  readOnly,
  onClose,
}: {
  stage: React.RefObject<HTMLDivElement | null>;
  view: React.RefObject<PdfViewHandle | null>;
  pages: number;
  /** The page in view when presenting starts. */
  first: number;
  /** The zoom: when it changes (the window going full screen), the page is centred again. */
  scale: number;
  tool: PdfTool;
  onTool: (tool: PdfTool) => void;
  canUndo: boolean;
  /** An old version: nothing to draw with. */
  readOnly: boolean;
  /** Leaving, from the page shown last. */
  onClose: (shown: number) => void;
}) {
  const [shown, setShown] = useState(() => Math.max(1, Math.min(pages, first)));
  const shownRef = useRef(shown);
  const [blank, setBlank] = useState<null | "black" | "white">(null);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  const [idle, setIdle] = useState(false);

  const go = (to: number) => {
    setBlank(null);
    const page = Math.max(1, Math.min(pages, to));
    shownRef.current = page;
    setShown(page);
  };

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    void fullscreen(true, el).catch(logged("pdf.present"));
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    // The window growing to the screen moves the page: centred again.
    const ro = new ResizeObserver(() => view.current?.goTo(shownRef.current, true));
    ro.observe(el);
    return () => {
      window.clearInterval(tick);
      ro.disconnect();
      void fullscreen(false, el).catch(logged("pdf.present"));
    };
  }, [stage, view]);

  // The page in the middle of the screen, once the zoom has its new value.
  useEffect(() => {
    const t = window.setTimeout(() => view.current?.goTo(shown, true), 30);
    return () => window.clearTimeout(t);
  }, [view, shown, scale]);

  // The pointer and the bar go when the pointer rests, as in a slideshow.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wake = () => setIdle(false);
    el.addEventListener("pointermove", wake);
    el.addEventListener("pointerdown", wake);
    return () => {
      el.removeEventListener("pointermove", wake);
      el.removeEventListener("pointerdown", wake);
    };
  }, [stage]);
  useEffect(() => {
    if (idle) return;
    const t = window.setTimeout(() => setIdle(true), 2500);
    return () => window.clearTimeout(t);
  }, [idle, shown]);

  // What the stage shows of the pointer: none at rest, a red dot to point with.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    el.toggleAttribute("data-idle", idle);
    el.toggleAttribute("data-pointer", tool === "select");
  }, [stage, idle, tool]);
  useEffect(() => {
    const el = stage.current;
    return () => {
      el?.removeAttribute("data-idle");
      el?.removeAttribute("data-pointer");
    };
  }, [stage]);

  // Keys go to the presentation before the viewer (Ctrl+Z and the like
  // still reach it). Échap is a shortcut of the app's: the last one bound
  // wins, so it leaves the presentation rather than projection mode.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typingIn(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (blank && k !== "Escape") setBlank(null);
      else if (["ArrowRight", "ArrowDown", " ", "PageDown", "Enter"].includes(k)) go(shownRef.current + 1);
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(k)) go(shownRef.current - 1);
      else if (k === "Home") go(1);
      else if (k === "End") go(pages);
      else if (["b", "B", "n", "N", "."].includes(k)) setBlank("black");
      else if (["w", "W", ","].includes(k)) setBlank("white");
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", down, true);
    return () => window.removeEventListener("keydown", down, true);
  });
  useShortcut("leaveProjection", () => {
    if (typingIn(document.activeElement)) return false;
    onClose(shownRef.current);
  });

  // A notch of the wheel turns one page; a fling of the touchpad, one too.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    let sum = 0;
    let last = 0;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.ctrlKey) return;
      sum += e.deltaY;
      if (Math.abs(sum) < 50) return;
      const at = Date.now();
      if (at - last > 300) go(shownRef.current + Math.sign(sum));
      last = at;
      sum = 0;
    };
    el.addEventListener("wheel", wheel, { capture: true, passive: false });
    return () => el.removeEventListener("wheel", wheel, { capture: true });
    // go only reads refs and the page count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, pages]);

  return (
    <>
      <style>{`.eu-pdf-presenting .eu-pdf-page:not([data-page="${shown}"]) { visibility: hidden; }`}</style>
      {blank && (
        <div
          className={`eu-pdf-present-blank ${blank === "white" ? "bg-paper" : "eu-slides-blank-black"}`}
          onPointerDown={() => setBlank(null)}
        />
      )}
      <div role="toolbar" aria-label={tr("pdf.present")} className="eu-pdf-present-bar">
        <button
          type="button"
          onClick={() => go(shown - 1)}
          disabled={shown <= 1}
          aria-label={tr("board.prevPage")}
          className="eu-pdf-present-btn"
          {...tip(tr("board.prevPage"), "←")}
        >
          <Icon icon={ChevronLeft} />
        </button>
        <span className="eu-pdf-present-count" aria-live="polite">
          {shown} / {pages}
        </span>
        <button
          type="button"
          onClick={() => go(shown + 1)}
          disabled={shown >= pages}
          aria-label={tr("board.nextPage")}
          className="eu-pdf-present-btn"
          {...tip(tr("board.nextPage"), "→")}
        >
          <Icon icon={ChevronRight} />
        </button>
        <span className="eu-pdf-present-clock">{clock(now - startedAt)}</span>
        {!readOnly && (
          <>
            <span className="eu-pdf-present-sep" />
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onTool(t.id)}
                aria-pressed={tool === t.id}
                aria-label={tr(t.label)}
                className="eu-pdf-present-btn"
                {...tip(tr(t.label))}
              >
                <Icon icon={t.icon} />
              </button>
            ))}
            <button
              type="button"
              onClick={() => view.current?.undo()}
              disabled={!canUndo}
              aria-label={tr("common.undo")}
              className="eu-pdf-present-btn"
              {...tip(tr("common.undo"), "mod+Z")}
            >
              <Icon icon={Undo2} />
            </button>
          </>
        )}
        <span className="eu-pdf-present-sep" />
        <button
          type="button"
          onClick={() => onClose(shownRef.current)}
          className="eu-pdf-present-btn"
          {...tip(tr("pdf.presentExit"), "esc")}
        >
          <Icon icon={X} />
          {tr("pdf.presentExit")}
        </button>
      </div>
    </>
  );
}
