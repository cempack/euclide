import { useEffect, useState, useRef, useCallback, useMemo, lazy, Suspense, memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
 api,
 type AppInfo,
 type FileItem,
 type PronoteStatus,
 type ScheduleEntry,
 isTauri,
} from "./lib/api";
import { get, fmt } from "./lib/i18n";
import { isMac, MOD } from "./lib/shortcuts";
import { focusClass, humanMinutes, minutesRemaining, minutesUntil } from "./lib/format";
import { courseVisual } from "./lib/color";
import { useAppearance } from "./lib/theme";
import { checkForAppUpdate, wasUpdateDismissed, type AppUpdateInfo } from "./lib/updater";

import { TabsProvider, useTabs, fitTabCount, type Tab, type TabKind } from "./lib/tabs";
import { ToastProvider, ConfirmProvider, useToast, useConfirm, Loading, COURSE_ICONS } from "./components/ui";
import { Segmented } from "./components/layout";
import CommandPalette from "./components/CommandPalette";
import ShortcutsHelp from "./components/ShortcutsHelp";
import { UpdateAvailablePopup } from "./components/UpdateAvailablePopup";
import {
 BookIcon,
 CoffeeIcon,
 DocIcon,
 GearIcon,
 HelpIcon,
 HomeIcon,
 PauseIcon,
 PenIcon,
 PinIcon,
 PlayIcon,
 PlusIcon,
 ProjectorIcon,
 SearchIcon,
 ToolIcon,
 XIcon,
 BellIcon,
 CodeIcon,
 NoteIcon,
 ImageIcon,
 FolderIcon,
 SparkleIcon,
 ClockIcon,
} from "./components/icons";
import Dashboard from "./screens/Dashboard";
import Courses from "./screens/Courses";
const CourseDetail = lazy(() => import("./screens/CourseDetail"));
import Documents from "./screens/Documents";
import Tools from "./screens/Tools";
const Python = lazy(() => import("./screens/Python"));
import Settings from "./screens/Settings";
import Reminders from "./screens/Reminders";
const Recap = lazy(() => import("./screens/Recap"));
const ClassContent = lazy(() => import("./screens/ClassContent"));
const Whiteboard = lazy(() => import("./components/Whiteboard"));
const PdfViewer = lazy(() => import("./components/PdfViewer"));
const NoteEditor = lazy(() => import("./components/NoteEditor"));

const TAB_ICONS: Partial<Record<TabKind, React.ReactNode>> = {
 dashboard: <HomeIcon className="w-4 h-4" />,
 courses: <BookIcon className="w-4 h-4" />,
 course: <BookIcon className="w-4 h-4" />,
 "class-content": <BookIcon className="w-4 h-4" />,
 tools: <ToolIcon className="w-4 h-4" />,
 python: <CodeIcon className="w-4 h-4" />,
 settings: <GearIcon className="w-4 h-4" />,
 reminders: <BellIcon className="w-4 h-4" />,
 recap: <SparkleIcon className="w-4 h-4" />,
};

/** Sidebar navigation, grouped: what you work on, then what you work with. */
type NavItem = { kind: TabKind; label: string; icon: React.ReactNode; hint?: string };

const NAV_WORK: NavItem[] = [
 { kind: "dashboard", label: get("nav.dashboard", "Tableau de bord"), icon: <HomeIcon className="w-4 h-4" />, hint: `${MOD}D` },
 { kind: "courses", label: get("nav.courses", "Cours"), icon: <BookIcon className="w-4 h-4" /> },
 { kind: "documents", label: get("nav.documents", "Documents"), icon: <DocIcon className="w-4 h-4" />, hint: `${MOD}F` },
 { kind: "reminders", label: get("nav.reminders", "Rappels"), icon: <BellIcon className="w-4 h-4" /> },
];

const NAV_TOOLS: NavItem[] = [
 { kind: "note", label: get("nav.notes", "Nouvelle note"), icon: <NoteIcon className="w-4 h-4" />, hint: `${MOD}N` },
 { kind: "whiteboard", label: get("nav.whiteboard", "Tableau blanc"), icon: <PenIcon className="w-4 h-4" />, hint: `${MOD}B` },
 { kind: "python", label: get("nav.python", "Python"), icon: <CodeIcon className="w-4 h-4" /> },
 { kind: "tools", label: get("nav.tools", "Outils"), icon: <ToolIcon className="w-4 h-4" /> },
 { kind: "recap", label: get("nav.recap", "Bilan"), icon: <SparkleIcon className="w-4 h-4" /> },
];

function navKindActive(navKind: TabKind, activeKind?: TabKind): boolean {
 if (!activeKind) return false;
 if (navKind === activeKind) return true;
 if (navKind === "courses" && (activeKind === "course" || activeKind === "class-content")) return true;
 if (navKind === "documents" && activeKind === "pdf") return true;
 if (navKind === "note" && activeKind === "note") return true;
 if (navKind === "whiteboard" && activeKind === "whiteboard") return true;
 return false;
}

/** Screens that manage their own full-bleed chrome instead of the text column. */
const FULL_BLEED: TabKind[] = ["python", "whiteboard", "pdf", "note"];

async function afterImport(added: FileItem[], toast: (m: string, t?: "info" | "success" | "error") => void) {
 if (!added.length) return;
 added.forEach((f) => api.logEvent("file_import", f.name, null));
 toast(get("messages.indexing", "Indexation…"), "info");
 await api.indexImportedPdfs(added).catch(() => {});
 window.dispatchEvent(new CustomEvent("eu:library-changed"));
 toast(get("messages.imported", "{count} importé(s)").replace("{count}", String(added.length)), "success");
}

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
 className={`eu-nav-item group flex items-center gap-2.5 px-2.5 rounded text-left transition-colors duration-fast ${
 active
 ? "bg-ink text-panel font-medium"
 : "text-ink-muted hover:text-ink hover:bg-panel-alt"
 }`}
 >
 <span className={`shrink-0 ${active ? "" : "opacity-75"}`}>{item.icon}</span>
 <span className="eu-t-body truncate">{item.label}</span>
 {item.hint && (
 <span
 className={`ml-auto font-mono text-[9.5px] tabular-nums ${
 active ? "text-panel/60" : "text-ink-faint"
 }`}
 >
 {item.hint}
 </span>
 )}
 </button>
 );
});

