import { create } from "zustand";

/** What the classroom screen shows: the clock and timer, a name drawn, groups, chance, a QR code. */
export type SceneMode = "clock" | "draw" | "groups" | "chance" | "qr";

type SceneState = {
  open: boolean;
  mode: SceneMode;
  /** The class drawn from; null: the class in progress, from the timetable. */
  className: string | null;
  /** What the QR code says. */
  qrText: string;
};

/** The classroom scene (features/classroom): open from anywhere. */
const useSceneStore = create<SceneState>()(() => ({
  open: false,
  mode: "clock",
  className: null,
  qrText: "",
}));

export const scene = {
  /** As it was last left. */
  open: () => useSceneStore.setState({ open: true }),
  /** On a mode, for a class (Outils, a class's page). */
  openOn: (mode: SceneMode, className: string | null = null) =>
    useSceneStore.setState({ open: true, mode, className }),
  close: () => useSceneStore.setState({ open: false }),
  setMode: (mode: SceneMode) => useSceneStore.setState({ mode }),
  setClass: (className: string | null) => useSceneStore.setState({ className }),
  /** A link or a text as a QR code, full screen. */
  showQr: (text: string) => useSceneStore.setState({ open: true, mode: "qr", qrText: text }),
  setQrText: (qrText: string) => useSceneStore.setState({ qrText }),
};

export const useSceneOpen = () => useSceneStore((s) => s.open);
export const useSceneMode = () => useSceneStore((s) => s.mode);
export const useSceneClass = () => useSceneStore((s) => s.className);
export const useSceneQrText = () => useSceneStore((s) => s.qrText);
