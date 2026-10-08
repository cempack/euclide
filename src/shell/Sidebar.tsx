import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { q } from "../api/queries";
import { AlarmClock, PanelLeftClose, PanelLeftOpen, Projector, Settings } from "lucide-react";
import { scene } from "../stores/scene";
import { useSetting } from "../api/hooks";
import type { AppInfo } from "../lib/api";
import { tr } from "../lib/i18n";
import { NARROW_WINDOW, useMediaQuery } from "../lib/media";
import { shortcutText } from "../lib/shortcuts";
import { tabs, useActiveKind, type TabKind } from "../stores/tabs";
import { useAppearance } from "../lib/theme";
import { Icon } from "../ui/Icon";
import { Logo } from "../ui/Logo";
import { tip } from "../ui/Tooltip";
import { keysOf } from "../lib/keymap";
import { KIND_ICONS, NAV_TOOLS, NAV_WORK, navKindActive, type NavItem } from "./nav";

const NavButton = memo(function NavButton({
  item,
  active,
  rail,
  onOpen,
}: {
  item: NavItem;
  active: boolean;
  /** Icon only: the label moves into a tooltip. */
  rail: boolean;
  onOpen: (item: NavItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-current={active ? "page" : undefined}
      {...(rail
        ? { "aria-label": item.label, ...tip(item.label, item.keys), "data-tip-place": "right" }
        : {})}
      className="eu-nav-item"
    >
      <Icon icon={KIND_ICONS[item.kind]} className="eu-nav-icon" />
      {!rail && <span className="truncate">{item.label}</span>}
      {!rail && item.keys && <span className="eu-nav-keys">{shortcutText(item.keys)}</span>}
    </button>
  );
});

/** Projection mode keeps only this: the way back. */
export const ProjectionRail = memo(function ProjectionRail() {
  const { toggleProjection } = useAppearance();
  const label = tr("appearance.leaveProjection");
  const sceneLabel = tr("scene.open");
  return (
    <aside className="eu-rail gap-1">
      <button
        type="button"
        onClick={toggleProjection}
        aria-pressed
        aria-label={label}
        {...tip(label, keysOf("leaveProjection"))}
        data-tip-place="right"
        className="eu-btn-ghost eu-btn-icon"
      >
        <Icon icon={Projector} />
      </button>
      <button
        type="button"
        onClick={scene.open}
        aria-label={sceneLabel}
        {...tip(sceneLabel, keysOf("scene"))}
        data-tip-place="right"
        className="eu-btn-quiet eu-btn-icon"
      >
        <Icon icon={AlarmClock} />
      </button>
    </aside>
  );
});

function openNav(item: NavItem) {
  if (item.kind === "whiteboard") {
    tabs.open({ kind: "whiteboard", title: tr("app.tabWhiteboard"), params: { isNew: true } });
  } else if (item.kind === "note") {
    tabs.open({ kind: "note", title: tr("common.newNote"), params: { isNew: true } });
  } else {
    tabs.open({ kind: item.kind });
  }
}

export const Sidebar = memo(function Sidebar({ info }: { info: AppInfo | null }) {
  const activeKind = useActiveKind();
  const { projection, toggleProjection } = useAppearance();
  const pronote = useQuery(q.pronoteStatus()).data ?? null;
  const displayName = (useQuery(q.setting("teacher_display_name")).data ?? "").trim();
  const isActive = (kind: TabKind) => navKindActive(kind, activeKind ?? undefined);
  // A narrow window always gets the rail; a wide one, when the teacher folds it.
  const narrow = useMediaQuery(NARROW_WINDOW);
  const [saved, setSaved] = useSetting("sidebar");
  const rail = narrow || saved === "rail";

  const name = displayName || (pronote?.connected ? (pronote.account_name ?? "").trim() : "");

  const projectionLabel = tr("appearance.projection");
  const settingsLabel = tr("nav.settings");
  const foldLabel = saved === "rail" ? tr("nav.expand") : tr("nav.collapse");
  const fold = narrow ? null : (
    <button
      type="button"
      onClick={() => setSaved(saved === "rail" ? "open" : "rail")}
      aria-label={foldLabel}
      {...tip(foldLabel)}
      data-tip-place={rail ? "right" : "bottom"}
      className="eu-btn-quiet eu-btn-icon eu-btn-sm eu-sidebar-fold"
    >
      <Icon icon={rail ? PanelLeftOpen : PanelLeftClose} />
    </button>
  );

  const placeFoot = rail ? "right" : "top";
  const groups = [
    { label: tr("nav.groupWork"), items: NAV_WORK },
    { label: tr("nav.groupTools"), items: NAV_TOOLS },
  ];

  return (
    <aside className="eu-sidebar" data-rail={rail || undefined}>
      <div className="eu-sidebar-head">
        <Logo size={24} className="shrink-0" />
        {!rail && (
          <>
            <div className="min-w-0 flex-1">
              <div className="eu-wordmark">EUCLIDE</div>
              <div className="eu-t-caption truncate">{tr("app.tagline")}</div>
            </div>
            {fold}
          </>
        )}
      </div>

      <div className="eu-sidebar-body">
        {groups.map((group, i) => (
          <div key={group.label} className="contents">
            {rail ? (
              i > 0 && <hr className="eu-sidebar-sep" />
            ) : (
              <p className={`eu-t-label px-2.5 pb-2 ${i > 0 ? "pt-5" : ""}`}>{group.label}</p>
            )}
            <nav className="eu-sidebar-nav" aria-label={group.label}>
              {group.items.map((item) => (
                <NavButton
                  key={item.kind}
                  item={item}
                  active={isActive(item.kind)}
                  rail={rail}
                  onOpen={openNav}
                />
              ))}
            </nav>
          </div>
        ))}
      </div>

      <div className="eu-sidebar-foot">
        {!rail && name ? (
          <span className="eu-avatar" aria-hidden>
            {name.charAt(0).toUpperCase()}
          </span>
        ) : null}
        {!rail && (
          <div className="min-w-0 flex-1">
            {name && <div className="eu-t-small font-medium text-ink truncate">{name}</div>}
            <div className="eu-t-caption">v{info?.version ?? "…"}</div>
          </div>
        )}
        {rail && fold}
        <button
          type="button"
          onClick={toggleProjection}
          aria-pressed={projection}
          aria-label={projectionLabel}
          {...tip(projectionLabel, keysOf("projection"))}
          data-tip-place={placeFoot}
          className="eu-btn-quiet eu-btn-icon eu-btn-sm"
        >
          <Icon icon={Projector} />
        </button>
        <button
          type="button"
          onClick={() => tabs.open({ kind: "settings" })}
          aria-current={isActive("settings") ? "page" : undefined}
          aria-label={settingsLabel}
          {...tip(settingsLabel, keysOf("settings"))}
          data-tip-place={placeFoot}
          className="eu-btn-quiet eu-btn-icon eu-btn-sm eu-current-raised"
        >
          <Icon icon={Settings} />
        </button>
      </div>
    </aside>
  );
});