const ProjectionRail = memo(function ProjectionRail() {
 const { toggleProjection } = useAppearance();
 return (
 <aside className="eu-sidebar eu-sidebar-rail shrink-0 h-full flex flex-col items-center bg-canvas border-r border-line">
 <button
 type="button"
 onClick={toggleProjection}
 aria-pressed
 title={`${get("appearance.leaveProjection", "Quitter la projection")} (Échap)`}
 aria-label={get("appearance.leaveProjection", "Quitter la projection")}
 className="eu-btn-ghost eu-btn-icon"
 >
 <ProjectorIcon className="w-4 h-4" />
 </button>
 </aside>
 );
});

const Sidebar = memo(function Sidebar({ info }: { info: AppInfo | null }) {
 const tabs = useTabs();
 const { projection, toggleProjection } = useAppearance();
 const [pronote, setPronote] = useState<PronoteStatus | null>(null);
 const isActive = (kind: TabKind) => navKindActive(kind, tabs.active?.kind);

 useEffect(() => {
 api.pronoteStatus().then(setPronote).catch(() => {});
 const onChange = () => {
 api.pronoteStatus().then(setPronote).catch(() => {});
 };
 window.addEventListener("eu:pronote-changed", onChange);
 return () => window.removeEventListener("eu:pronote-changed", onChange);
 }, []);

 const accountName = (pronote?.connected && pronote.account_name ? pronote.account_name : "").trim();
 const showAccount = !!pronote?.connected;

 const onOpen = useCallback(
 (item: NavItem) => {
 if (item.kind === "whiteboard") {
 tabs.open({ kind: "whiteboard", title: get("app.tabWhiteboard", "Tableau"), params: { isNew: true } });
 } else if (item.kind === "note") {
 tabs.open({ kind: "note", title: get("common.newNote", "Nouvelle note"), params: { isNew: true } });
 } else {
 tabs.open({ kind: item.kind });
 }
 },
 [tabs]
 );

 return (
 <aside className="eu-sidebar w-[232px] shrink-0 h-full flex flex-col gap-1 bg-canvas border-r border-line">
 <div className="flex items-center gap-2.5 px-1.5 pb-1">
 <img src="/euclide-logo.png" alt="" className="w-7 h-7 rounded object-contain" />
 <div className="min-w-0 leading-tight">
 <div className="font-mono text-[12px] font-semibold tracking-[0.16em] text-ink">EUCLIDE</div>
 <div className="font-mono text-[9px] tracking-[0.12em] text-ink-faint uppercase truncate">
 {get("app.tagline", "Bureau d'enseignement")}
 </div>
 </div>
 </div>

 <p className="eu-t-label px-2.5 mt-4 mb-1">{get("nav.groupWork", "Travail")}</p>
 <nav className="flex flex-col gap-0.5" aria-label={get("nav.groupWork", "Travail")}>
 {NAV_WORK.map((item) => (
 <NavButton key={item.kind} item={item} active={isActive(item.kind)} onOpen={onOpen} />
 ))}
 </nav>

 <p className="eu-t-label px-2.5 mt-4 mb-1">{get("nav.groupTools", "Outils")}</p>
 <nav className="flex flex-col gap-0.5" aria-label={get("nav.groupTools", "Outils")}>
 {NAV_TOOLS.map((item) => (
 <NavButton key={item.kind} item={item} active={isActive(item.kind)} onOpen={onOpen} />
 ))}
 </nav>

 <div className="mt-auto pt-2 border-t border-line flex flex-col gap-0.5">
 <div className="flex items-center gap-1.5 px-1 py-1">
 {showAccount ? (
 <>
 <span className="w-7 h-7 shrink-0 grid place-items-center rounded-full bg-ink text-panel font-mono text-[10.5px] font-semibold">
 {(accountName || "P").charAt(0).toUpperCase()}
 </span>
 <div className="min-w-0 flex-1 leading-tight">
 <div className="eu-t-body font-medium text-ink truncate">
 {accountName || get("status.pronoteOn", "pronote connecté")}
 </div>
 <div className="font-mono text-[9px] tracking-[0.1em] text-ink-faint uppercase">
 v{info?.version ?? "…"}
 </div>
 </div>
 </>
 ) : (
 <div className="min-w-0 flex-1 px-1.5 leading-tight">
 <div className="font-mono text-[9px] tracking-[0.1em] text-ink-faint uppercase">
 v{info?.version ?? "…"}
 </div>
 </div>
 )}
 <button
 type="button"
 onClick={toggleProjection}
 aria-pressed={projection}
 title={`${get("appearance.projection", "Mode projection")} (${MOD}⇧P)`}
 aria-label={get("appearance.projection", "Mode projection")}
 className={`eu-btn-icon eu-btn-sm ${
 projection ? "eu-btn-ghost" : "eu-btn-quiet"
 }`}
 >
 <ProjectorIcon className="w-4 h-4" />
 </button>
 <button
 type="button"
 onClick={() => tabs.open({ kind: "settings" })}
 title={`${get("nav.settings", "Réglages")} (${MOD},)`}
 aria-label={get("nav.settings", "Réglages")}
 className={`eu-btn-icon eu-btn-sm ${
 isActive("settings") ? "eu-btn-ghost" : "eu-btn-quiet"
 }`}
 >
 <GearIcon className="w-4 h-4" />
 </button>
 </div>
 </div>
 </aside>
 );
});

