import { Channel, invoke } from "@tauri-apps/api/core";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { api, isTauri } from "./api";

export type AppUpdateInfo = {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
};

export type UpdateDownloadProgress = {
  downloaded: number;
  contentLength: number | null;
};

const DISMISS_KEY = "euclide.updateDismissed";
const WINDOWS_PORTABLE_TARGET = "windows-x86_64";

let pending: Update | null = null;
let inflight: Promise<AppUpdateInfo | null> | null = null;
let portableWindows: boolean | null = null;

export function wasUpdateDismissed(version: string): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === version;
  } catch {
    return false;
  }
}

export function dismissAvailableUpdate(version: string): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, version);
  } catch {
    /* private mode / storage blocked */
  }
}

export function updaterSupported(): boolean {
  return isTauri();
}

export async function isPortableWindowsUpdate(): Promise<boolean> {
  if (portableWindows != null) return portableWindows;
  try {
    const info = await api.appInfo();
    portableWindows = Boolean(info?.windows_portable);
  } catch {
    portableWindows = false;
  }
  return portableWindows;
}

function metadataOf(update: Update): AppUpdateInfo {
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    date: update.date,
    body: update.body,
  };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** Quiet check: missing GitHub latest release is not an app error. */
export function isNoPublishedUpdate(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return (
    msg.includes("404") ||
    msg.includes("not found") ||
    msg.includes("could not fetch a valid release") ||
    msg.includes("failed to check update") ||
    msg.includes("error decoding response body")
  );
}

function progressFromEvent(
  event: DownloadEvent,
  downloaded: number,
  contentLength: number | null
): { downloaded: number; contentLength: number | null } {
  switch (event.event) {
    case "Started":
      return { downloaded: 0, contentLength: event.data.contentLength ?? null };
    case "Progress":
      return { downloaded: downloaded + event.data.chunkLength, contentLength };
    case "Finished":
      return { downloaded: contentLength ?? downloaded, contentLength };
    default:
      return { downloaded, contentLength };
  }
}

function windowsPortableAsset(update: Update): { url: string; signature: string } | null {
  const platforms = (update.rawJson as { platforms?: Record<string, { url?: string; signature?: string }> })
    ?.platforms;
  const p = platforms?.[WINDOWS_PORTABLE_TARGET];
  if (p?.url && p?.signature) return { url: p.url, signature: p.signature };
  return null;
}

export async function checkForAppUpdate(force = false): Promise<AppUpdateInfo | null> {
  if (!isTauri()) return null;
  if (!force && pending) return metadataOf(pending);
  if (inflight) return inflight;

  inflight = (async () => {
    const { check } = await import("@tauri-apps/plugin-updater");
    if (pending) {
      await pending.close().catch(() => {});
      pending = null;
    }
    const portable = await isPortableWindowsUpdate();
    // Portable Windows must pin windows-x86_64 (the signed USB zip). Otherwise the
    // plugin prefers windows-x86_64-nsis and would download the installer.
    const update = await check({
      timeout: 20_000,
      ...(portable ? { target: WINDOWS_PORTABLE_TARGET } : {}),
    });
    if (!update) return null;
    pending = update;
    return metadataOf(update);
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

export async function installPendingUpdate(
  onProgress?: (progress: UpdateDownloadProgress) => void
): Promise<void> {
  if (!pending) {
    throw new Error("Aucune mise à jour en attente.");
  }

  let downloaded = 0;
  let contentLength: number | null = null;
  const report = (event: DownloadEvent) => {
    const next = progressFromEvent(event, downloaded, contentLength);
    downloaded = next.downloaded;
    contentLength = next.contentLength;
    onProgress?.(next);
  };

  const portable = await isPortableWindowsUpdate();
  if (portable) {
    const asset = windowsPortableAsset(pending);
    if (!asset) {
      throw new Error("Archive portable introuvable dans latest.json (windows-x86_64).");
    }
    const onEvent = new Channel<DownloadEvent>();
    onEvent.onmessage = report;
    await invoke("apply_windows_portable_update", {
      url: asset.url,
      signature: asset.signature,
      onEvent,
    });
    pending = null;
    return;
  }

  await pending.downloadAndInstall(report);
  pending = null;
  try {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch {
    // Windows NSIS quits during install; relaunch is for macOS / Linux.
  }
}
