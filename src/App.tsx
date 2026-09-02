import { useEffect, useState, useRef, useCallback, lazy, Suspense, memo } from "react";
import { api, type AppInfo, type FileItem, isTauri } from "./lib/api";
import { get } from "./lib/i18n";
import { isMac } from "./lib/shortcuts";
import { checkForAppUpdate, wasUpdateDismissed, type AppUpdateInfo } from "./lib/updater";

import { TabsProvider, useTabs, type Tab, type TabKind } from "./lib/tabs";
import { ToastProvider, ConfirmProvider, useToast, useConfirm, Loading, COURSE_ICONS } from "./components/ui";
import CommandPalette from "./components/CommandPalette";
import ShortcutsHelp from "./components/ShortcutsHelp";
import { UpdateAvailablePopup } from "./components/UpdateAvailablePopup";
import {
 BookIcon,
 DocIcon,
 GearIcon,
 HelpIcon,
 HomeIcon,
 PenIcon,
 PlusIcon,
 SearchIcon,
 ToolIcon,
 UserIcon,
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

const NAV: { kind: TabKind; label: string; icon: React.ReactNode }[] = [
 { kind: "dashboard", label: get("nav.dashboard", "Tableau de bord"), icon: <HomeIcon className="w-[18px] h-[18px]" /> },
 { kind: "courses", label: get("nav.courses", "Cours"), icon: <BookIcon className="w-[18px] h-[18px]" /> },
 { kind: "documents", label: get("nav.documents", "Documents"), icon: <DocIcon className="w-[18px] h-[18px]" /> },
 { kind: "note", label: get("nav.notes", "Notes"), icon: <NoteIcon className="w-[18px] h-[18px]" /> },
 { kind: "whiteboard", label: get("nav.whiteboard", "Tableau blanc"), icon: <PenIcon className="w-[18px] h-[18px]" /> },
 { kind: "reminders", label: get("nav.reminders", "Rappels"), icon: <BellIcon className="w-[18px] h-[18px]" /> },
 { kind: "tools", label: get("nav.tools", "Outils"), icon: <ToolIcon className="w-[18px] h-[18px]" /> },
 { kind: "python", label: get("nav.python", "Python"), icon: <CodeIcon className="w-[18px] h-[18px]" /> },
 { kind: "settings", label: get("nav.settings", "Réglages"), icon: <GearIcon className="w-[18px] h-[18px]" /> },
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

async function afterImport(added: FileItem[], toast: (m: string, t?: "info" | "success" | "error") => void) {
 if (!added.length) return;
 added.forEach((f) => api.logEvent("file_import", f.name, null));
 toast(get("messages.indexing", "Indexation…"), "info");
 await api.indexImportedPdfs(added).catch(() => {});
 window.dispatchEvent(new CustomEvent("eu:library-changed"));
 toast(get("messages.imported", "{count} importé(s)").replace("{count}", String(added.length)), "success");
}

const Sidebar = memo(function Sidebar() {
 const tabs = useTabs();
 const isActive = (kind: TabKind) => navKindActive(kind, tabs.active?.kind);

 return (
 <aside className={`eu-sidebar w-64 shrink-0 h-full flex flex-col px-lg pb-4 bg-surface border-r border-hairline font-mono pt-10`}>
 <div className="flex items-center gap-3 px-3 mb-10 ">
 <img src="/euclide-logo.png" alt="Euclide" className="w-10 h-10 rounded-2xl object-contain" />
 <div className="leading-none">
 <h1 className="font-display-xl text-body-strong text-primary tracking-tight">EUCLIDE</h1>
 </div>
 </div>

 <nav className="flex-1 flex flex-col gap-1 text-sm font-body-strong">
 {NAV.map((item) => (
 <button
 key={item.kind}
 onClick={() => {
 if (item.kind === "whiteboard") {
 tabs.open({ kind: "whiteboard", title: get("app.tabWhiteboard", "Tableau"), params: { isNew: true } });
 } else if (item.kind === "note") {
 tabs.open({ kind: "note", title: get("common.newNote", "Nouvelle note"), params: { isNew: true } });
 } else {
 tabs.open({ kind: item.kind });
 }
 }}
 className={`flex items-center px-4 py-2 my-0.5 transition-all text-left border-l-[3px] ${
 isActive(item.kind)
 ? "text-white bg-primary-container border-tui-accent"
 : "text-mute hover:text-primary hover:bg-surface-soft border-transparent hover:border-hairline"
 }`}
 >
 <span className="mr-3 opacity-80">{item.icon}</span>
 <span>{item.label}</span>
 {(item.kind === "whiteboard" || item.kind === "note") && (
 <span className="ml-auto text-[10px] opacity-40 font-mono">+</span>
 )}
 </button>
 ))}
 </nav>
 </aside>
 );
});

function formatTimer(sec: number) {
 const m = Math.floor(Math.max(0, sec) / 60);
 const s = Math.max(0, sec) % 60;
 return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function beep() {
 try {
 const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
 const ctx = new Ctx();
 const osc = ctx.createOscillator();
 const g = ctx.createGain();
 osc.frequency.value = 880;
 osc.connect(g);
 g.connect(ctx.destination);
 g.gain.setValueAtTime(0.08, ctx.currentTime);
 osc.start();
 osc.stop(ctx.currentTime + 0.28);
 } catch {
 // ignore
 }
}

const TopBar = memo(function TopBar({
 onHelp,
 onSearch,
 onCloseTab,
 timerSec,
 timerRunning,
 onToggleTimer,
 onStopTimer,
}: {
 onHelp: () => void;
 onSearch: () => void;
 onCloseTab: (id: string) => void;
 timerSec: number | null;
 timerRunning: boolean;
 onToggleTimer: () => void;
 onStopTimer: () => void;
}) {
 const tabs = useTabs();

 const [courseIconMap, setCourseIconMap] = useState<Record<number, { key: string; color: string }>>({});

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
 if (typeof c.id === "number") {
 map[c.id] = { key: c.emoji || "book", color: c.color };
 }
 }
 setCourseIconMap(map);
 })
 .catch(() => {
 setCourseIconMap({});
 });
 }, [tabs.tabs.length]);

 return (
 <div
 className="eu-topbar h-14 shrink-0 flex items-center bg-transparent font-mono overflow-hidden border-b border-hairline"
 style={{ paddingLeft: 12 }}
 >
 <div className="h-full flex items-stretch min-w-0">
 <div className="h-full flex items-stretch gap-0.5 overflow-x-auto text-xs min-w-0 pr-1">
 {tabs.tabs.map((tab) => {
 const active = tab.id === tabs.activeId;
 const dirty = tabs.isDirty(tab.id);
 return (
 <button
 key={tab.id}
 type="button"
 onClick={() => tabs.setActive(tab.id)}
 className={`group h-full flex items-center gap-1.5 px-4 select-none whitespace-nowrap rounded-t-sm transition-all border-b-2 ${active
 ? "border-tui-accent text-primary bg-surface-soft/60 font-medium"
 : "border-transparent text-ash hover:text-primary hover:bg-surface-soft/40 hover:border-hairline/60"
 }`}
 title={tab.title}
 >
 <span className="shrink-0 opacity-75 text-sm">
 {(() => {
 if ((tab.kind === "course" || tab.kind === "class-content") && typeof tab.params?.courseId === "number") {
 const cid = tab.params.courseId;
 const info = courseIconMap[cid] || { key: "book", color: "#666" };
 const found = COURSE_ICONS.find((i) => i.key === info.key);
 const IconComp = found ? found.Icon : BookIcon;
 return <span style={{ color: info.color }}><IconComp className="w-4 h-4" strokeWidth={1.8} /></span>;
 }
 if (tab.kind === "pdf") {
 if (tab.params?.fileName) {
 const fn = tab.params.fileName.toLowerCase();
 if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(fn)) {
 return <ImageIcon className="w-4 h-4" />;
 }
 }
 return <DocIcon className="w-4 h-4" />;
 }
 if (tab.kind === "whiteboard") {
 return <PenIcon className="w-4 h-4" />;
 }
 if (tab.kind === "note") {
 return <NoteIcon className="w-4 h-4" />;
 }
 if (tab.kind === "documents") {
 return <FolderIcon className="w-4 h-4" />;
 }
 if (tab.kind === "recap") {
 return <SparkleIcon className="w-4 h-4" />;
 }
 return TAB_ICONS[tab.kind];
 })()}
 </span>
 <span className="truncate max-w-[140px] tracking-[-0.1px]">{tab.title}</span>
 {dirty && <span className="w-1.5 h-1.5 rounded-full bg-tui-accent shrink-0" title="Non enregistré" />}
 {tabs.tabs.length > 1 && (
 <span
 role="button"
 tabIndex={0}
 onClick={(e) => { e.stopPropagation(); onCloseTab(tab.id); }}
 onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onCloseTab(tab.id); } }}
 className={`shrink-0 w-4 h-4 ml-0.5 -mr-0.5 flex items-center justify-center rounded-sm transition-all ${active ? "opacity-40" : "opacity-0"} group-hover:opacity-60 hover:opacity-100 hover:bg-red-100 hover:text-red-600`}
 >
 <XIcon className="w-3 h-3" />
 </span>
 )}
 </button>
 );
 })}
 </div>
 <button
 onClick={() => {
 if (tabs.active?.kind !== "dashboard") {
 tabs.open({ kind: "dashboard" });
 }
 }}
 title={
 tabs.maxTabs > 0 && tabs.tabs.length >= tabs.maxTabs
 ? get("app.newTab", "Nouvel onglet") + " (remplace l'ancien)"
 : get("app.newTab", "Nouvel onglet")
 }
 className={`shrink-0 ml-1 w-7 h-7 grid place-items-center rounded-md border border-hairline/50 hover:border-hairline text-mute hover:text-primary hover:bg-surface-soft/70 active:bg-surface-soft transition-all self-center ${
 tabs.maxTabs > 0 && tabs.tabs.length >= tabs.maxTabs ? "opacity-40" : ""
 }`}
 >
 <PlusIcon className="w-4 h-4" strokeWidth={2.2} />
 </button>
 </div>

 <div className="flex-1" />

 <div className="flex items-center gap-1.5 shrink-0 pl-2 pr-2 h-full">
 {timerSec != null && (
 <div className="flex items-center gap-1 mr-1">
 <button
 onClick={onToggleTimer}
 className={`flex items-center gap-1.5 h-8 px-2.5 text-xs rounded border font-mono tabular-nums ${
 timerSec <= 0
 ? "border-tui-danger text-tui-danger bg-red-50"
 : timerRunning
 ? "border-tui-accent text-primary bg-surface-soft"
 : "border-hairline text-mute bg-surface-soft/40"
 }`}
 title={timerRunning ? "Pause" : "Reprendre"}
 >
 <ClockIcon className="w-3.5 h-3.5" />
 {timerSec <= 0 ? "00:00" : formatTimer(timerSec)}
 </button>
 <button
 onClick={onStopTimer}
 className="w-7 h-7 grid place-items-center rounded border border-hairline text-mute hover:text-primary"
 title="Arrêter le minuteur"
 >
 <XIcon className="w-3 h-3" />
 </button>
 </div>
 )}
 <button
 onClick={onSearch}
 title={`Rechercher (${isMac ? "⌘" : "Ctrl"}K)`}
 className="flex items-center gap-1.5 pl-3 pr-2.5 h-8 text-xs rounded-full border border-hairline bg-surface-soft/10 hover:bg-surface-soft hover:border-hairline text-ash hover:text-primary transition-all self-center"
 >
 <SearchIcon className="w-3.5 h-3.5 opacity-80" />
 <span className="hidden sm:inline tracking-[-0.1px]">{get("common.search", "Rechercher")}</span>
 <span className="inline-flex items-center justify-center px-1 py-px rounded border border-hairline/50 bg-surface text-[8px] font-mono text-ash/70 tabular-nums">{isMac ? "⌘K" : "Ctrl+K"}</span>
 </button>

 <div className="flex items-center gap-0.5 pl-1">
 <button
 onClick={onHelp}
 title={get("app.shortcutsTitle", "Raccourcis")}
 className="w-8 h-8 grid place-items-center rounded-lg text-ash hover:text-primary hover:bg-surface-soft transition-colors"
 >
 <HelpIcon className="w-4 h-4" />
 </button>
 <button
 onClick={() => tabs.open({ kind: "settings" })}
 className="w-8 h-8 grid place-items-center rounded-lg text-ash hover:text-primary hover:bg-surface-soft transition-colors"
 title={get("app.settingsTitle", "Réglages")}
 >
 <UserIcon className="w-4 h-4" />
 </button>
 </div>
 </div>
 </div>
 );
});

