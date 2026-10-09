import type { PronoteStatus, RestoreReport } from "./api";

/**
 * The boot state the backend injects before any script runs (see
 * src-tauri/src/boot.rs): every UI setting, the Pronote status. The first
 * render reads it instead of waiting for IPC round trips.
 *
 * It describes the moment the window was created, so a reload of the page
 * must not trust it: each launch has its own nonce, remembered in
 * sessionStorage (which survives a reload, not a relaunch) once used.
 */
type BootState = {
  nonce: string;
  settings: Record<string, string | null>;
  pronote?: PronoteStatus;
  /** Set on the first launch after an update. */
  updated?: { from: string; to: string } | null;
  /** Set on the launch that restored a snapshot (or failed to). */
  restored?: RestoreReport | null;
};

declare global {
  interface Window {
    __EUCLIDE_BOOT__?: BootState;
  }
}

const USED_KEY = "eu:boot";

function take(): BootState | null {
  const boot = typeof window === "undefined" ? undefined : window.__EUCLIDE_BOOT__;
  if (!boot || typeof boot !== "object" || !boot.settings) return null;
  try {
    if (sessionStorage.getItem(USED_KEY) === boot.nonce) return null;
    sessionStorage.setItem(USED_KEY, boot.nonce);
  } catch {
    // Storage disabled: the state is still right for this first load.
  }
  return boot;
}

const boot = take();

/**
 * A UI setting as saved at launch: its value, null when never saved, or
 * undefined when unknown (browser mode, page reload, not a UI setting).
 */
export function bootSetting(key: string): string | null | undefined {
  if (!boot || !Object.hasOwn(boot.settings, key)) return undefined;
  return boot.settings[key];
}

/** The next `getSetting` of this key goes to the backend. */
export function forgetBootSetting(key: string) {
  if (boot) delete boot.settings[key];
}

/** The Pronote status at launch, handed out once. */
export function takeBootPronote(): PronoteStatus | undefined {
  const status = boot?.pronote;
  if (boot) delete boot.pronote;
  return status;
}

/** The update this launch follows, if any: told once. */
export function takeBootUpdate(): { from: string; to: string } | null {
  const updated = boot?.updated ?? devUpdate();
  if (boot) boot.updated = null;
  return updated;
}

/** Development only: `?updated=0.4.2` plays the first launch after an update from that version. */
function devUpdate(): { from: string; to: string } | null {
  if (!import.meta.env.DEV || typeof location === "undefined") return null;
  const from = new URLSearchParams(location.search).get("updated");
  return from ? { from, to: "dev" } : null;
}

/** The restore this launch did or refused, if any: told once. */
export function takeBootRestore(): RestoreReport | null {
  const restored = boot?.restored ?? null;
  if (boot) boot.restored = null;
  return restored;
}
