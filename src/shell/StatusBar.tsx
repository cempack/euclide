import { memo, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { q } from "../api/queries";
import { ArrowUpCircle, Coffee } from "lucide-react";
import type { AppInfo, ScheduleEntry } from "../lib/api";
import { focusClass, humanMinutes, minutesRemaining, minutesUntil } from "../lib/format";
import { tr } from "../lib/i18n";
import { tabs, useMaxTabs, useTabsStore } from "../stores/tabs";
import { useAppearance } from "../lib/theme";
import { Icon } from "../ui/Icon";
import { tip } from "../ui/Tooltip";
import { StatusTimerChip } from "./Timer";
import { useInstallUpdate } from "../stores/update";

/**
 * The window's status line, across its whole width: the class in progress,
 * the timer, Pronote, keep-awake, and where the data lives. Visible from
 * every screen instead of only from the dashboard.
 */
const NONE: ScheduleEntry[] = [];

export const StatusBar = memo(function StatusBar({ info }: { info: AppInfo | null }) {
  const tabCount = useTabsStore((s) => s.tabs.length);
  const maxTabs = useMaxTabs();
  const { resolved, pref } = useAppearance();
  const classes = useQuery(q.todayClasses()).data ?? NONE;
  const pronote = useQuery(q.pronoteStatus()).data ?? null;
  const keepAwake = useQuery(q.keepAwake()).data ?? false;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 20_000);
    return () => window.clearInterval(id);
  }, []);

  const focus = useMemo(() => focusClass(classes, now), [classes, now]);
  const remaining = focus?.state === "current" ? minutesRemaining(focus.entry, now) : null;
  const until = focus?.state === "next" ? minutesUntil(focus.entry.start_time, now) : null;

  const dark = resolved === "dark";
  const themeLabel =
    pref === "auto"
      ? `${tr("appearance.auto")} · ${dark ? tr("appearance.dark") : tr("appearance.light")}`
      : dark
        ? tr("appearance.dark")
        : tr("appearance.light");

  return (
    <footer className="eu-statusbar">
      {focus ? (
        <button
          type="button"
          onClick={() => tabs.open({ kind: "dashboard" })}
          {...tip(tr("status.openDashboard"))}
          data-tip-place="top"
          className={`eu-status-item eu-status-button ${focus.state === "current" ? "text-warn" : ""}`}
        >
          <span className="truncate max-w-[15rem]">{focus.entry.subject}</span>
          {focus.state === "current"
            ? remaining != null
              ? tr("status.remaining", { time: humanMinutes(remaining) })
              : tr("status.ending")
            : until != null
              ? tr("status.inTime", { time: humanMinutes(until) })
              : focus.entry.start_time}
        </button>
      ) : (
        <span className="eu-status-item">{tr("status.noClass")}</span>
      )}

      <StatusTimerChip />

      <button
        type="button"
        onClick={() => tabs.open({ kind: "settings" })}
        {...tip(tr("status.pronoteHint"))}
        data-tip-place="top"
        className="eu-status-item eu-status-button"
      >
        <span className={`eu-dot ${pronote?.connected ? "bg-ok-solid" : "bg-line-strong"}`} />
        <span className={pronote?.connected ? "text-ok" : ""}>
          {pronote?.connected ? tr("status.pronoteOn") : tr("status.pronoteOff")}
        </span>
      </button>

      {keepAwake && (
        <span className="eu-status-item text-warn">
          <Icon icon={Coffee} size={14} />
          {tr("status.awake")}
        </span>
      )}

      <UpdateItem />

      <span className="flex-1" />

      <span className="eu-status-item eu-status-end hidden lg:flex">
        {tabCount}
        {maxTabs > 0 ? ` / ${maxTabs}` : ""} {tr("status.tabs")}
      </span>
      <span
        className="eu-status-item eu-status-end hidden xl:flex max-w-[19rem] selectable"
        {...tip(info?.data_dir || "")}
        data-tip-place="top"
      >
        <span className="truncate">{info?.data_dir}</span>
      </span>
      <span className="eu-status-item eu-status-end hidden md:flex">{themeLabel}</span>
      <span className="eu-status-item eu-status-end">v{info?.version ?? "…"}</span>
    </footer>
  );
});

/**
 * A newer Euclide: one discreet item instead of a card over the screen,
 * which may be on the projector. A click installs it (after asking).
 */
function UpdateItem() {
  const { update, phase, percent, error, install } = useInstallUpdate();
  if (!update) return null;
  const label =
    phase === "installing"
      ? tr("updater.statusInstalling", { percent })
      : phase === "installed"
        ? tr("updater.statusInstalled")
        : phase === "error"
          ? tr("updater.statusError")
          : tr("updater.statusAvailable", { version: update.version });
  const hint =
    phase === "installed"
      ? tr("updater.statusInstalledTip")
      : phase === "error"
        ? error
        : tr("updater.statusAvailableTip");
  return (
    <button
      type="button"
      onClick={() => void install()}
      disabled={phase === "installing" || phase === "installed"}
      {...tip(hint)}
      data-tip-place="top"
      className={`eu-status-item eu-status-button tabular-nums ${
        phase === "error" ? "text-danger" : phase === "installed" ? "text-ok" : "text-accent"
      }`}
    >
      <Icon icon={ArrowUpCircle} size={14} />
      {label}
    </button>
  );
}