const MainContent = memo(function MainContent({ info }: { info: AppInfo | null }) {
 const tabs = useTabs();
 return (
 <div className="flex-1 min-h-0 relative bg-[rgb(var(--eu-bg))]">
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
 <TabPane info={info} tab={tab} visible={visible} />
 </div>
 );
 })}
 </div>
 );
});

function TabPane({ info, tab, visible }: { info: AppInfo | null; tab: Tab; visible: boolean }) {
 switch (tab.kind) {
 case "dashboard":
 return <Scroll><Dashboard info={info} /></Scroll>;
 case "courses":
 return <Scroll><Courses /></Scroll>;
 case "course":
 return (
 <Scroll>
 <Suspense fallback={<Loading label={get("common.loading", "Chargement…")} />}>
 <CourseDetail courseId={tab.params.courseId!} />
 </Suspense>
 </Scroll>
 );
 case "class-content":
 return (
 <Scroll>
 <Suspense fallback={<Loading label={get("classContent.loading", "Chargement…")} />}>
 <ClassContent
 courseId={tab.params.courseId!}
 className={tab.params.className || ""}
 matiere={tab.params.matiere || ""}
 />
 </Suspense>
 </Scroll>
 );
 case "documents":
 return <Scroll><Documents filterHint={tab.params.filter} /></Scroll>;
 case "tools":
 return <Scroll><Tools /></Scroll>;
 case "python":
 return (
 <Suspense fallback={<Loading label={get("common.loading", "Chargement…")} />}>
 <Python />
 </Suspense>
 );
 case "settings":
 return <Scroll><Settings info={info} /></Scroll>;
 case "reminders":
 return <Scroll><Reminders /></Scroll>;
 case "recap":
 return (
 <Scroll>
 <Suspense fallback={<Loading label={get("common.loading", "Chargement…")} />}>
 <Recap />
 </Suspense>
 </Scroll>
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

function Scroll({ children }: { children: React.ReactNode }) {
 return (
 <div className="h-full overflow-y-auto">
 <div className="mx-auto max-w-[960px] px-6 lg:px-8 py-6 font-mono">{children}</div>
 </div>
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

 const [timerSec, setTimerSec] = useState<number | null>(null);
 const [timerRunning, setTimerRunning] = useState(false);
 const timerRunningRef = useRef(false);
 useEffect(() => { timerRunningRef.current = timerRunning; }, [timerRunning]);

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
 setTimerSec(minutes * 60);
 setTimerRunning(true);
 };
 window.addEventListener("eu:timer-start", onStart as EventListener);
 return () => window.removeEventListener("eu:timer-start", onStart as EventListener);
 }, []);

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
 beep();
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
 if (mod && e.key.toLowerCase() === "k") {
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
 }, [tabs, requestClose]);

 return (
 <div className="flex h-full w-full overflow-hidden bg-[rgb(var(--eu-bg))] eu-root">
 <Sidebar />
 <main className="flex-1 h-full flex flex-col min-w-0 bg-[rgb(var(--eu-bg))] eu-main">
 <TopBar
 onHelp={handleHelp}
 onSearch={handleSearch}
 onCloseTab={(id) => { void requestClose(id); }}
 timerSec={timerSec}
 timerRunning={timerRunning}
 onToggleTimer={() => {
 if (timerSec == null) return;
 if (timerSec <= 0) {
 setTimerSec(null);
 setTimerRunning(false);
 return;
 }
 setTimerRunning((r) => !r);
 }}
 onStopTimer={() => { setTimerSec(null); setTimerRunning(false); }}
 />
 <MainContent info={info} />
 </main>
 <CommandPalette open={palette} onClose={() => setPalette(false)} onHelp={handleHelp} />
 <ShortcutsHelp open={help} onClose={() => setHelp(false)} />
 <UpdateAvailablePopup update={availableUpdate} onDismiss={() => setAvailableUpdate(null)} />
 {dragging && (
 <div className="fixed inset-0 z-[80] grid place-items-center bg-tui-accent/10 backdrop-blur-sm pointer-events-none">
 <div className="eu-card px-8 py-6 border-2 border-dashed border-tui-accent text-center">
 <DocIcon className="w-10 h-10 mx-auto text-tui-accent mb-2" />
 <p className="font-semibold text-eu-text">{get("dragDrop.drop", "Déposez vos fichiers")}</p>
 <p className="eu-sub">{get("dragDrop.hint", "Ils rejoindront votre bibliothèque.")}</p>
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