function formatTimer(sec: number) {
 const m = Math.floor(Math.max(0, sec) / 60);
 const s = Math.max(0, sec) % 60;
 return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Two-note chime with a soft attack and release.
 * The previous version was a bare 880 Hz square burst — startling in a quiet
 * classroom. This is deliberately gentle: a fifth, fading out.
 */
function chime(volume = 0.07) {
 try {
 const Ctx =
 window.AudioContext ||
 (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
 const ctx = new Ctx();
 const now = ctx.currentTime;
 const notes: Array<[number, number]> = [
 [660, 0],
 [990, 0.16],
 ];
 for (const [freq, delay] of notes) {
 const osc = ctx.createOscillator();
 const gain = ctx.createGain();
 osc.type = "sine";
 osc.frequency.value = freq;
 osc.connect(gain);
 gain.connect(ctx.destination);
 const t = now + delay;
 gain.gain.setValueAtTime(0, t);
 gain.gain.linearRampToValueAtTime(volume, t + 0.03);
 gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
 osc.start(t);
 osc.stop(t + 0.8);
 }
 window.setTimeout(() => ctx.close().catch(() => {}), 1400);
 } catch {
 // no audio device / autoplay blocked: silence is an acceptable outcome
 }
}

/** Icon shown on a tab, including the course colour when we know it. */
function TabIcon({
 tab,
 courseIconMap,
}: {
 tab: Tab;
 courseIconMap: Record<number, { key: string; color: string }>;
}) {
 const { resolved } = useAppearance();
 if (
 (tab.kind === "course" || tab.kind === "class-content") &&
 typeof tab.params?.courseId === "number"
 ) {
 const info = courseIconMap[tab.params.courseId];
 const found = COURSE_ICONS.find((i) => i.key === (info?.key || "book"));
 const IconComp = found ? found.Icon : BookIcon;
 const visual = courseVisual(info?.color, resolved === "dark");
 return (
 <span style={{ color: info ? visual.fg : undefined }}>
 <IconComp className="w-3.5 h-3.5" strokeWidth={1.8} />
 </span>
 );
 }
 if (tab.kind === "pdf") {
 const fn = (tab.params?.fileName || "").toLowerCase();
 if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(fn)) return <ImageIcon className="w-3.5 h-3.5" />;
 return <DocIcon className="w-3.5 h-3.5" />;
 }
 if (tab.kind === "whiteboard") return <PenIcon className="w-3.5 h-3.5" />;
 if (tab.kind === "note") return <NoteIcon className="w-3.5 h-3.5" />;
 if (tab.kind === "documents") return <FolderIcon className="w-3.5 h-3.5" />;
 if (tab.kind === "recap") return <SparkleIcon className="w-3.5 h-3.5" />;
 return TAB_ICONS[tab.kind] ?? <DocIcon className="w-3.5 h-3.5" />;
}

const TopBar = memo(function TopBar({
 onHelp,
 onSearch,
 onCloseTab,
 timer,
}: {
 onHelp: () => void;
 onSearch: () => void;
 onCloseTab: (id: string) => void;
 timer: TimerApi;
}) {
 const tabs = useTabs();
 const barRef = useRef<HTMLDivElement>(null);
 const extrasRef = useRef<HTMLDivElement>(null);
 const [courseIconMap, setCourseIconMap] = useState<Record<number, { key: string; color: string }>>({});
 const [dragIndex, setDragIndex] = useState<number | null>(null);
 const [overIndex, setOverIndex] = useState<number | null>(null);

 useEffect(() => {
 const bar = barRef.current;
 if (!bar) return;
 const measure = () => {
 const extras = extrasRef.current?.offsetWidth ?? 0;
 const plus = 36;
 const available = bar.clientWidth - extras - plus - 12;
 tabs.setTabFitCapacity(fitTabCount(available));
 };
 const ro = new ResizeObserver(measure);
 ro.observe(bar);
 if (extrasRef.current) ro.observe(extrasRef.current);
 measure();
 return () => ro.disconnect();
 }, [tabs.setTabFitCapacity, timer.sec]);

 useEffect(() => {
 const courseTabs = tabs.tabs.filter(
 (t) => t.kind === "course" && typeof t.params?.courseId === "number"
 );
 if (courseTabs.length === 0) {
 if (Object.keys(courseIconMap).length > 0) setCourseIconMap({});
 return;
 }
 api
 .listCourses()
 .then((courses) => {
 const map: Record<number, { key: string; color: string }> = {};
 for (const c of courses) {
 if (typeof c.id === "number") map[c.id] = { key: c.emoji || "book", color: c.color };
 }
 setCourseIconMap(map);
 })
 .catch(() => setCourseIconMap({}));
 }, [tabs.tabs.length]);

 const atLimit = tabs.maxTabs > 0 && tabs.tabs.length >= tabs.maxTabs;

 return (
 <div ref={barRef} className="eu-topbar shrink-0 flex items-stretch bg-canvas border-b border-line">
 <div
 role="tablist"
 aria-label={get("app.openTabs", "Onglets ouverts")}
 className="flex items-stretch overflow-x-auto min-w-0"
 >
 {tabs.tabs.map((tab, index) => {
 const active = tab.id === tabs.activeId;
 const dirty = tabs.isDirty(tab.id);
 const dropTarget = overIndex === index && dragIndex !== null && dragIndex !== index;
 return (
 <div
 key={tab.id}
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
 className={`group relative flex items-center border-b-2 border-r border-r-line/60 transition-colors duration-fast ${
 active
 ? "border-b-ink bg-panel"
 : "border-b-transparent hover:bg-panel-alt/60"
 } ${dropTarget ? "bg-accent-soft" : ""} ${dragIndex === index ? "opacity-45" : ""}`}
 >
 <button
 type="button"
 role="tab"
 aria-selected={active}
 onClick={() => tabs.setActive(tab.id)}
 onAuxClick={(e) => {
 // Middle click closes, as in a browser.
 if (e.button === 1 && tabs.tabs.length > 1) {
 e.preventDefault();
 onCloseTab(tab.id);
 }
 }}
 onDoubleClick={() => tabs.togglePin(tab.id)}
 title={`${tab.title}${tab.pinned ? ` · ${get("app.pinned", "Épinglé")}` : ""}`}
 className={`flex items-center gap-2 h-full pl-3 pr-2 max-w-[190px] select-none ${
 active ? "text-ink" : "text-ink-muted"
 }`}
 >
 <span className="shrink-0 opacity-80">
 <TabIcon tab={tab} courseIconMap={courseIconMap} />
 </span>
 <span className={`eu-t-meta truncate ${active ? "text-ink font-medium" : ""}`}>
 {tab.title}
 </span>
 {tab.pinned && <PinIcon className="w-3 h-3 shrink-0 text-ink-faint" />}
 {dirty && (
 <span
 className="w-1.5 h-1.5 rounded-full bg-warn-solid shrink-0"
 title={get("app.unsaved", "Non enregistré")}
 />
 )}
 </button>
 {tabs.tabs.length > 1 && (
 <button
 type="button"
 onClick={() => onCloseTab(tab.id)}
 aria-label={`${get("common.close", "Fermer")} — ${tab.title}`}
 title={`${get("common.close", "Fermer")} (${MOD}W)`}
 className={`shrink-0 w-6 h-6 mr-1 grid place-items-center rounded-sm text-ink-faint transition-opacity duration-fast hover:bg-danger-soft hover:text-danger ${
 active ? "opacity-70" : "opacity-0 group-hover:opacity-70"
 } focus-visible:opacity-100`}
 >
 <XIcon className="w-3 h-3" />
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
 aria-label={get("app.newTab", "Nouvel onglet")}
 title={
 atLimit
 ? `${get("app.newTab", "Nouvel onglet")} · ${get("app.tabLimitHint", "la limite est atteinte : le plus ancien sera fermé")}`
 : `${get("app.newTab", "Nouvel onglet")} (${MOD}T)`
 }
 className="shrink-0 self-center ml-1.5 eu-btn-quiet eu-btn-icon eu-btn-sm"
 >
 <PlusIcon className="w-4 h-4" strokeWidth={2.2} />
 </button>
 </div>

 <div className="flex-1 min-w-2" />

 <div ref={extrasRef} className="flex items-center gap-1 shrink-0 pl-2 pr-2">
 {timer.sec != null && <TimerControl timer={timer} />}

 <button
 type="button"
 onClick={onSearch}
 title={`${get("common.search", "Rechercher")} (${MOD}K)`}
 className="flex items-center gap-2 h-7 pl-2.5 pr-1.5 rounded-full border border-line bg-panel text-ink-muted hover:text-ink hover:bg-panel-alt transition-colors duration-fast"
 >
 <SearchIcon className="w-3.5 h-3.5" />
 <span className="eu-t-meta hidden sm:inline">{get("common.search", "Rechercher")}</span>
 <span className="eu-kbd">{isMac ? "⌘K" : "^K"}</span>
 </button>

 <button
 type="button"
 onClick={onHelp}
 aria-label={get("app.shortcutsTitle", "Raccourcis")}
 title={`${get("app.shortcutsTitle", "Raccourcis")} (${MOD}/)`}
 className="eu-btn-quiet eu-btn-icon eu-btn-sm"
 >
 <HelpIcon className="w-4 h-4" />
 </button>
 </div>
 </div>
 );
});

// ---------------------------------------------------------------------------
// Class timer — free duration, +1 min, reset, gentle chime, projection view.
// ---------------------------------------------------------------------------

type TimerApi = {
 sec: number | null;
 running: boolean;
 start: (minutes: number) => void;
 toggle: () => void;
 add: (minutes: number) => void;
 stop: () => void;
};

function TimerControl({ timer }: { timer: TimerApi }) {
 const done = (timer.sec ?? 0) <= 0;
 return (
 <div
 className={`flex items-center rounded border overflow-hidden ${
 done ? "border-danger bg-danger-soft" : "border-line bg-panel"
 }`}
 >
 <button
 type="button"
 onClick={timer.toggle}
 title={timer.running ? get("timer.pause", "Pause") : get("timer.resume", "Reprendre")}
 aria-label={timer.running ? get("timer.pause", "Pause") : get("timer.resume", "Reprendre")}
 className={`flex items-center gap-1.5 h-7 px-2 font-mono text-[12px] tabular-nums ${
 done ? "text-danger" : "text-ink hover:bg-panel-alt"
 }`}
 >
 {timer.running ? <PauseIcon className="w-3.5 h-3.5" /> : <PlayIcon className="w-3.5 h-3.5" />}
 {formatTimer(timer.sec ?? 0)}
 </button>
 <button
 type="button"
 onClick={() => timer.add(1)}
 title={get("timer.addMinute", "+1 minute")}
 aria-label={get("timer.addMinute", "+1 minute")}
 className="h-7 px-1.5 border-l border-line font-mono text-[11px] text-ink-muted hover:text-ink hover:bg-panel-alt"
 >
 +1
 </button>
 <button
 type="button"
 onClick={timer.stop}
 title={get("timer.stop", "Arrêter le minuteur")}
 aria-label={get("timer.stop", "Arrêter le minuteur")}
 className="h-7 px-1.5 border-l border-line text-ink-faint hover:text-danger hover:bg-danger-soft"
 >
 <XIcon className="w-3 h-3" />
 </button>
 </div>
 );
}

/** Big countdown for the classroom, shown while projection mode is on. */
function TimerStage({ timer }: { timer: TimerApi }) {
 if (timer.sec == null) return null;
 const done = timer.sec <= 0;
 return (
 <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-overlay">
 <div
 className={`eu-panel shadow-pop px-7 py-4 flex items-center gap-5 ${
 done ? "border-danger" : ""
 }`}
 >
 <span
 className={`font-mono text-[64px] leading-none font-semibold tabular-nums tracking-[-0.03em] ${
 done ? "text-danger" : "text-ink"
 }`}
 >
 {formatTimer(timer.sec)}
 </span>
 <div className="flex flex-col gap-1.5">
 <button type="button" onClick={timer.toggle} className="eu-btn-ghost eu-btn-sm">
 {timer.running ? <PauseIcon className="w-3.5 h-3.5" /> : <PlayIcon className="w-3.5 h-3.5" />}
 {timer.running ? get("timer.pause", "Pause") : get("timer.resume", "Reprendre")}
 </button>
 <button type="button" onClick={() => timer.add(1)} className="eu-btn-ghost eu-btn-sm">
 +1 min
 </button>
 <button type="button" onClick={timer.stop} className="eu-btn-quiet eu-btn-sm">
 {get("timer.stop", "Arrêter")}
 </button>
 </div>
 </div>
 </div>
 );
}

const MainContent = memo(function MainContent({ info }: { info: AppInfo | null }) {
 const tabs = useTabs();
 return (
 <div className="flex-1 min-h-0 relative bg-canvas">
 {tabs.tabs.map((tab) => {
 const visible = tab.id === tabs.activeId;
 return (
 <div
 key={tab.mountId}
 className="absolute inset-0 flex flex-col min-h-0"
 style={{ display: visible ? "flex" : "none" }}
 aria-hidden={!visible}
 {...(!visible ? ({ inert: "" } as Record<string, string>) : {})}
 >
 {FULL_BLEED.includes(tab.kind) ? (
 // Tool screens own their whole surface; wrapping them in the
 // reading column is what pushed the Python pane off-screen.
 <div className="flex-1 min-h-0 flex flex-col">
 <TabPane info={info} tab={tab} visible={visible} />
 </div>
 ) : (
 <Scroll>
 <TabPane info={info} tab={tab} visible={visible} />
 </Scroll>
 )}
 </div>
 );
 })}
 </div>
 );
});

function TabPane({ info, tab, visible }: { info: AppInfo | null; tab: Tab; visible: boolean }) {
 switch (tab.kind) {
 case "dashboard":
 return <Dashboard info={info} />;
 case "courses":
 return <Courses />;
 case "course":
 return (
 <Suspense fallback={<Loading label={get("common.loading", "Chargement…")} />}>
 <CourseDetail courseId={tab.params.courseId!} />
 </Suspense>
 );
 case "class-content":
 return (
 <Suspense fallback={<Loading label={get("classContent.loading", "Chargement…")} />}>
 <ClassContent
 courseId={tab.params.courseId!}
 className={tab.params.className || ""}
 matiere={tab.params.matiere || ""}
 />
 </Suspense>
 );
 case "documents":
 return <Documents filterHint={tab.params.filter} />;
 case "tools":
 return <Tools />;
 case "python":
 return (
 <Suspense fallback={<Loading label={get("common.loading", "Chargement…")} />}>
 <Python />
 </Suspense>
 );
 case "settings":
 return <Settings info={info} />;
 case "reminders":
 return <Reminders />;
 case "recap":
 return (
 <Suspense fallback={<Loading label={get("common.loading", "Chargement…")} />}>
 <Recap />
 </Suspense>
 );
 case "whiteboard":
 return (
 <Suspense fallback={<Loading label={get("common.loading", "Chargement…")} />}>
 <Whiteboard tabId={tab.id} fileId={tab.params.fileId} visible={visible} />
 </Suspense>
 );
 case "pdf":
 return (
 <Suspense fallback={<Loading label={get("common.loading", "Chargement…")} />}>
 <PdfViewer fileId={tab.params.fileId!} fileName={tab.params.fileName ?? tab.title} />
 </Suspense>
 );
 case "note":
 return (
 <Suspense fallback={<Loading label={get("common.loading", "Chargement…")} />}>
 <NoteEditor tabId={tab.id} noteId={tab.params.noteId} isNew={!!tab.params.isNew} initialCourseId={tab.params.courseId} />
 </Suspense>
 );
 default:
 return null;
 }
}

/**
 * The reading column for content screens: one place that owns the max width,
 * the gutters and the vertical rhythm. Screens no longer re-wrap themselves
 * (Dashboard and Rappels used to add a second `max-w` + padding, which is why
 * their headers sat at a different height from every other screen).
 */
function Scroll({ children }: { children: React.ReactNode }) {
 return (
 <div className="h-full overflow-y-auto">
 <div className="mx-auto max-w-col eu-page">{children}</div>
 </div>
 );
}

// ---------------------------------------------------------------------------
// Window status bar — the state that used to be scattered across dashboard
// widgets, available from every screen instead of only from the home page.
// ---------------------------------------------------------------------------

const StatusBar = memo(function StatusBar({ info, timer }: { info: AppInfo | null; timer: TimerApi }) {
 const tabs = useTabs();
 const { resolved, pref } = useAppearance();
 const [classes, setClasses] = useState<ScheduleEntry[]>([]);
 const [pronote, setPronote] = useState<PronoteStatus | null>(null);
 const [keepAwake, setKeepAwake] = useState<boolean | null>(null);
 const [now, setNow] = useState(() => new Date());

 const refresh = useCallback(() => {
 api.getTodayClasses().then(setClasses).catch(() => {});
 api.pronoteStatus().then(setPronote).catch(() => {});
 api.keepAwakeStatus().then((s) => setKeepAwake(!!s)).catch(() => {});
 }, []);

 useEffect(() => {
 refresh();
 const onChange = () => refresh();
 window.addEventListener("eu:schedule-changed", onChange);
 window.addEventListener("eu:pronote-changed", onChange);
 window.addEventListener("eu:keepawake-changed", onChange);
 const id = window.setInterval(() => setNow(new Date()), 20_000);
 return () => {
 window.removeEventListener("eu:schedule-changed", onChange);
 window.removeEventListener("eu:pronote-changed", onChange);
 window.removeEventListener("eu:keepawake-changed", onChange);
 window.clearInterval(id);
 };
 }, [refresh]);

 const focus = useMemo(() => focusClass(classes, now), [classes, now]);
 const remaining = focus?.state === "current" ? minutesRemaining(focus.entry, now) : null;
 const until = focus?.state === "next" ? minutesUntil(focus.entry.start_time, now) : null;

 const themeLabel =
 pref === "auto"
 ? `${get("appearance.auto", "Auto")} · ${resolved === "dark" ? get("appearance.dark", "Sombre") : get("appearance.light", "Clair")}`
 : resolved === "dark"
 ? get("appearance.dark", "Sombre")
 : get("appearance.light", "Clair");

 return (
 <div className="eu-statusbar h-6 shrink-0 flex items-stretch border-t border-line bg-panel-alt font-mono text-[10.5px] text-ink-faint select-none">
 {focus ? (
 <button
 type="button"
 onClick={() => tabs.open({ kind: "dashboard" })}
 title={get("status.openDashboard", "Ouvrir le tableau de bord")}
 className={`flex items-center gap-2 px-2.5 border-r border-line hover:bg-panel ${
 focus.state === "current" ? "text-warn" : "text-ink-muted"
 }`}
 >
 <span className="truncate max-w-[240px]">{focus.entry.subject}</span>
 {focus.state === "current" ? (
 <span className="tabular-nums">
 {remaining != null
 ? fmt(get("status.remaining", "reste {time}"), { time: humanMinutes(remaining) })
 : get("status.ending", "fin")}
 </span>
 ) : (
 <span className="tabular-nums">
 {until != null
 ? fmt(get("status.inTime", "dans {time}"), { time: humanMinutes(until) })
 : focus.entry.start_time}
 </span>
 )}
 </button>
 ) : (
 <span className="flex items-center px-2.5 border-r border-line">
 {get("status.noClass", "aucun cours en cours")}
 </span>
 )}

 {timer.sec != null && (
 <span className="flex items-center gap-1.5 px-2.5 border-r border-line text-ink-muted tabular-nums">
 <ClockIcon className="w-3 h-3" />
 {formatTimer(timer.sec)}
 </span>
 )}

 <button
 type="button"
 onClick={() => tabs.open({ kind: "settings" })}
 title={get("status.pronoteHint", "État de la connexion Pronote")}
 className="flex items-center gap-1.5 px-2.5 border-r border-line hover:bg-panel"
 >
 <span
 className={`w-1.5 h-1.5 rounded-full ${pronote?.connected ? "bg-ok-solid" : "bg-line-strong"}`}
 />
 <span className={pronote?.connected ? "text-ok" : ""}>
 {pronote?.connected
 ? get("status.pronoteOn", "pronote connecté")
 : get("status.pronoteOff", "pronote hors ligne")}
 </span>
 </button>

 {keepAwake && (
 <span className="flex items-center gap-1.5 px-2.5 border-r border-line text-warn">
 <CoffeeIcon className="w-3 h-3" />
 {get("status.awake", "écran maintenu")}
 </span>
 )}

 <span className="flex-1" />

 <span className="hidden lg:flex items-center px-2.5 border-l border-line">
 {tabs.tabs.length}
 {tabs.maxTabs > 0 ? ` / ${tabs.maxTabs}` : ""} {get("status.tabs", "onglets")}
 </span>
 <span
 className="hidden xl:flex items-center px-2.5 border-l border-line max-w-[300px] truncate selectable"
 title={info?.data_dir || ""}
 >
 {info?.data_dir}
 </span>
 <span className="flex items-center px-2.5 border-l border-line">{themeLabel}</span>
 <span className="flex items-center px-2.5 border-l border-line">v{info?.version ?? "…"}</span>
 </div>
 );
});

// ---------------------------------------------------------------------------
// Quick capture — one line, saved as a reminder or a note.
// ---------------------------------------------------------------------------

function QuickCapture({ open, onClose }: { open: boolean; onClose: () => void }) {
 const toast = useToast();
 const tabs = useTabs();
 const [text, setText] = useState("");
 const [mode, setMode] = useState<"reminder" | "note">("reminder");
 const inputRef = useRef<HTMLInputElement>(null);

 useEffect(() => {
 if (!open) return;
 setText("");
 setMode("reminder");
 const t = window.setTimeout(() => inputRef.current?.focus(), 30);
 const onKey = (e: KeyboardEvent) => {
 if (e.key === "Escape") onClose();
 };
 window.addEventListener("keydown", onKey);
 return () => {
 window.clearTimeout(t);
 window.removeEventListener("keydown", onKey);
 };
 }, [open, onClose]);

 // Prefix shortcuts: `!` forces a reminder, `#` forces a note.
 const effectiveMode = text.startsWith("!") ? "reminder" : text.startsWith("#") ? "note" : mode;
 const payload = text.replace(/^[!#]\s*/, "").trim();

 const submit = async () => {
 if (!payload) return;
 try {
 if (effectiveMode === "note") {
 const saved = await api.saveNote({ title: payload, body: "", course_id: null });
 api.logEvent("note_write", payload, null);
 window.dispatchEvent(new CustomEvent("eu:library-changed"));
 toast(get("capture.noteSaved", "Note créée"), "success");
 onClose();
 if (saved?.id) tabs.open({ kind: "note", title: payload, params: { noteId: saved.id } });
 } else {
 const created = await api.createReminder(payload, null);
 if (!created?.id) throw new Error("no id");
 window.dispatchEvent(new CustomEvent("eu:reminders-changed"));
 toast(get("capture.reminderSaved", "Rappel ajouté"), "success");
 onClose();
 }
 } catch {
 toast(get("messages.genericError", "Erreur"), "error");
 }
 };

 return (
 <AnimatePresence>
 {open && (
 <div className="fixed inset-0 z-palette flex items-start justify-center pt-[18vh] px-6">
 <motion.div
 className="eu-scrim"
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 transition={{ duration: 0.1 }}
 onClick={onClose}
 />
 <motion.div
 role="dialog"
 aria-modal="true"
 aria-label={get("capture.title", "Capture rapide")}
 className="relative w-full max-w-lg eu-panel shadow-pop overflow-hidden"
 initial={{ opacity: 0, scale: 0.97, y: -6 }}
 animate={{ opacity: 1, scale: 1, y: 0 }}
 exit={{ opacity: 0, scale: 0.985 }}
 transition={{ type: "spring", stiffness: 500, damping: 30 }}
 >
 <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-line">
 <PlusIcon className="w-4 h-4 text-ink-faint shrink-0" />
 <input
 ref={inputRef}
 value={text}
 onChange={(e) => setText(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === "Enter") {
 e.preventDefault();
 void submit();
 }
 }}
 placeholder={get("capture.placeholder", "Noter quelque chose… (! rappel · # note)")}
 className="flex-1 bg-transparent outline-none eu-t-body text-ink placeholder:text-ink-faint"
 />
 </div>
 <div className="flex items-center gap-2 px-3.5 py-2.5">
 <Segmented
 value={effectiveMode}
 onChange={(v) => {
 setMode(v);
 setText((t) => t.replace(/^[!#]\s*/, ""));
 }}
 label={get("capture.target", "Enregistrer comme")}
 options={[
 { value: "reminder", label: get("capture.asReminder", "Rappel") },
 { value: "note", label: get("capture.asNote", "Note") },
 ]}
 />
 <span className="flex-1" />
 <span className="eu-t-meta hidden sm:flex items-center gap-1.5">
 <span className="eu-kbd">↵</span>
 {get("capture.save", "enregistrer")}
 </span>
 <button type="button" onClick={onClose} className="eu-btn-quiet eu-btn-sm">
 {get("common.cancel", "Annuler")}
 </button>
 <button
 type="button"
 onClick={() => void submit()}
 disabled={!payload}
 className="eu-btn-primary eu-btn-sm"
 >
 {get("common.add", "Ajouter")}
 </button>
 </div>
 </motion.div>
 </div>
 )}
 </AnimatePresence>
 );
}

function Shell() {
 const [info, setInfo] = useState<AppInfo | null>(null);
 const [palette, setPalette] = useState(false);
 const [help, setHelp] = useState(false);
 const [dragging, setDragging] = useState(false);
 const [availableUpdate, setAvailableUpdate] = useState<AppUpdateInfo | null>(null);
 const tabs = useTabs();
 const toast = useToast();
 const confirm = useConfirm();

 const [captureOpen, setCaptureOpen] = useState(false);
 const { projection, toggleProjection } = useAppearance();

 const [timerSec, setTimerSec] = useState<number | null>(null);
 const [timerRunning, setTimerRunning] = useState(false);
 const timerRunningRef = useRef(false);
 useEffect(() => { timerRunningRef.current = timerRunning; }, [timerRunning]);

 const timer = useMemo<TimerApi>(
 () => ({
 sec: timerSec,
 running: timerRunning,
 start: (minutes: number) => {
 setTimerSec(Math.max(1, Math.round(minutes * 60)));
 setTimerRunning(true);
 },
 toggle: () => {
 setTimerSec((s) => {
 if (s == null) return s;
 if (s <= 0) {
 setTimerRunning(false);
 return null;
 }
 setTimerRunning((r) => !r);
 return s;
 });
 },
 add: (minutes: number) => {
 setTimerSec((s) => (s == null ? s : Math.max(0, s) + minutes * 60));
 setTimerRunning(true);
 },
 stop: () => {
 setTimerSec(null);
 setTimerRunning(false);
 },
 }),
 [timerSec, timerRunning]
 );

 const activityContextRef = useRef<{ area: string; courseId: number | null }>({ area: "dashboard", courseId: null });
 const [appFocused, setAppFocused] = useState(true);
 const appFocusedRef = useRef(appFocused);
 useEffect(() => {
 appFocusedRef.current = appFocused;
 }, [appFocused]);

 useEffect(() => {
 const tab = tabs.active;
 activityContextRef.current = {
 area: tab?.kind ?? "dashboard",
 courseId: typeof tab?.params?.courseId === "number" ? tab.params.courseId : null,
 };
 }, [tabs.activeId, tabs.active?.kind, tabs.active?.params?.courseId]);

 const handleHelp = useCallback(() => setHelp(true), []);
 const handleSearch = useCallback(() => setPalette(true), []);

 const requestClose = useCallback(async (id: string) => {
 if (tabs.isDirty(id)) {
 const choice = await confirm.dirty({
 title: get("confirm.unsavedTitle", "Modifications non enregistrées"),
 message: get("confirm.unsavedMessage", "Enregistrer avant de fermer cet onglet ?"),
 });
 if (choice === "cancel") return;
 if (choice === "save") {
 try {
 await tabs.flush(id);
 } catch {
 toast(get("messages.genericError", "Erreur"), "error");
 return;
 }
 }
 }
 tabs.close(id);
 }, [tabs, confirm, toast]);

 useEffect(() => {
 api.appInfo().then(setInfo).catch(() => {});
 }, []);

 useEffect(() => {
 const onStart = (e: Event) => {
 const minutes = Number((e as CustomEvent).detail?.minutes) || 5;
 setTimerSec(Math.max(1, Math.round(minutes * 60)));
 setTimerRunning(true);
 };
 window.addEventListener("eu:timer-start", onStart as EventListener);
 return () => window.removeEventListener("eu:timer-start", onStart as EventListener);
 }, []);

 // « Fin de cours annoncée »: one discreet notice a few minutes before the bell,
 // driven by the schedule. Off / silent / with a chime, from Réglages.
 useEffect(() => {
 if (!isTauri()) return;
 let cancelled = false;
 let mode: "off" | "toast" | "sound" = "toast";
 let lead = 5;
 const notified = new Set<string>();

 const readPrefs = async () => {
 const [m, l] = await Promise.all([
 api.getSetting("class_end_notice").catch(() => null),
 api.getSetting("class_end_lead").catch(() => null),
 ]);
 if (cancelled) return;
 if (m === "off" || m === "toast" || m === "sound") mode = m;
 const n = l ? parseInt(l, 10) : NaN;
 if (!Number.isNaN(n) && n >= 1 && n <= 15) lead = n;
 };
 void readPrefs();
 const onPrefs = () => void readPrefs();
 window.addEventListener("eu:settings-changed", onPrefs);

 const tick = async () => {
 if (mode === "off") return;
 try {
 const classes = await api.getTodayClasses();
 const now = new Date();
 for (const c of classes) {
 const left = minutesRemaining(c, now);
 if (left == null || left > lead || left < 1) continue;
 const key = `${c.id}:${c.end_time}`;
 if (notified.has(key)) continue;
 notified.add(key);
 toast(
 fmt(get("classEnd.notice", "{subject} : fin dans {minutes} min"), {
 subject: c.subject,
 minutes: left,
 }),
 "info"
 );
 if (mode === "sound") chime(0.05);
 }
 } catch {
 // offline / no schedule: nothing to announce
 }
 };
 const interval = window.setInterval(tick, 60_000);
 const seed = window.setTimeout(tick, 8_000);
 return () => {
 cancelled = true;
 window.removeEventListener("eu:settings-changed", onPrefs);
 window.clearInterval(interval);
 window.clearTimeout(seed);
 };
 }, [toast]);

 useEffect(() => {
 if (!timerRunning) return;
 const id = window.setInterval(() => {
 setTimerSec((s) => (s == null || s <= 0 ? s : s - 1));
 }, 1000);
 return () => clearInterval(id);
 }, [timerRunning]);

 useEffect(() => {
 if (timerSec !== 0 || !timerRunning) return;
 setTimerRunning(false);
 chime();
 toast(get("timer.done", "Minuteur terminé"), "success");
 }, [timerSec, timerRunning, toast]);

 useEffect(() => {
 const onAvailable = (e: Event) => {
 const detail = (e as CustomEvent<AppUpdateInfo>).detail;
 if (!detail?.version) return;
 if (wasUpdateDismissed(detail.version)) return;
 setAvailableUpdate(detail);
 };
 window.addEventListener("eu:update-available", onAvailable);
 return () => window.removeEventListener("eu:update-available", onAvailable);
 }, []);

 useEffect(() => {
 if (!isTauri()) return;
 let cancelled = false;
 const timer = window.setTimeout(async () => {
 try {
 const update = await checkForAppUpdate();
 if (cancelled || !update) return;
 if (wasUpdateDismissed(update.version)) return;
 window.dispatchEvent(new CustomEvent("eu:update-available", { detail: update }));
 } catch {
 // Draft-only GitHub releases, offline, etc. Stay quiet.
 }
 }, 4000);
 return () => {
 cancelled = true;
 window.clearTimeout(timer);
 };
 }, []);

 useEffect(() => {
 let unlisten: (() => void) | undefined;
 let active = true;
 import("@tauri-apps/api/webview")
 .then(({ getCurrentWebview }) =>
 getCurrentWebview().onDragDropEvent(async (event) => {
 const p = event.payload as { type: string; paths?: string[] };
 if (p.type === "enter" || p.type === "over") {
 setDragging(true);
 } else if (p.type === "drop") {
 setDragging(false);
 const paths = p.paths ?? [];
 if (!paths.length) return;
 try {
 toast(get("messages.importing", "Import…"), "info");
 const added = await api.importPaths(paths, null);
 await afterImport(added, toast);
 } catch {
 toast(get("messages.genericError", "Erreur"), "error");
 }
 } else {
 setDragging(false);
 }
 })
 )
 .then((u) => {
 if (active) unlisten = u;
 else u();
 })
 .catch(() => {});
 return () => {
 active = false;
 unlisten?.();
 };
 }, [toast]);

 useEffect(() => {
 if (!isTauri()) return;
 const tick = () => {
 if (!appFocusedRef.current) return;
 if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
 const ctx = activityContextRef.current;
 api.logEvent("active_tick", ctx.area, ctx.courseId).catch(() => {});
 };
 const seed = window.setTimeout(tick, 2500);
 const interval = window.setInterval(tick, 60_000);
 return () => {
 window.clearTimeout(seed);
 window.clearInterval(interval);
 };
 }, []);

 useEffect(() => {
 if (!isTauri()) return;
 let unlistenFocus: (() => void) | undefined;
 let unlistenBlur: (() => void) | undefined;
 (async () => {
 try {
 const { getCurrentWindow } = await import("@tauri-apps/api/window");
 const win = getCurrentWindow();
 unlistenFocus = await win.listen("tauri://focus", () => {
 setAppFocused(true);
 setTimeout(() => {
 if (document.visibilityState === "visible") {
 const ctx = activityContextRef.current;
 api.logEvent("active_tick", ctx.area, ctx.courseId).catch(() => {});
 }
 }, 1500);
 });
 unlistenBlur = await win.listen("tauri://blur", () => setAppFocused(false));
 } catch {
 // ignore
 }
 })();
 return () => {
 unlistenFocus?.();
 unlistenBlur?.();
 };
 }, []);

 useEffect(() => {
 const onKey = (e: KeyboardEvent) => {
 const mod = isMac ? e.metaKey : e.ctrlKey;
 // Save the active editor. The tab system already knows how: notes, the
 // whiteboard and the Python editor each register a flush function, which
 // is what the « unsaved changes » prompt uses when closing a tab.
 if (mod && !e.shiftKey && e.key.toLowerCase() === "s") {
 e.preventDefault();
 const id = tabs.activeId;
 if (!id) return;
 if (!tabs.isDirty(id)) return;
 void tabs
 .flush(id)
 .then(() => toast(get("messages.saved", "Enregistré"), "success"))
 .catch(() => toast(get("messages.genericError", "Erreur"), "error"));
 } else if (mod && e.shiftKey && e.key.toLowerCase() === "k") {
 e.preventDefault();
 setCaptureOpen((c) => !c);
 } else if (mod && e.shiftKey && e.key.toLowerCase() === "p") {
 e.preventDefault();
 toggleProjection();
 } else if (mod && e.key.toLowerCase() === "k") {
 e.preventDefault();
 setPalette((p) => !p);
 } else if (mod && e.key.toLowerCase() === "t") {
 e.preventDefault();
 if (tabs.active?.kind !== "dashboard") {
 tabs.open({ kind: "dashboard" });
 }
 } else if (mod && e.key.toLowerCase() === "w") {
 e.preventDefault();
 if (tabs.activeId) void requestClose(tabs.activeId);
 } else if (mod && e.key.toLowerCase() === "d") {
 e.preventDefault();
 if (tabs.active?.kind !== "dashboard") {
 tabs.open({ kind: "dashboard" });
 }
 } else if (mod && e.key.toLowerCase() === "f") {
 e.preventDefault();
 tabs.open({ kind: "documents" });
 } else if (mod && e.key.toLowerCase() === "b") {
 e.preventDefault();
 tabs.open({ kind: "whiteboard", title: get("app.tabWhiteboard", "Tableau"), params: { isNew: true } });
 } else if (mod && e.key.toLowerCase() === "n") {
 e.preventDefault();
 tabs.open({ kind: "note", title: get("common.newNote", "Nouvelle note"), params: { isNew: true } });
 } else if (mod && e.key === ",") {
 e.preventDefault();
 tabs.open({ kind: "settings" });
 } else if (mod && e.key === "/") {
 e.preventDefault();
 setHelp((h) => !h);
 } else if (e.key === "Escape" && projection) {
 // Escape is the way out of projection mode; overlays handle their own.
 if (!palette && !help && !captureOpen) {
 e.preventDefault();
 toggleProjection();
 }
 } else if (e.ctrlKey && (e.key === "Tab" || e.code === "Tab")) {
 e.preventDefault();
 e.stopPropagation();
 if (e.shiftKey) tabs.prev();
 else tabs.next();
 } else if (mod && /^[1-9]$/.test(e.key)) {
 e.preventDefault();
 tabs.focusIndex(Number(e.key) - 1);
 }
 };
 window.addEventListener("keydown", onKey, true);
 return () => window.removeEventListener("keydown", onKey, true);
 }, [tabs, requestClose, toast, toggleProjection, projection, palette, help, captureOpen]);

 return (
 <div className="flex h-full w-full overflow-hidden bg-canvas eu-root">
 {/* Projection keeps a slim quit rail; the tab strip and status bar hide. */}
 {projection ? <ProjectionRail /> : <Sidebar info={info} />}
 <main className="flex-1 h-full flex flex-col min-w-0 bg-canvas eu-main">
 {!projection && (
 <TopBar
 onHelp={handleHelp}
 onSearch={handleSearch}
 onCloseTab={(id) => {
 void requestClose(id);
 }}
 timer={timer}
 />
 )}
 <MainContent info={info} />
 {!projection && <StatusBar info={info} timer={timer} />}
 </main>

 {projection && <TimerStage timer={timer} />}

 <CommandPalette open={palette} onClose={() => setPalette(false)} onHelp={handleHelp} />
 <QuickCapture open={captureOpen} onClose={() => setCaptureOpen(false)} />
 <ShortcutsHelp open={help} onClose={() => setHelp(false)} />
 <UpdateAvailablePopup update={availableUpdate} onDismiss={() => setAvailableUpdate(null)} />
 {dragging && (
 <div className="fixed inset-0 z-[80] grid place-items-center bg-accent/10 pointer-events-none">
 <div className="eu-panel shadow-pop px-7 py-5 border-dashed border-accent flex items-center gap-3.5">
 <DocIcon className="w-7 h-7 text-accent shrink-0" />
 <div>
 <p className="eu-t-section text-ink">{get("dragDrop.drop", "Déposez vos fichiers")}</p>
 <p className="eu-t-meta mt-0.5">
 {get("dragDrop.hint", "Ils rejoindront votre bibliothèque.")}
 </p>
 </div>
 </div>
 </div>
 )}
 </div>
 );
}

export default function App() {
 return (
 <ToastProvider>
 <ConfirmProvider>
 <TabsProvider>
 <Shell />
 </TabsProvider>
 </ConfirmProvider>
 </ToastProvider>
 );
}
