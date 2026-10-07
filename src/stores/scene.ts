import { create } from "zustand";

/** The classroom scene (features/classroom): open from anywhere. */
const useSceneStore = create<{ open: boolean }>()(() => ({ open: false }));

export const scene = {
  open: () => useSceneStore.setState({ open: true }),
  close: () => useSceneStore.setState({ open: false }),
};

export const useSceneOpen = () => useSceneStore((s) => s.open);
