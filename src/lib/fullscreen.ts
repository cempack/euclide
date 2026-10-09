import { isTauri } from "./api";

/**
 * The window full screen while presenting (and back after). In a browser,
 * the element itself: the whole page would cover it in the top layer.
 */
export async function fullscreen(on: boolean, el: HTMLElement) {
  if (isTauri()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setFullscreen(on);
  } else if (on) {
    await el.requestFullscreen?.();
  } else if (document.fullscreenElement) {
    await document.exitFullscreen();
  }
}
