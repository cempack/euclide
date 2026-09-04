import { useEffect, useRef } from "react";

/**
 * Run `refresh` on first visible mount and on `events` while visible.
 * Hidden tabs only mark themselves stale and refresh when shown again.
 */
export function useVisibleRefresh(visible: boolean, refresh: () => void, events: readonly string[]) {
  const staleRef = useRef(false);
  const didInitRef = useRef(false);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (visible && (!didInitRef.current || staleRef.current)) {
      didInitRef.current = true;
      staleRef.current = false;
      refreshRef.current();
    }
    const onChange = () => {
      if (visible) refreshRef.current();
      else staleRef.current = true;
    };
    for (const ev of events) window.addEventListener(ev, onChange);
    return () => {
      for (const ev of events) window.removeEventListener(ev, onChange);
    };
  }, [visible, events]);
}
