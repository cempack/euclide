import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, FolderOpen, History, RotateCcw, ShieldAlert, ShieldCheck } from "lucide-react";
import { q } from "../../api/queries";
import { Panel, Section } from "../../components/layout";
import { Modal, useConfirm, useToast } from "../../components/ui";
import { api, isTauri } from "../../lib/api";
import { errorMessage } from "../../lib/errors";
import { humanSize } from "../../lib/format";
import { tr, trn } from "../../lib/i18n";
import { reportError } from "../../lib/report";
import { Icon } from "../../ui/Icon";
import { SettingRow } from "./SettingRow";

/** « aujourd'hui », « hier », or « lundi 5 octobre ». */
function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const day = new Date(y, m - 1, d);
  const today = new Date();
  const diff = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - day.getTime()) / 86_400_000,
  );
  if (diff === 0) return tr("backups.today");
  if (diff === 1) return tr("backups.yesterday");
  return day.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * The copies Euclide makes by itself (one a day, on the key), the copy on
 * another drive, restoring a day's copy, and the full archive.
 */
export function BackupsSection({ id }: { id: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const status = useQuery(q.backups()).data;
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const run = async (what: string, action: () => Promise<unknown>, done?: string) => {
    setBusy(what);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: q.backups().queryKey });
      if (done) toast(done, "success");
    } catch (err) {
      reportError(`backups.${what}`, err);
      toast(errorMessage(err, tr("messages.genericError")), "error");
    } finally {
      setBusy(null);
    }
  };

  const restore = async (name: string, day: string) => {
    const ok = await confirm.ask({
      title: tr("backups.restoreTitle", { day: dayLabel(day) }),
      message: tr("backups.restoreMessage"),
      confirmLabel: tr("backups.restoreConfirm"),
      danger: true,
    });
    if (!ok) return;
    setPicking(false);
    await run("restore", () => api.restoreSnapshot(name), tr("backups.restoreScheduled"));
  };

  const snapshots = status?.snapshots ?? [];
  const latest = snapshots[0];
  const healthy = !status?.integrity || status.integrity === "ok";

  return (
    <Section
      title={tr("backups.title")}
      id={id}
      action={
        <button
          className="eu-btn-ghost eu-btn-sm"
          disabled={!isTauri() || busy != null}
          onClick={() => void run("now", () => api.backupNow(), tr("backups.doneNow"))}
        >
          <Icon icon={History} size={14} />
          {tr("backups.now")}
        </button>
      }
    >
      {status?.restore_pending && (
        <div className="eu-banner" role="status">
          <Icon icon={RotateCcw} size={16} className="shrink-0" />
          <p className="flex-1 min-w-0">{tr("backups.restorePending")}</p>
          <button
            className="eu-btn-ghost eu-btn-sm"
            onClick={() => void run("cancel", () => api.cancelRestore(), tr("backups.restoreCancelled"))}
          >
            {tr("backups.restoreCancel")}
          </button>
        </div>
      )}
      {!healthy && (
        <div className="eu-banner eu-banner-danger" role="alert">
          <Icon icon={ShieldAlert} size={16} className="shrink-0" />
          <p className="flex-1 min-w-0">{tr("backups.damaged", { detail: status?.integrity ?? "" })}</p>
        </div>
      )}
      <Panel pad>
        <SettingRow
          title={tr("backups.autoTitle")}
          hint={
            <>
              {tr("backups.autoHint")}
              <span className="flex items-center gap-2 flex-wrap mt-1.5">
                {healthy && status?.integrity === "ok" && (
                  <span className="eu-chip-ok">
                    <Icon icon={ShieldCheck} size={14} />
                    {tr("backups.healthy")}
                  </span>
                )}
                <span>
                  {latest
                    ? tr("backups.latest", { day: dayLabel(latest.day), size: humanSize(latest.size) })
                    : tr("backups.none")}
                  {snapshots.length > 1 && ` · ${trn("backups.count", snapshots.length)}`}
                </span>
              </span>
            </>
          }
        >
          <button
            className="eu-btn-quiet eu-btn-sm"
            onClick={() => void api.openFolder("backups").catch((err) => toast(errorMessage(err), "error"))}
          >
            <Icon icon={FolderOpen} size={14} />
            {tr("backups.openFolder")}
          </button>
        </SettingRow>

        <SettingRow
          title={tr("backups.externalTitle")}
          hint={
            <>
              {tr("backups.externalHint")}
              {status?.external_dir && (
                <span className="flex items-center gap-2 flex-wrap mt-1.5">
                  <span className="font-mono text-small text-ink-muted break-all selectable">
                    {status.external_dir}
                  </span>
                  <span className={status.external_reachable ? "eu-chip-ok" : "eu-chip-warn"}>
                    {status.external_reachable ? tr("backups.reachable") : tr("backups.unreachable")}
                  </span>
                  {status.last_mirror && (
                    <span>{tr("backups.lastMirror", { when: status.last_mirror })}</span>
                  )}
                </span>
              )}
            </>
          }
        >
          <button
            className="eu-btn-ghost eu-btn-sm"
            disabled={busy != null}
            onClick={() =>
              void run("external", async () => {
                const dir = await api.chooseBackupFolder();
                if (dir) toast(tr("backups.externalChosen"), "success");
              })
            }
          >
            {status?.external_dir ? tr("backups.externalChange") : tr("backups.externalChoose")}
          </button>
          {status?.external_dir && (
            <button
              className="eu-btn-quiet eu-btn-sm"
              disabled={busy != null}
              onClick={() => void run("externalClear", () => api.clearBackupFolder())}
            >
              {tr("backups.externalRemove")}
            </button>
          )}
        </SettingRow>

        <SettingRow title={tr("backups.restoreRowTitle")} hint={tr("backups.restoreHint")}>
          <button
            className="eu-btn-ghost eu-btn-sm"
            disabled={snapshots.length === 0 || busy != null}
            onClick={() => setPicking(true)}
          >
            <Icon icon={RotateCcw} size={14} />
            {tr("backups.restoreChoose")}
          </button>
        </SettingRow>

        <SettingRow title={tr("backups.archiveTitle")} hint={tr("backups.archiveHint")}>
          <button
            className="eu-btn-ghost eu-btn-sm"
            disabled={!isTauri() || busy != null}
            onClick={() =>
              void run("archive", async () => {
                const path = await api.backupDataDir();
                toast(tr("settings.backupDone", { path }), "success");
              })
            }
          >
            <Icon icon={Archive} size={14} />
            {busy === "archive" ? tr("settings.backupRunning") : tr("backups.archiveCreate")}
          </button>
        </SettingRow>
      </Panel>

      <Modal open={picking} onClose={() => setPicking(false)} title={tr("backups.pickTitle")}>
        <p className="eu-t-body text-ink-muted mb-3">{tr("backups.pickHint")}</p>
        <div className="eu-picker" role="list">
          {snapshots.map((s) => (
            <button
              key={s.name}
              type="button"
              role="listitem"
              className="eu-picker-row"
              onClick={() => void restore(s.name, s.day)}
            >
              <Icon icon={History} size={16} className="text-ink-muted shrink-0" />
              <span className="flex-1 min-w-0 truncate text-ink first-letter:uppercase">
                {dayLabel(s.day)}
              </span>
              <span className="eu-t-caption shrink-0">{humanSize(s.size)}</span>
            </button>
          ))}
        </div>
      </Modal>
    </Section>
  );
}
