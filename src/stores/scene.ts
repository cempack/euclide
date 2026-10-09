import { create } from "zustand";

/** What the classroom screen shows: the clock and timer, a name drawn, groups, chance. */
export type SceneMode = "clock" | "draw" | "groups" | "chance";

type SceneState = {
  open: boolean;
  mode: SceneMode;
  /** The class drawn from; null: the class in progress, from the timetable. */
  className: string | null;
};

/** The classroom scene (features/classroom): open from anywhere. */
const useSceneStore = create<SceneState>()(() => ({ open: false, mode: "clock", className: null }));

export const scene = {
  /** As it was last left. */
  open: () => useSceneStore.setState({ open: true }),
  /** On a mode, for a class (Outils, a class's page). */
  openOn: (mode: SceneMode, className: string | null = null) =>
    useSceneStore.setState({ open: true, mode, className }),
  close: () => useSceneStore.setState({ open: false }),
  setMode: (mode: SceneMode) => useSceneStore.setState({ mode }),
  setClass: (className: string | null) => useSceneStore.setState({ className }),
};

export const useSceneOpen = () => useSceneStore((s) => s.open);
export const useSceneMode = () => useSceneStore((s) => s.mode);
export const useSceneClass = () => useSceneStore((s) => s.className);
