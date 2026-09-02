import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { XIcon } from "./icons";
import { fmt, get } from "../lib/i18n";
import {
  dismissAvailableUpdate,
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
  const [busy, setBusy] = useState(false);
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
    const ok = confirm(
      fmt(get("updater.confirmInstall", "Installer la version {version} et redémarrer Euclide ?"), {
        version: update.version,
      })
    );
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
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : get("updater.error", "Impossible de vérifier les mises à jour."));
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
          className="fixed bottom-5 right-5 z-[70] w-[min(calc(100vw-2.5rem),300px)] new-card p-3.5 font-mono"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-primary leading-snug">
                {fmt(get("updater.popupTitle", "Mise à jour {version}"), { version: update.version })}
              </p>
              <p className="text-[11px] text-mute mt-1 leading-snug">
                {get("updater.popupBody", "Une nouvelle version est disponible.")}
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              disabled={busy}
              title={get("updater.popupDismiss", "Fermer")}
              className="shrink-0 w-7 h-7 grid place-items-center rounded text-mute hover:text-primary hover:bg-surface-soft disabled:opacity-40"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {error && <p className="text-[11px] text-tui-danger mt-2 leading-snug">{error}</p>}

          {busy && (
            <div className="h-1 rounded-full bg-hairline overflow-hidden mt-3">
              <div
                className="h-full bg-primary transition-[width] duration-150"
                style={{ width: `${percent ?? 0}%` }}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 mt-3">
            <button type="button" onClick={dismiss} disabled={busy} className="new-btn-ghost text-xs py-0.5">
              {get("updater.popupLater", "Plus tard")}
            </button>
            <button
              type="button"
              onClick={() => void install()}
              disabled={busy}
              className="new-btn-primary bg-primary text-white text-xs py-0.5"
            >
              {busy
                ? fmt(get("updater.installing", "Téléchargement… {percent} %"), { percent: percent ?? 0 })
                : get("updater.popupInstall", "Installer")}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
