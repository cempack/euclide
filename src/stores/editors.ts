import { create } from "zustand";

/**
 * What the open editors (notes, whiteboards, Python scripts) tell the rest
 * of the app: which tabs hold unsaved changes, and how to save each one. The
 * « unsaved changes » prompt, Ctrl+S and the tab limit all go through here.
 */
type DirtyMap = Readonly<Record<string, true>>;

const useDirtyStore = create<{ dirty: DirtyMap }>()(() => ({ dirty: {} }));

const flushers = new Map<string, () => Promise<void>>();
const discarded = new Set<string>();

function setDirtyMap(update: (map: Record<string, true>) => void) {
  const next = { ...useDirtyStore.getState().dirty };
  update(next);
  useDirtyStore.setState({ dirty: next });
}

export const editors = {
  setDirty(id: string, dirty: boolean) {
    if (!!useDirtyStore.getState().dirty[id] === dirty) return;
    setDirtyMap((map) => {
      if (dirty) map[id] = true;
      else delete map[id];
    });
  },

  isDirty: (id: string) => !!useDirtyStore.getState().dirty[id],

  dirtyMap: (): DirtyMap => useDirtyStore.getState().dirty,

  /** The editor in tab `id` knows how to save itself; returns the unregister. */
  registerFlush(id: string, fn: () => Promise<void>): () => void {
    flushers.set(id, fn);
    return () => {
      if (flushers.get(id) === fn) flushers.delete(id);
    };
  },

  async flush(id: string) {
    await flushers.get(id)?.();
  },

  /** A tab closed: `discard` tells its editor not to save on unmount. */
  forget(id: string, discard = false) {
    if (discard) discarded.add(id);
    flushers.delete(id);
    if (useDirtyStore.getState().dirty[id]) setDirtyMap((map) => void delete map[id]);
  },

  /** True once if the tab was closed with `discard`; editors check it on unmount. */
  takeDiscarded: (id: string) => discarded.delete(id),

  /** A new note or board got its id, and its tab a new one. */
  retarget(oldId: string, newId: string) {
    if (useDirtyStore.getState().dirty[oldId]) {
      setDirtyMap((map) => {
        delete map[oldId];
        map[newId] = true;
      });
    }
    const fn = flushers.get(oldId);
    if (fn) {
      flushers.delete(oldId);
      flushers.set(newId, fn);
    }
  },
};

/**
 * Editors publish their unsaved flag from an effect, so it changes when React
 * commits, a moment after a save resolves (and a failed save that only shows
 * a toast leaves it set). Wait for this before reading it back.
 */
export const afterCommit = () => new Promise((resolve) => window.setTimeout(resolve, 50));

/** The unsaved-changes dots: only their readers re-render when one changes. */
export function useDirtyMap(): DirtyMap {
  return useDirtyStore((s) => s.dirty);
}
