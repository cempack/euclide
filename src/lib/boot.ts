import type { PronoteStatus } from "./api";

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
