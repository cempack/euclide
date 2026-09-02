import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { isTauri } from "./api";

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

let pending: Update | null = null;
let inflight: Promise<AppUpdateInfo | null> | null = null;

export function updaterSupported(): boolean {
  return isTauri();
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
    const update = await check({ timeout: 20_000 });
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
  await pending.downloadAndInstall((event: DownloadEvent) => {
    switch (event.event) {
      case "Started":
        downloaded = 0;
        contentLength = event.data.contentLength ?? null;
        onProgress?.({ downloaded, contentLength });
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.({ downloaded, contentLength });
        break;
      case "Finished":
        onProgress?.({ downloaded: contentLength ?? downloaded, contentLength });
        break;
    }
  });
  pending = null;
  try {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch {
    // Windows quits during NSIS install; relaunch is for macOS / Linux.
  }
}
