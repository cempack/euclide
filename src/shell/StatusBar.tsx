import { memo, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { q } from "../api/queries";
import { Coffee } from "lucide-react";
import type { AppInfo, ScheduleEntry } from "../lib/api";
import { focusClass, humanMinutes, minutesRemaining, minutesUntil } from "../lib/format";
import { fmt, get } from "../lib/i18n";
import { tabs, useMaxTabs, useTabsStore } from "../stores/tabs";
import { useAppearance } from "../lib/theme";
import { Icon } from "../ui/Icon";
import { tip } from "../ui/Tooltip";
import { StatusTimerChip } from "./Timer";

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
      ? `${get("appearance.auto", "Auto")} · ${dark ? get("appearance.dark", "Sombre") : get("appearance.light", "Clair")}`
      : dark
        ? get("appearance.dark", "Sombre")
        : get("appearance.light", "Clair");

  return (
    <footer className="eu-statusbar">
      {focus ? (
        <button
          type="button"
          onClick={() => tabs.open({ kind: "dashboard" })}
          {...tip(get("status.openDashboard", "Ouvrir le tableau de bord"))}
          data-tip-place="top"
          className={`eu-status-item eu-status-button ${focus.state === "current" ? "text-warn" : ""}`}
        >
          <span className="truncate max-w-[15rem]">{focus.entry.subject}</span>
          {focus.state === "current"
            ? remaining != null
              ? fmt(get("status.remaining", "reste {time}"), { time: humanMinutes(remaining) })
              : get("status.ending", "fin")
            : until != null
              ? fmt(get("status.inTime", "dans {time}"), { time: humanMinutes(until) })
              : focus.entry.start_time}
        </button>
      ) : (
        <span className="eu-status-item">{get("status.noClass", "aucun cours en cours")}</span>
      )}

      <StatusTimerChip />

      <button
        type="button"
        onClick={() => tabs.open({ kind: "settings" })}
        {...tip(get("status.pronoteHint", "État de la connexion Pronote"))}
        data-tip-place="top"
        className="eu-status-item eu-status-button"
      >
        <span className={`eu-dot ${pronote?.connected ? "bg-ok-solid" : "bg-line-strong"}`} />
        <span className={pronote?.connected ? "text-ok" : ""}>
          {pronote?.connected
            ? get("status.pronoteOn", "pronote connecté")
            : get("status.pronoteOff", "pronote hors ligne")}
        </span>
      </button>

      {keepAwake && (
        <span className="eu-status-item text-warn">
          <Icon icon={Coffee} size={14} />
          {get("status.awake", "écran maintenu")}
        </span>
      )}

      <span className="flex-1" />

      <span className="eu-status-item eu-status-end hidden lg:flex">
        {tabCount}
        {maxTabs > 0 ? ` / ${maxTabs}` : ""} {get("status.tabs", "onglets")}
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
