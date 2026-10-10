import { useCallback, useEffect, useRef, useState } from "react";

/**
 * What a projected screen (slides, a PDF presented, the classroom scene)
 * hides while the pointer rests: the pointer itself and the controls.
 * `wake` on every move or press brings them back and starts the wait again;
 * `hold` keeps them while the pointer is over the controls.
 */
export function useIdle(ms: number) {
  const [idle, setIdle] = useState(false);
  const timer = useRef(0);
  const held = useRef(false);
  const wake = useCallback(() => {
    setIdle(false);
    window.clearTimeout(timer.current);
    if (!held.current) timer.current = window.setTimeout(() => setIdle(true), ms);
  }, [ms]);
  const hold = useCallback(
    (on: boolean) => {
      held.current = on;
      wake();
    },
    [wake],
  );
  useEffect(() => {
    timer.current = window.setTimeout(() => setIdle(true), ms);
    return () => window.clearTimeout(timer.current);
  }, [ms]);
  return { idle, wake, hold };
}
