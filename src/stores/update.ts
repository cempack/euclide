import { create } from "zustand";
import { useConfirm, useToast } from "../components/ui";
import { tr } from "../lib/i18n";
import { installErrorMessage, installPendingUpdate, type AppUpdateInfo } from "../lib/updater";

type Phase = "available" | "installing" | "installed" | "error";

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

/** A newer version was found (at startup, or by « Vérifier » in Réglages). */
export function setAvailableUpdate(update: AppUpdateInfo | null) {
  const s = useUpdateStore.getState();
  if (s.phase === "installing" || s.phase === "installed") return;
  useUpdateStore.setState({ update, phase: "available", percent: 0, error: "" });
}

/**
 * The update on offer and how its installation goes, the same in the status
 * bar and in Réglages. `install` asks first, then downloads with progress.
 */
export function useInstallUpdate() {
  const state = useUpdateStore();
  const confirm = useConfirm();
  const toast = useToast();
  const install = async () => {
    const { update, phase } = useUpdateStore.getState();
    if (!update || phase === "installing" || phase === "installed") return;
    const ok = await confirm.ask({
      title: tr("updater.install"),
      message: tr("updater.confirmInstall", { version: update.version }),
      confirmLabel: tr("updater.install"),
    });
    if (!ok) return;
    useUpdateStore.setState({ phase: "installing", percent: 0, error: "" });
    try {
      await installPendingUpdate(({ downloaded, contentLength }) => {
        if (contentLength && contentLength > 0)
          useUpdateStore.setState({ percent: Math.min(100, Math.round((downloaded / contentLength) * 100)) });
      });
      useUpdateStore.setState({ phase: "installed", percent: 100 });
      toast(tr("updater.installed"), "success");
    } catch (err) {
      const error = installErrorMessage(err) || tr("updater.installFailed");
      useUpdateStore.setState({ phase: "error", error });
      toast(error, "error");
    }
  };
  return { ...state, install };
}
