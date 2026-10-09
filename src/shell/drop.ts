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
  drop: (paths: string[]) => void;
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
 * The pane under a point of the window that takes `paths`, or null. Tauri
 * gives the point in physical pixels; the page lays out in CSS pixels.
 */
export function dropTargetAt(
  position: { x: number; y: number } | undefined,
  paths: string[],
): DropTarget | null {
  if (!position || !paths.length) return null;
  const ratio = window.devicePixelRatio || 1;
  const under = document.elementFromPoint(position.x / ratio, position.y / ratio);
  if (!under) return null;
  for (const t of targets) if (t.el.contains(under) && t.takes(paths)) return t;
  return null;
}
