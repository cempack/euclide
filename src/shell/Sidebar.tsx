import { memo, useCallback, useEffect, useState } from "react";
import { Projector, Settings } from "lucide-react";
import { api, type AppInfo, type PronoteStatus } from "../lib/api";
import { get } from "../lib/i18n";
import { shortcutText } from "../lib/shortcuts";
import { useTabs, type TabKind } from "../lib/tabs";
import { useAppearance } from "../lib/theme";
import { Icon } from "../ui/Icon";
import { tip } from "../ui/Tooltip";
import { KIND_ICONS, NAV_TOOLS, NAV_WORK, navKindActive, type NavItem } from "./nav";

const NavButton = memo(function NavButton({
  item,
  active,
  onOpen,
}: {
  item: NavItem;
  active: boolean;
  onOpen: (item: NavItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-current={active ? "page" : undefined}
      className="eu-nav-item"
    >
      <Icon icon={KIND_ICONS[item.kind]} className="eu-nav-icon" />
      <span className="truncate">{item.label}</span>
      {item.keys && <span className="eu-nav-keys">{shortcutText(item.keys)}</span>}
    </button>
  );
});

/** Projection mode keeps only this: the way back. */
export const ProjectionRail = memo(function ProjectionRail() {
  const { toggleProjection } = useAppearance();
  const label = get("appearance.leaveProjection", "Quitter la projection");
  return (
    <aside className="eu-rail">
      <button
        type="button"
        onClick={toggleProjection}
        aria-pressed
        aria-label={label}
        {...tip(label, "esc")}
        data-tip-place="right"
        className="eu-btn-ghost eu-btn-icon"
      >
        <Icon icon={Projector} />
      </button>
    </aside>
  );
});

export const Sidebar = memo(function Sidebar({ info }: { info: AppInfo | null }) {
  const tabs = useTabs();
  const { projection, toggleProjection } = useAppearance();
  const [pronote, setPronote] = useState<PronoteStatus | null>(null);
  const [displayName, setDisplayName] = useState("");
  const isActive = (kind: TabKind) => navKindActive(kind, tabs.active?.kind);

  useEffect(() => {
    const load = () =>
      api
        .pronoteStatus()
        .then(setPronote)
        .catch(() => {});
    load();
    api
      .getSetting("teacher_display_name")
      .then((name) => setDisplayName((name ?? "").trim()))
      .catch(() => {});
    window.addEventListener("eu:pronote-changed", load);
    return () => window.removeEventListener("eu:pronote-changed", load);
  }, []);

  const name = displayName || (pronote?.connected ? (pronote.account_name ?? "").trim() : "");

  const onOpen = useCallback(
    (item: NavItem) => {
      if (item.kind === "whiteboard") {
        tabs.open({
          kind: "whiteboard",
          title: get("app.tabWhiteboard", "Tableau"),
          params: { isNew: true },
        });
      } else if (item.kind === "note") {
        tabs.open({ kind: "note", title: get("common.newNote", "Nouvelle note"), params: { isNew: true } });
      } else {
        tabs.open({ kind: item.kind });
      }
    },
    [tabs],
  );

  const projectionLabel = get("appearance.projection", "Mode projection");
  const settingsLabel = get("nav.settings", "Réglages");

  return (
    <aside className="eu-sidebar">
      <div className="eu-sidebar-head">
        <img src="/logo-64.png" alt="" width={24} height={24} className="w-6 h-6 shrink-0 object-contain" />
        <div className="min-w-0">
          <div className="eu-wordmark">EUCLIDE</div>
          <div className="eu-t-caption truncate">{get("app.tagline", "Bureau d'enseignement")}</div>
        </div>
      </div>

      <div className="eu-sidebar-body">
        <p className="eu-t-label px-2.5 pb-2">{get("nav.groupWork", "Travail")}</p>
        <nav className="flex flex-col gap-0.5" aria-label={get("nav.groupWork", "Travail")}>
          {NAV_WORK.map((item) => (
            <NavButton key={item.kind} item={item} active={isActive(item.kind)} onOpen={onOpen} />
          ))}
        </nav>

        <p className="eu-t-label px-2.5 pt-5 pb-2">{get("nav.groupTools", "Outils")}</p>
        <nav className="flex flex-col gap-0.5" aria-label={get("nav.groupTools", "Outils")}>
          {NAV_TOOLS.map((item) => (
            <NavButton key={item.kind} item={item} active={isActive(item.kind)} onOpen={onOpen} />
          ))}
        </nav>
      </div>

      <div className="eu-sidebar-foot">
        {name ? (
          <span className="eu-avatar" aria-hidden>
            {name.charAt(0).toUpperCase()}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          {name && <div className="eu-t-small font-medium text-ink truncate">{name}</div>}
          <div className="eu-t-caption">v{info?.version ?? "…"}</div>
        </div>
        <button
          type="button"
          onClick={toggleProjection}
          aria-pressed={projection}
          aria-label={projectionLabel}
          {...tip(projectionLabel, "mod+shift+P")}
          data-tip-place="top"
          className="eu-btn-quiet eu-btn-icon eu-btn-sm"
        >
          <Icon icon={Projector} />
        </button>
        <button
          type="button"
          onClick={() => tabs.open({ kind: "settings" })}
          aria-current={isActive("settings") ? "page" : undefined}
          aria-label={settingsLabel}
          {...tip(settingsLabel, "mod+,")}
          data-tip-place="top"
          className="eu-btn-quiet eu-btn-icon eu-btn-sm eu-current-raised"
        >
          <Icon icon={Settings} />
        </button>
      </div>
    </aside>
  );
});
