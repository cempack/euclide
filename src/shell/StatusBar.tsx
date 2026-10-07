import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Coffee } from "lucide-react";
import { api, type AppInfo, type PronoteStatus, type ScheduleEntry } from "../lib/api";
import { focusClass, humanMinutes, minutesRemaining, minutesUntil } from "../lib/format";
import { fmt, get } from "../lib/i18n";
import { useTabs } from "../lib/tabs";
import { useAppearance } from "../lib/theme";
import { Icon } from "../ui/Icon";
import { tip } from "../ui/Tooltip";
import { StatusTimerChip } from "./Timer";

/**
 * The window's status line, across its whole width: the class in progress,
 * the timer, Pronote, keep-awake, and where the data lives. Visible from
 * every screen instead of only from the dashboard.
 */
export const StatusBar = memo(function StatusBar({ info }: { info: AppInfo | null }) {
  const tabs = useTabs();
  const { resolved, pref } = useAppearance();
  const [classes, setClasses] = useState<ScheduleEntry[]>([]);
  const [pronote, setPronote] = useState<PronoteStatus | null>(null);
  const [keepAwake, setKeepAwake] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => new Date());

  const refresh = useCallback(() => {
    api
      .getTodayClasses()
      .then(setClasses)
      .catch(() => {});
    api
      .pronoteStatus()
      .then(setPronote)
      .catch(() => {});
    api
      .keepAwakeStatus()
      .then((s) => setKeepAwake(!!s))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener("eu:schedule-changed", refresh);
    window.addEventListener("eu:pronote-changed", refresh);
    window.addEventListener("eu:keepawake-changed", refresh);
    const id = window.setInterval(() => setNow(new Date()), 20_000);
    return () => {
      window.removeEventListener("eu:schedule-changed", refresh);
      window.removeEventListener("eu:pronote-changed", refresh);
      window.removeEventListener("eu:keepawake-changed", refresh);
      window.clearInterval(id);
    };
  }, [refresh]);

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
        {tabs.tabs.length}
        {tabs.maxTabs > 0 ? ` / ${tabs.maxTabs}` : ""} {get("status.tabs", "onglets")}
      </span>
      <span
        className="eu-status-item eu-status-end hidden xl:flex max-w-[19rem] selectable"
        {...tip(info?.data_dir || "")}
        data-tip-place="top"
      >
        <span className="truncate">{info?.data_dir}</span>
      </span>
      <span className="eu-status-item eu-status-end">{themeLabel}</span>
      <span className="eu-status-item eu-status-end">v{info?.version ?? "…"}</span>
    </footer>
  );
});
