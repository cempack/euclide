import { computePosition, flip, offset, shift, type Placement, type VirtualElement } from "@floating-ui/dom";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { shortcutText } from "../lib/shortcuts";
import { Icon } from "./Icon";

export type MenuEntry =
  | {
      label: string;
      icon?: LucideIcon;
      /** Shortcut shown on the right, e.g. "mod+W". */
      keys?: string;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | "separator";

type Anchor = HTMLElement | VirtualElement;

/**
 * A menu in the top layer (popover="auto": a click outside or Escape closes
 * it). Arrow keys, Home/End and typing a few letters move between items;
 * Enter or Space picks one; focus goes back where it came from.
 */
export function Menu({
  id,
  open,
  anchor,
  items,
  label,
  placement = "bottom-start",
  onClose,
}: {
  id?: string;
  open: boolean;
  anchor: Anchor | null;
  items: MenuEntry[];
  label: string;
  placement?: Placement;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const typed = useRef({ text: "", at: 0 });
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const menu = ref.current;
    if (!menu || !open || !anchor) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    menu.showPopover();
    void computePosition(anchor, menu, {
      placement,
      strategy: "fixed",
      middleware: [offset(4), flip(), shift({ padding: 6 })],
    }).then(({ x, y }) => {
      menu.style.translate = `${Math.round(x)}px ${Math.round(y)}px`;
    });
    menu.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
    // Light dismiss (outside click, Escape) closes the popover by itself.
    const onToggle = (e: Event) => {
      if ((e as ToggleEvent).newState === "closed") onCloseRef.current();
    };
    menu.addEventListener("toggle", onToggle);
    return () => {
      menu.removeEventListener("toggle", onToggle);
      if (menu.matches(":popover-open")) menu.hidePopover();
      restoreRef.current?.focus?.();
    };
  }, [open, anchor, placement]);

  const enabled = () =>
    Array.from(
      ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [],
    );

  const onKeyDown = (e: KeyboardEvent) => {
    const list = enabled();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => list[(i + list.length) % list.length]?.focus();
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key === "Tab") onClose();
    else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey) {
      // Typeahead: letters typed within a second spell the start of an item.
      const now = performance.now();
      typed.current.text = (now - typed.current.at < 1000 ? typed.current.text : "") + e.key.toLowerCase();
      typed.current.at = now;
      const match =
        list.slice(at + 1).find((el) => el.textContent?.toLowerCase().startsWith(typed.current.text)) ??
        list.find((el) => el.textContent?.toLowerCase().startsWith(typed.current.text));
      match?.focus();
    } else return;
    e.preventDefault();
  };

  return (
    <div
      ref={ref}
      id={id}
      popover="auto"
      role="menu"
      aria-label={label}
      className="eu-menu"
      onKeyDown={onKeyDown}
    >
      {open &&
        items.map((item, i) =>
          item === "separator" ? (
            <div key={`sep-${i}`} role="separator" className="eu-menu-sep" />
          ) : (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-disabled={item.disabled || undefined}
              data-danger={item.danger || undefined}
              className="eu-menu-item"
              onClick={() => {
                if (item.disabled) return;
                onClose();
                item.onSelect();
              }}
            >
              {item.icon ? <Icon icon={item.icon} /> : <span className="w-4" />}
              <span className="flex-1 truncate">{item.label}</span>
              {item.keys && <span className="eu-t-caption">{shortcutText(item.keys)}</span>}
            </button>
          ),
        )}
    </div>
  );
}

/** A button that opens a menu below it. */
export function MenuButton({
  label,
  items,
  children,
  className = "eu-btn-quiet eu-btn-icon eu-btn-sm",
  placement,
}: {
  /** Accessible name of the button and the menu. */
  label: string;
  items: MenuEntry[];
  children: ReactNode;
  className?: string;
  placement?: Placement;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // A press on the button first light-dismisses the open menu; the click
  // that follows must not open it again.
  const closedAt = useRef(0);
  const id = useId();
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        aria-controls={id}
        data-tip={label}
        className={className}
        onClick={(e) => {
          if (anchor || performance.now() - closedAt.current < 300) return;
          setAnchor(e.currentTarget);
        }}
      >
        {children}
      </button>
      <Menu
        id={id}
        open={!!anchor}
        anchor={anchor}
        items={items}
        label={label}
        placement={placement}
        onClose={() => {
          closedAt.current = performance.now();
          setAnchor(null);
        }}
      />
    </>
  );
}
