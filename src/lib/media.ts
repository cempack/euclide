import { useSyncExternalStore } from "react";

/** Whether a media query matches now, kept current as the window changes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Below this window width the sidebar is a rail of icons. */
export const NARROW_WINDOW = "(max-width: 1099px)";
