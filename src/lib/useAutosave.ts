import { useEffect, useRef } from "react";

/**
 * Saves by itself: `delay` ms after the last change while something is
 * unsaved, and at once when the editor is hidden (another tab) or the window
 * loses focus (the teacher switches to another program). `change` is any
 * value that changes with each edit, such as the document itself. `save`
 * must report its own errors.
 */
export function useAutosave({
  dirty,
  change,
  visible,
  save,
  delay = 4000,
}: {
  dirty: boolean;
  change: unknown;
  visible: boolean;
  save: () => Promise<void>;
  delay?: number;
}) {
  const latest = useRef({ dirty, save });
  useEffect(() => {
    latest.current = { dirty, save };
  });

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => void latest.current.save(), delay);
    return () => window.clearTimeout(timer);
  }, [dirty, change, delay]);

  useEffect(() => {
    if (!visible && latest.current.dirty) void latest.current.save();
  }, [visible]);

  useEffect(() => {
    const onBlur = () => {
      if (latest.current.dirty) void latest.current.save();
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);
}
