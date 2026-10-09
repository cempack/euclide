import { Channel, invoke } from "@tauri-apps/api/core";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { api, isTauri } from "./api";
import { errorMessage } from "./errors";
import { reportError } from "./report";

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

const WINDOWS_PORTABLE_TARGET = "windows-x86_64";

let pending: Update | null = null;
let inflight: Promise<AppUpdateInfo | null> | null = null;
let portableWindows: boolean | null = null;

export function updaterSupported(): boolean {
  return isTauri();
}

async function isPortableWindowsUpdate(): Promise<boolean> {
  if (portableWindows != null) return portableWindows;
  try {
    const info = await api.appInfo();
    portableWindows = Boolean(info?.windows_portable);
  } catch (err) {
    // The portable USB build would then be offered the installer.
    reportError("updater.appInfo", err);
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

export function installErrorMessage(err: unknown): string {
  return errorMessage(err, "Impossible d'installer la mise à jour.");
}

function isClosingAfterInstall(err: unknown): boolean {
  const msg = errorText(err);
  return (
    msg.includes("webview") ||
    msg.includes("destroyed") ||
    msg.includes("closed") ||
    msg.includes("cancelled") ||
    msg.includes("canceled") ||
    msg.includes("ipc")
  );
}

function errorText(err: unknown): string {
  return errorMessage(err).toLowerCase();
}

/** `latest.json` exists but this OS is not in `platforms` yet (matrix still running). */
export function isIncompleteUpdateManifest(err: unknown): boolean {
  const msg = errorText(err);
  return (
    msg.includes("none of the fallback platforms") ||
    (msg.includes("fallback platforms") && msg.includes("were found in the response"))
  );
}

/** Quiet check: missing or unfinished GitHub latest release is not an app error. */
export function isNoPublishedUpdate(err: unknown): boolean {
  if (isIncompleteUpdateManifest(err)) return true;
  const msg = errorText(err);
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
  contentLength: number | null,
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

function isZipUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.pathname.toLowerCase().endsWith(".zip");
  } catch {
    return false;
  }
}

/** The signed USB archive a manifest offers, or null. An installer under
 * windows-x86_64 (a release caught half-built) cannot unpack over a USB copy. */
export function portableAssetOf(rawJson: unknown): { url: string; signature: string } | null {
  const platforms = (rawJson as { platforms?: Record<string, { url?: unknown; signature?: unknown }> } | null)
    ?.platforms;
  const p = platforms?.[WINDOWS_PORTABLE_TARGET];
  const url = typeof p?.url === "string" ? p.url : "";
  const signature = typeof p?.signature === "string" ? p.signature : "";
  if (!signature || !isZipUrl(url)) return null;
  return { url, signature };
}

export async function checkForAppUpdate(force = false): Promise<AppUpdateInfo | null> {
  if (!isTauri()) return null;
  if (!force && pending) return metadataOf(pending);
  if (inflight) return inflight;

  inflight = (async () => {
    const { check } = await import("@tauri-apps/plugin-updater");
    if (pending) {
      // The previous check's handle is dropped either way.
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
    if (portable && !portableAssetOf(update.rawJson)) {
      // Nothing this copy can install yet: the next check sees the archive.
      await update.close().catch(() => {});
      return null;
    }
    pending = update;
    return metadataOf(update);
  })().finally(() => {
    inflight = null;
  });

  return inflight;
}

/**
 * Downloads the update on offer. A USB copy also puts it in place (its
 * Python module is staged for the next launch); the other copies install
 * in `finishPendingUpdate`. Resolves to whether the update is in place.
 */
export async function fetchPendingUpdate(
  onProgress?: (progress: UpdateDownloadProgress) => void,
): Promise<{ installed: boolean }> {
  if (!pending) {
    throw new Error("Aucune mise à jour en attente.");
  }

  let downloaded = 0;
  let contentLength: number | null = null;
  let lastReport = 0;
  const report = (event: DownloadEvent) => {
    const next = progressFromEvent(event, downloaded, contentLength);
    downloaded = next.downloaded;
    contentLength = next.contentLength;
    // The plugin reports every chunk: re-render ten times a second at most.
    const now = performance.now();
    if (event.event === "Progress" && now - lastReport < 100) return;
    lastReport = now;
    onProgress?.(next);
  };

  if (await isPortableWindowsUpdate()) {
    const asset = portableAssetOf(pending.rawJson);
    if (!asset) {
      throw new Error("Archive portable introuvable dans latest.json (windows-x86_64).");
    }
    const onEvent = new Channel<DownloadEvent>();
    onEvent.onmessage = report;
    await invoke("apply_windows_portable_update", {
      url: asset.url,
      signature: asset.signature,
      version: pending.version,
      onEvent,
    });
    pending = null;
    return { installed: true };
  }

  await pending.download(report);
  return { installed: false };
}

/**
 * Installs a downloaded update, if `fetchPendingUpdate` did not. The
 * Windows installer then closes Euclide and opens the new version itself.
 */
export async function installFetchedUpdate(): Promise<void> {
  if (!pending) throw new Error("Aucune mise à jour en attente.");
  const update = pending;
  pending = null;
  try {
    await update.install();
  } catch (err) {
    if (!isClosingAfterInstall(err)) throw err;
  }
}

/** Starts the version just installed, then quits this one. */
export async function relaunchAfterUpdate(): Promise<void> {
  try {
    await invoke("relaunch_after_update");
  } catch (err) {
    if (!isClosingAfterInstall(err)) throw err;
  }
}
