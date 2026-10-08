import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Icon } from "../ui/Icon";
import { useConfirm, useToast } from "./ui";
import { tr } from "../lib/i18n";
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
      title: tr("updater.install"),
      message: tr("updater.confirmInstall", { version: update.version }),
      confirmLabel: tr("updater.install"),
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
      toast(tr("updater.installed"), "success");
    } catch (err) {
      setBusy(false);
      setError(installErrorMessage(err) || tr("updater.installFailed"));
    }
  };

  return (
    <>
      {update && (
        <div
          role="status"
          aria-live="polite"
          className="eu-enter fixed bottom-9 right-5 z-overlay w-[min(calc(100vw-2.5rem),20rem)] eu-panel shadow-pop p-3.5"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="eu-t-section text-ink">{tr("updater.popupTitle", { version: update.version })}</p>
              <p className="eu-t-meta mt-1">{done ? tr("updater.installed") : tr("updater.popupBody")}</p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              disabled={busy}
              data-tip={tr("updater.popupDismiss")}
              aria-label={tr("updater.popupDismiss")}
              className="shrink-0 eu-btn-quiet eu-btn-icon eu-btn-sm"
            >
              <Icon icon={X} size={14} />
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
                {done ? tr("updater.popupDismiss") : tr("updater.popupLater")}
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
                  ? tr("updater.installing", {
                      percent: percent ?? 0,
                    })
                  : tr("updater.popupInstall")}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
