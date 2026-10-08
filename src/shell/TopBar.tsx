import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { q } from "../api/queries";
import { ChevronDown, CircleHelp, Pin, PinOff, Plus, Search, X } from "lucide-react";
import { courseVisual } from "../lib/color";
import { tr } from "../lib/i18n";
import { fitTabCount, tabs, useActiveId, useMaxTabs, useTabList, type Tab } from "../stores/tabs";
import { useDirtyMap } from "../stores/editors";
import { useAppearance } from "../lib/theme";
import { COURSE_ICONS } from "../components/ui";
import { Icon } from "../ui/Icon";
import { Kbd } from "../ui/Kbd";
import { tip } from "../ui/Tooltip";
import { keysOf } from "../lib/keymap";
import { Menu, MenuButton, type MenuEntry } from "../ui/Menu";
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
  onCloseTab: (id: string) => void | Promise<void>;
}) {
  const list = useTabList();
  const activeId = useActiveId();
  const maxTabs = useMaxTabs();
  const dirtyMap = useDirtyMap();
  const barRef = useRef<HTMLDivElement>(null);
  const extrasRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  // Reordering follows the pointer rather than HTML drag and drop: WebView2
  // gives no drag events to the page while Tauri accepts file drops.
  const drag = useRef<{ from: number; x: number; started: boolean; mids: number[] } | null>(null);
  const [dropAt, setDropAt] = useState<{ from: number; before: number } | null>(null);
  const beforeIndex = (mids: number[], x: number) => {
    const i = mids.findIndex((mid) => x < mid);
    return i === -1 ? mids.length : i;
  };

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
  }, []);

  // Tabs that do not fit scroll out of sight: keep the active one in view,
  // and offer the full list.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const check = () => setOverflowing(strip.scrollWidth > strip.clientWidth + 1);
    const ro = new ResizeObserver(check);
    ro.observe(strip);
    check();
    return () => ro.disconnect();
  }, [list.length]);
  useEffect(() => {
    stripRef.current?.querySelector("[data-active]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, list.length]);

  const closeMany = async (ids: string[]) => {
    // One after another: each unsaved tab asks before it goes.
    for (const id of ids) await onCloseTab(id);
  };
  const menuItems = (tab: Tab): MenuEntry[] => {
    const index = list.indexOf(tab);
    const others = list.filter((t) => t.id !== tab.id && !t.pinned).map((t) => t.id);
    const right = list
      .slice(index + 1)
      .filter((t) => !t.pinned)
      .map((t) => t.id);
    return [
      {
        label: tab.pinned ? tr("app.unpinTab") : tr("app.pinTab"),
        icon: tab.pinned ? PinOff : Pin,
        onSelect: () => tabs.togglePin(tab.id),
      },
      "separator",
      {
        label: tr("common.close"),
        icon: X,
        keys: tab.id === activeId ? keysOf("closeTab") : undefined,
        disabled: list.length < 2,
        onSelect: () => void onCloseTab(tab.id),
      },
      {
        label: tr("app.closeOthers"),
        disabled: others.length === 0,
        onSelect: () => void closeMany(others),
      },
      {
        label: tr("app.closeRight"),
        disabled: right.length === 0,
        onSelect: () => void closeMany(right),
      },
    ];
  };
  const menuTab = menu ? list.find((t) => t.id === menu.id) : undefined;
  // Stable while the menu is open: a new anchor would place it again.
  const menuAnchor = useMemo(
    () =>
      menu && {
        getBoundingClientRect: () => DOMRect.fromRect({ x: menu.x, y: menu.y, width: 0, height: 0 }),
      },
    [menu],
  );

  const hasCourseTab = list.some((t) => t.kind === "course" && typeof t.params?.courseId === "number");
  const courses = useQuery({ ...q.courses(), enabled: hasCourseTab }).data;
  const courseIcons = useMemo(() => {
    const map: CourseIcons = {};
    for (const c of courses ?? []) map[c.id] = { key: c.emoji || "book", color: c.color };
    return map;
  }, [courses]);

  const atLimit = maxTabs > 0 && list.length >= maxTabs;
  const closeLabel = tr("common.close");
  const newTabLabel = tr("app.newTab");
  const helpLabel = tr("app.shortcutsTitle");

  return (
    <div ref={barRef} className="eu-tabstrip">
      <div ref={stripRef} className="eu-tabs">
        <div role="tablist" aria-label={tr("app.openTabs")} className="eu-tabs-list">
          {list.map((tab, index) => {
            const active = tab.id === activeId;
            const dirty = !!dirtyMap[tab.id];
            const pinned = !!tab.pinned;
            return (
              <div
                key={tab.id}
                className="eu-tab group"
                data-active={active || undefined}
                data-pinned={pinned || undefined}
                data-drop-before={
                  (dropAt && dropAt.before === index && dropAt.from !== index && dropAt.from !== index - 1) ||
                  undefined
                }
                data-drop-after={
                  (dropAt &&
                    index === list.length - 1 &&
                    dropAt.before === list.length &&
                    dropAt.from !== index) ||
                  undefined
                }
                data-dragging={(dropAt && dropAt.from === index) || undefined}
                onPointerDown={(e) => {
                  if (e.button !== 0 || (e.target as HTMLElement).closest(".eu-tab-close")) return;
                  const strip = stripRef.current;
                  if (!strip) return;
                  const mids = Array.from(strip.querySelectorAll(".eu-tab"), (el) => {
                    const r = el.getBoundingClientRect();
                    return r.left + r.width / 2;
                  });
                  drag.current = { from: index, x: e.clientX, started: false, mids };
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d) return;
                  if (!d.started) {
                    if (Math.abs(e.clientX - d.x) < 6) return;
                    d.started = true;
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }
                  setDropAt({ from: d.from, before: beforeIndex(d.mids, e.clientX) });
                }}
                onPointerUp={(e) => {
                  const d = drag.current;
                  drag.current = null;
                  if (!d?.started) return;
                  setDropAt(null);
                  const before = beforeIndex(d.mids, e.clientX);
                  tabs.move(d.from, before > d.from ? before - 1 : before);
                }}
                onPointerCancel={() => {
                  drag.current = null;
                  setDropAt(null);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const open = () => setMenu({ id: tab.id, x: e.clientX, y: e.clientY });
                  // Linux fires this while the button is still down, and its
                  // release would dismiss a menu opened now; Windows fires it
                  // on release.
                  if (e.buttons & 2)
                    window.addEventListener("pointerup", () => setTimeout(open), { once: true });
                  else open();
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
                    if (e.button === 1 && list.length > 1) {
                      e.preventDefault();
                      onCloseTab(tab.id);
                    }
                  }}
                  onDoubleClick={() => tabs.togglePin(tab.id)}
                  {...tip(pinned ? `${tab.title} · ${tr("app.pinned")}` : tab.title)}
                  className="eu-tab-main"
                >
                  <TabIcon tab={tab} courseIcons={courseIcons} />
                  {!pinned && <span className="eu-tab-title">{tab.title}</span>}
                  {pinned && !dirty && <Icon icon={Pin} size={14} className="eu-tab-pin" />}
                  {dirty && <span className="eu-tab-dirty" aria-label={tr("app.unsaved")} />}
                </button>
                {!pinned && list.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onCloseTab(tab.id)}
                    // For the pointer only: a tab list holds tabs, and the
                    // keyboard closes the current one with Ctrl+W.
                    tabIndex={-1}
                    aria-hidden="true"
                    {...tip(closeLabel, keysOf("closeTab"))}
                    className="eu-tab-close"
                  >
                    <Icon icon={X} size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {/* Sticks to the strip's end when the tabs scroll. */}
        <span className="eu-tab-new-slot">
          <button
            type="button"
            onClick={() => {
              if (tabs.active()?.kind !== "dashboard") tabs.open({ kind: "dashboard" });
            }}
            aria-label={newTabLabel}
            {...(atLimit
              ? tip(`${newTabLabel} · ${tr("app.tabLimitHint")}`)
              : tip(newTabLabel, keysOf("newTab")))}
            className="eu-btn-quiet eu-btn-icon eu-btn-sm"
          >
            <Icon icon={Plus} />
          </button>
        </span>
      </div>
      {overflowing && (
        <div className="self-center shrink-0 pl-1">
          <MenuButton
            label={tr("app.allTabs")}
            placement="bottom-end"
            items={list.map((t) => ({
              label: t.title,
              icon: t.kind === "pdf" ? iconForFile(t.params?.fileName) : KIND_ICONS[t.kind],
              onSelect: () => tabs.setActive(t.id),
            }))}
          >
            <Icon icon={ChevronDown} />
          </MenuButton>
        </div>
      )}
      <Menu
        open={!!menuTab}
        anchor={menuAnchor}
        items={menuTab ? menuItems(menuTab) : []}
        label={menuTab?.title ?? ""}
        onClose={() => setMenu(null)}
      />

      <div ref={extrasRef} className="eu-tabstrip-extras">
        <TimerSlot />
        <button type="button" onClick={onSearch} className="eu-search-button">
          <Icon icon={Search} size={14} />
          <span className="eu-search-label">{tr("common.searchEllipsis")}</span>
          <Kbd keys={keysOf("palette")} />
        </button>
        <button
          type="button"
          onClick={onHelp}
          aria-label={helpLabel}
          {...tip(helpLabel, keysOf("help"))}
          className="eu-btn-quiet eu-btn-icon eu-btn-sm"
        >
          <Icon icon={CircleHelp} />
        </button>
      </div>
    </div>
  );
});
