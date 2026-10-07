import { useEffect, useRef, useState, type ReactNode } from "react";

/** Exit transitions last this long (enter: 180 ms; see .eu-dialog in styles.css). */
export const EXIT_MS = 120;

/**
 * Whether something that animates out should still be in the DOM: true as
 * soon as `open` is, and for `exitMs` after it turns false.
 */
export function usePresence(open: boolean, exitMs = EXIT_MS): boolean {
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [open, exitMs]);
  return open || mounted;
}

/**
 * A modal dialog on the native <dialog>: it sits in the top layer, the
 * browser traps focus in it and gives focus back on close; Escape and a
 * click on the backdrop ask the owner to close it. Content stays mounted
 * during the exit transition only.
 */
export function Dialog({
  open,
  onClose,
  label,
  className = "",
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** The dialog's accessible name (usually its title). */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const present = usePresence(open);
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // The browser focuses the first control; [data-autofocus] picks another.
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open, present]);

  if (!present) return null;
  return (
    <dialog
      ref={ref}
      aria-label={label}
      className={`eu-dialog ${className}`}
      onCancel={(e) => {
        // Escape: the owner decides (it may ask to save first).
        e.preventDefault();
        onCloseRef.current();
      }}
      onKeyDown={(e) => {
        // Enter in a field often closes the dialog (« Ajouter »): focus goes
        // back to the button that opened it, and the same key press must not
        // click that button again.
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault();
      }}
      onMouseDown={(e) => {
        // A press on the backdrop lands on the <dialog> itself, outside its box.
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        const inside =
          e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) onCloseRef.current();
      }}
    >
      {children}
    </dialog>
  );
}
