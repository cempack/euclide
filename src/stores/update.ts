import { create } from "zustand";
import { useConfirm, useToast } from "../components/ui";
import { tr } from "../lib/i18n";
import { logged } from "../lib/report";
import {
  fetchPendingUpdate,
  installErrorMessage,
  installFetchedUpdate,
  relaunchAfterUpdate,
  type AppUpdateInfo,
} from "../lib/updater";
import { readyToQuit } from "../shell/exitGuard";
import { saveTabSession } from "./tabs";

type Phase = "available" | "installing" | "restarting" | "installed" | "error";

interface UpdateState {
  update: AppUpdateInfo | null;
  phase: Phase;
  percent: number;
  error: string;
}

const useUpdateStore = create<UpdateState>()(() => ({
  update: null,
  phase: "available",
  percent: 0,
  error: "",
}));

/** Installing or installed: no new check may drop the update in hand. */
export function updateInProgress(): boolean {
  const { phase } = useUpdateStore.getState();
  return phase === "installing" || phase === "restarting" || phase === "installed";
}

/** A newer version was found (at startup, or by « Vérifier » in Réglages). */
export function setAvailableUpdate(update: AppUpdateInfo | null) {
  if (updateInProgress()) return;
  useUpdateStore.setState({ update, phase: "available", percent: 0, error: "" });
}

/** What an installation does, in order; each step is the app's own. */
export interface InstallSteps {
  /** « Installer la version … ? » */
  confirm(): Promise<boolean>;
  /** Notes saved; the rest of what is unsaved is the teacher's call. */
  readyToQuit(): Promise<boolean>;
  /** Downloads; a USB copy also puts the update in place (`installed`). */
  download(onPercent: (percent: number) => void): Promise<{ installed: boolean }>;
  /** The open tabs, to reopen on what was open. */
  saveSession(): Promise<void>;
  install(): Promise<void>;
  /** Starts the new version and quits this one. */
  relaunch(): Promise<void>;
}

/**
 * The teacher's work is saved before anything that ends this process, and
 * nothing restarts after a failure. Saving is checked twice: before the
 * download, and after it for what changed while it ran.
 */
export async function runInstall(
  steps: InstallSteps,
  set: (patch: Partial<UpdateState>) => void,
): Promise<void> {
  if (!(await steps.confirm())) return;
  if (!(await steps.readyToQuit())) return;
  set({ phase: "installing", percent: 0, error: "" });
  let installed: boolean;
  try {
    ({ installed } = await steps.download((percent) => set({ percent })));
  } catch (err) {
    set({ phase: "error", error: installErrorMessage(err) || tr("updater.installFailed") });
    return;
  }
  if (!(await steps.readyToQuit())) {
    // In place already (USB): the next opening runs it. Else it can be asked again.
    set(installed ? { phase: "installed", percent: 100 } : { phase: "available", percent: 0 });
    return;
  }
  set({ phase: "restarting", percent: 100 });
  await steps.saveSession().catch(logged("update.saveSession"));
  if (!installed) {
    try {
      await steps.install();
    } catch (err) {
      set({ phase: "error", error: installErrorMessage(err) || tr("updater.installFailed") });
      return;
    }
  }
  try {
    await steps.relaunch();
  } catch (err) {
    logged("update.relaunch")(err);
    set({ phase: "installed" });
  }
}

/**
 * The update on offer and how its installation goes, the same in the status
 * bar and in Réglages. `install` asks first, saves, downloads with progress,
 * then restarts Euclide on the new version.
 */
export function useInstallUpdate() {
  const state = useUpdateStore();
  const confirm = useConfirm();
  const toast = useToast();
  const install = async () => {
    const { update } = useUpdateStore.getState();
    if (!update || updateInProgress()) return;
    await runInstall(
      {
        confirm: () =>
          confirm.ask({
            title: tr("updater.install"),
            message: tr("updater.confirmInstall", { version: update.version }),
            confirmLabel: tr("updater.install"),
          }),
        readyToQuit: () => readyToQuit(confirm, toast, true),
        download: (onPercent) =>
          fetchPendingUpdate(({ downloaded, contentLength }) => {
            if (contentLength && contentLength > 0)
              onPercent(Math.min(100, Math.round((downloaded / contentLength) * 100)));
          }),
        saveSession: saveTabSession,
        install: installFetchedUpdate,
        relaunch: relaunchAfterUpdate,
      },
      (patch) => {
        useUpdateStore.setState(patch);
        if (patch.phase === "error") toast(patch.error || tr("updater.installFailed"), "error");
        if (patch.phase === "installed") toast(tr("updater.installed"), "success");
      },
    );
  };
  return { ...state, install };
}
