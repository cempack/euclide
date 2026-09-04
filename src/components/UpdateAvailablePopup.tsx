import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { XIcon } from "./icons";
import { useConfirm, useToast } from "./ui";
import { fmt, get } from "../lib/i18n";
import {
  dismissAvailableUpdate,
  installErrorMessage,
  installPendingUpdate,
  type AppUpdateInfo,
} from "../lib/updater";

export function UpdateAvailablePopup({
  update,
  onDismiss,
}: {
  update: AppUpdateInfo | null;
  onDismiss: () => void;
}) {
  const confirmDlg = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!update) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        dismissAvailableUpdate(update.version);
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [update, busy, onDismiss]);

  const dismiss = () => {
    if (busy) return;
    if (update) dismissAvailableUpdate(update.version);
    onDismiss();
  };

  const install = async () => {
    if (!update || busy) return;
    // In-app dialog rather than the native window.confirm(), which looked
    // foreign inside the Tauri window.
    const ok = await confirmDlg.ask({
      title: get("updater.install", "Installer"),
      message: fmt(
        get("updater.confirmInstall", "Installer la version {version} ? Fermez ensuite Euclide, puis rouvrez-le."),
        { version: update.version }
      ),
      confirmLabel: get("updater.install", "Installer"),
    });
    if (!ok) return;
    setBusy(true);
    setError("");
    setPercent(0);
    try {
      await installPendingUpdate(({ downloaded, contentLength }) => {
        if (contentLength && contentLength > 0) {
          setPercent(Math.min(100, Math.round((downloaded / contentLength) * 100)));
        }
      });
      dismissAvailableUpdate(update.version);
      setBusy(false);
      setDone(true);
      toast(get("updater.installed", "Mise à jour installée. Fermez Euclide, puis rouvrez-le."), "success");
    } catch (err) {
      setBusy(false);
      setError(installErrorMessage(err) || get("updater.installFailed", "Impossible d'installer la mise à jour."));
    }
  };

  return (
    <AnimatePresence>
      {update && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          className="fixed bottom-9 right-5 z-overlay w-[min(calc(100vw-2.5rem),320px)] eu-panel shadow-pop p-3.5"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="eu-t-section text-ink">
                {fmt(get("updater.popupTitle", "Mise à jour {version}"), { version: update.version })}
              </p>
              <p className="eu-t-meta mt-1">
                {done
                  ? get("updater.installed", "Mise à jour installée. Fermez Euclide, puis rouvrez-le.")
                  : get("updater.popupBody", "Une nouvelle version est disponible.")}
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              disabled={busy}
              title={get("updater.popupDismiss", "Fermer")}
              className="shrink-0 eu-btn-quiet eu-btn-icon eu-btn-sm"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {error && <p className="eu-t-meta text-danger mt-2">{error}</p>}

          {busy && (
            <div className="eu-gauge mt-3">
              <i style={{ width: `${percent ?? 0}%` }} />
            </div>
          )}

          <div className="flex justify-end gap-2 mt-3 flex-wrap">
            {!busy && (
              <button type="button" onClick={dismiss} className="eu-btn-quiet eu-btn-sm shrink-0">
                {done
                  ? get("updater.popupDismiss", "Fermer")
                  : get("updater.popupLater", "Plus tard")}
              </button>
            )}
            {!done && (
              <button
                type="button"
                onClick={() => void install()}
                disabled={busy}
                className="eu-btn-primary eu-btn-sm whitespace-nowrap tabular-nums shrink-0"
              >
                {busy
                  ? fmt(get("updater.installing", "Téléchargement… {percent}\u202f%"), {
                      percent: percent ?? 0,
                    })
                  : get("updater.popupInstall", "Installer")}
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
