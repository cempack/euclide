import { create } from "zustand";
import { drawName, makeGroups, type GroupsBy } from "../features/classroom/picker";

/**
 * The classroom screen's draw and groups, per class, for the session: back
 * from another class, the draw goes on where it was. A name drawn comes back
 * only with « Recommencer ».
 */
type PickerState = {
  /** Names drawn so far in each class, the last one last. */
  drawn: Record<string, string[]>;
  /** The groups last made in each class. */
  groups: Record<string, string[][]>;
  /** How the last groups were made. */
  by: GroupsBy;
};

const usePickerStore = create<PickerState>()(() => ({ drawn: {}, groups: {}, by: { size: 2 } }));
const state = usePickerStore.getState;
const setState = usePickerStore.setState;

const NO_NAMES: string[] = [];

export const picker = {
  /** The next name of `className`, or null once every name was drawn. */
  draw(className: string, names: string[]): string | null {
    // A name taken off the list since does not count.
    const drawn = (state().drawn[className] ?? NO_NAMES).filter((n) => names.includes(n));
    const name = drawName(names, drawn);
    setState((s) => ({ drawn: { ...s.drawn, [className]: name ? [...drawn, name] : drawn } }));
    return name;
  },

  /** Every name can be drawn again. */
  reset(className: string) {
    setState((s) => ({ drawn: { ...s.drawn, [className]: NO_NAMES } }));
  },

  group(className: string, names: string[], by: GroupsBy) {
    setState((s) => ({ by, groups: { ...s.groups, [className]: makeGroups(names, by) } }));
  },
};

export const useDrawn = (className: string) => usePickerStore((s) => s.drawn[className] ?? NO_NAMES);
export const useGroups = (className: string) => usePickerStore((s) => s.groups[className] ?? null);
export const useGroupsBy = () => usePickerStore((s) => s.by);
