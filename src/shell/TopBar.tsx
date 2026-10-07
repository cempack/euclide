import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { q } from "../api/queries";
import { CircleHelp, Pin, Plus, Search, X } from "lucide-react";
import { courseVisual } from "../lib/color";
import { get } from "../lib/i18n";
import { fitTabCount, useDirtyMap, useTabs, type Tab } from "../lib/tabs";
import { useAppearance } from "../lib/theme";
import { COURSE_ICONS } from "../components/ui";
import { Icon } from "../ui/Icon";
import { Kbd } from "../ui/Kbd";
import { tip } from "../ui/Tooltip";
import { KIND_ICONS, iconForFile } from "./nav";
import { TimerSlot } from "./Timer";

type CourseIcons = Record<number, { key: string; color: string }>;

/** A tab's icon: the course's own icon and colour when the tab is a course. */
function TabIcon({ tab, courseIcons }: { tab: Tab; courseIcons: CourseIcons }) {
  const { resolved } = useAppearance();
  const courseId = tab.params?.courseId;
  if ((tab.kind === "course" || tab.kind === "class-content") && typeof courseId === "number") {
    const info = courseIcons[courseId];
    const glyph = COURSE_ICONS.find((i) => i.key === (info?.key || "book"))?.Icon;
    if (glyph) {
      const Glyph = glyph;
      const visual = courseVisual(info?.color, resolved === "dark");
      return (
        <span style={{ color: info ? visual.fg : undefined }} className="contents">
          <Glyph size={14} strokeWidth={1.75} aria-hidden />
        </span>
      );
    }
  }
  const glyph = tab.kind === "pdf" ? iconForFile(tab.params?.fileName) : KIND_ICONS[tab.kind];
  return <Icon icon={glyph} size={14} />;
}

export const TopBar = memo(function TopBar({
  onHelp,
  onSearch,
  onCloseTab,
}: {
  onHelp: () => void;
  onSearch: () => void;
  onCloseTab: (id: string) => void;
}) {
  const tabs = useTabs();
  const dirtyMap = useDirtyMap();
  const barRef = useRef<HTMLDivElement>(null);
  const extrasRef = useRef<HTMLDivElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const measure = () => {
      const extras = extrasRef.current?.offsetWidth ?? 0;
      const plus = 36;
      tabs.setTabFitCapacity(fitTabCount(bar.clientWidth - extras - plus - 12));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    if (extrasRef.current) ro.observe(extrasRef.current);
    measure();
    return () => ro.disconnect();
  }, [tabs.setTabFitCapacity]);

  const hasCourseTab = tabs.tabs.some((t) => t.kind === "course" && typeof t.params?.courseId === "number");
  const courses = useQuery({ ...q.courses(), enabled: hasCourseTab }).data;
  const courseIcons = useMemo(() => {
    const map: CourseIcons = {};
    for (const c of courses ?? []) map[c.id] = { key: c.emoji || "book", color: c.color };
    return map;
  }, [courses]);

  const atLimit = tabs.maxTabs > 0 && tabs.tabs.length >= tabs.maxTabs;
  const closeLabel = get("common.close", "Fermer");
  const newTabLabel = get("app.newTab", "Nouvel onglet");
  const helpLabel = get("app.shortcutsTitle", "Raccourcis");

  return (
    <div ref={barRef} className="eu-tabstrip">
      <div role="tablist" aria-label={get("app.openTabs", "Onglets ouverts")} className="eu-tabs">
        {tabs.tabs.map((tab, index) => {
          const active = tab.id === tabs.activeId;
          const dirty = !!dirtyMap[tab.id];
          const pinned = !!tab.pinned;
          return (
            <div
              key={tab.id}
              className="eu-tab group"
              data-active={active || undefined}
              data-pinned={pinned || undefined}
              data-drop={(overIndex === index && dragIndex !== null && dragIndex !== index) || undefined}
              data-dragging={dragIndex === index || undefined}
              draggable
              onDragStart={(e) => {
                setDragIndex(index);
                e.dataTransfer.effectAllowed = "move";
                // Firefox/WebKit need some payload for the drag to start.
                e.dataTransfer.setData("text/plain", tab.id);
              }}
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                setOverIndex(index);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) tabs.move(dragIndex, index);
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={pinned ? tab.title : undefined}
                onClick={() => tabs.setActive(tab.id)}
                onAuxClick={(e) => {
                  // Middle click closes, as in a browser.
                  if (e.button === 1 && tabs.tabs.length > 1) {
                    e.preventDefault();
                    onCloseTab(tab.id);
                  }
                }}
                onDoubleClick={() => tabs.togglePin(tab.id)}
                {...tip(pinned ? `${tab.title} · ${get("app.pinned", "Épinglé")}` : tab.title)}
                className="eu-tab-main"
              >
                <TabIcon tab={tab} courseIcons={courseIcons} />
                {!pinned && <span className="eu-tab-title">{tab.title}</span>}
                {pinned && !dirty && <Icon icon={Pin} size={14} className="eu-tab-pin" />}
                {dirty && <span className="eu-tab-dirty" aria-label={get("app.unsaved", "Non enregistré")} />}
              </button>
              {!pinned && tabs.tabs.length > 1 && (
                <button
                  type="button"
                  onClick={() => onCloseTab(tab.id)}
                  aria-label={`${closeLabel} — ${tab.title}`}
                  {...tip(closeLabel, "mod+W")}
                  className="eu-tab-close"
                >
                  <Icon icon={X} size={14} />
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => {
            if (tabs.active?.kind !== "dashboard") tabs.open({ kind: "dashboard" });
          }}
          aria-label={newTabLabel}
          {...(atLimit
            ? tip(
                `${newTabLabel} · ${get("app.tabLimitHint", "la limite est atteinte : le plus ancien sera fermé")}`,
              )
            : tip(newTabLabel, "mod+T"))}
          className="eu-tab-new eu-btn-quiet eu-btn-icon eu-btn-sm"
        >
          <Icon icon={Plus} />
        </button>
      </div>

      <div ref={extrasRef} className="eu-tabstrip-extras">
        <TimerSlot />
        <button type="button" onClick={onSearch} className="eu-search-button">
          <Icon icon={Search} size={14} />
          <span className="eu-search-label">{get("common.searchEllipsis", "Rechercher…")}</span>
          <Kbd keys="mod+K" />
        </button>
        <button
          type="button"
          onClick={onHelp}
          aria-label={helpLabel}
          {...tip(helpLabel, "mod+/")}
          className="eu-btn-quiet eu-btn-icon eu-btn-sm"
        >
          <Icon icon={CircleHelp} />
        </button>
      </div>
    </div>
  );
});
