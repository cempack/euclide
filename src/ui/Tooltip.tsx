import { computePosition, flip, offset, shift, type Placement } from "@floating-ui/dom";
import { useEffect, useRef } from "react";
import { shortcutKeys } from "../lib/shortcuts";

/**
 * Tooltips for the whole app, from one element. Anything with `data-tip`
 * (and optionally `data-tip-keys="mod+K"`, `data-tip-place="right"`) shows
 * its tip after half a second of hover, or on keyboard focus; moving along a
 * toolbar shows the next one at once. The tip lives in the top layer, above
 * dialogs, and is filled in directly: hovering never re-renders React.
 *
 * A tip only adds to an element: an icon-only button still needs its
 * aria-label.
 */
const DELAY_MS = 500;
const FOCUS_DELAY_MS = 150;
/** After a tip hides, the next one within this window shows at once. */
const CHAIN_MS = 300;

export function tip(text: string, keys?: string): { "data-tip": string; "data-tip-keys"?: string } {
  return keys ? { "data-tip": text, "data-tip-keys": keys } : { "data-tip": text };
}

const supportsPopover = typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;

export function TooltipLayer() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let anchor: HTMLElement | null = null;
    let pending = 0;
    let hiddenAt = 0;
    let addedDescribedBy = false;

    const fill = (from: HTMLElement) => {
      const text = document.createElement("span");
      text.textContent = from.dataset.tip ?? "";
      const parts: Node[] = [text];
      if (from.dataset.tipKeys) {
        const keys = document.createElement("span");
        keys.className = "eu-tooltip-keys";
        for (const key of shortcutKeys(from.dataset.tipKeys)) {
          const kbd = document.createElement("kbd");
          kbd.textContent = key;
          keys.append(kbd);
        }
        parts.push(keys);
      }
      el.replaceChildren(...parts);
    };

    const show = (target: HTMLElement) => {
      if (!target.isConnected || !target.dataset.tip) return;
      anchor = target;
      fill(target);
      if (supportsPopover) el.showPopover();
      el.dataset.open = "true";
      if (!target.hasAttribute("aria-describedby")) {
        target.setAttribute("aria-describedby", el.id);
        addedDescribedBy = true;
      }
      const placement = (target.dataset.tipPlace as Placement | undefined) ?? "bottom";
      void computePosition(target, el, {
        placement,
        strategy: "fixed",
        middleware: [offset(6), flip(), shift({ padding: 6 })],
      }).then(({ x, y }) => {
        if (anchor !== target) return;
        el.style.translate = `${Math.round(x)}px ${Math.round(y)}px`;
      });
    };

    const hide = () => {
      window.clearTimeout(pending);
      if (!anchor) return;
      if (addedDescribedBy) anchor.removeAttribute("aria-describedby");
      addedDescribedBy = false;
      anchor = null;
      hiddenAt = performance.now();
      el.dataset.open = "false";
      if (supportsPopover && el.matches(":popover-open")) el.hidePopover();
    };

    const schedule = (target: HTMLElement, delay: number) => {
      window.clearTimeout(pending);
      pending = window.setTimeout(() => show(target), delay);
    };

    const tipped = (node: EventTarget | null) =>
      node instanceof Element ? node.closest<HTMLElement>("[data-tip]") : null;

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch" || e.buttons) return;
      const target = tipped(e.target);
      if (target === anchor) return;
      hide();
      if (!target) return;
      schedule(target, performance.now() - hiddenAt < CHAIN_MS ? 0 : DELAY_MS);
    };
    const onOut = (e: PointerEvent) => {
      const target = tipped(e.target);
      if (target && !target.contains(e.relatedTarget as Node | null)) hide();
    };
    const onFocus = (e: FocusEvent) => {
      const target = tipped(e.target);
      if (target && target.matches(":focus-visible")) {
        hide();
        schedule(target, FOCUS_DELAY_MS);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", hide);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  return (
    <div
      ref={ref}
      id="eu-tooltip"
      role="tooltip"
      className="eu-tooltip"
      data-open="false"
      {...(supportsPopover ? { popover: "manual" as const } : {})}
    />
  );
}
