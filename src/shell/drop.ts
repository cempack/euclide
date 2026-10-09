/**
 * Files dropped on the window go to the library (App.tsx), unless they are
 * dropped over a pane that takes them: a note takes pictures. A pane adds
 * the element it covers while it is open; a hidden tab (display: none) is
 * never under the pointer.
 */
export type DropTarget = {
  el: HTMLElement;
  /** Whether the pane takes these files, by their paths. */
  takes: (paths: string[]) => boolean;
  /** `at`: where they were dropped, in the page's pixels. */
  drop: (paths: string[], at: { x: number; y: number }) => void;
  /** What the drop overlay says over the pane. */
  title: string;
  hint: string;
};

const targets = new Set<DropTarget>();

export function addDropTarget(target: DropTarget): () => void {
  targets.add(target);
  return () => targets.delete(target);
}

/**
 * The pane under a point of the window that takes `paths`, and the point
 * in the page's pixels; null for the library. Tauri gives the point in
 * physical pixels; the page lays out in CSS pixels.
 */
export function dropTargetAt(
  position: { x: number; y: number } | undefined,
  paths: string[],
): { target: DropTarget; at: { x: number; y: number } } | null {
  if (!position || !paths.length) return null;
  const ratio = window.devicePixelRatio || 1;
  const at = { x: position.x / ratio, y: position.y / ratio };
  const under = document.elementFromPoint(at.x, at.y);
  if (!under) return null;
  for (const target of targets) if (target.el.contains(under) && target.takes(paths)) return { target, at };
  return null;
}
