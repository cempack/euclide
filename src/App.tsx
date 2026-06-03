import { useEffect, useState, useRef, useCallback, lazy, Suspense, memo } from "react";
import { api, type AppInfo, isTauri } from "./lib/api";
import { get } from "./lib/i18n";
import { isMac } from "./lib/shortcuts";
import { TabsProvider, useTabs, type TabKind } from "./lib/tabs";
import { ToastProvider, useToast, Loading, COURSE_ICONS } from "./components/ui";
import CommandPalette from "./components/CommandPalette";
import ShortcutsHelp from "./components/ShortcutsHelp";
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
} from "./components/icons";
import Dashboard from "./screens/Dashboard";
import Courses from "./screens/Courses";
const CourseDetail = lazy(() => import("./screens/CourseDetail"));
import Documents from "./screens/Documents";
import Tools from "./screens/Tools";
const Python = lazy(() => import("./screens/Python"));
import Settings from "./screens/Settings";
import Reminders from "./screens/Reminders";
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

const Sidebar = memo(function Sidebar() {

  const tabs = useTabs();
  const isActive = (kind: TabKind) => tabs.active?.kind === kind;

  return (
    <aside className={`eu-sidebar w-64 shrink-0 h-full flex flex-col px-lg pb-4 bg-surface border-r border-hairline font-mono eu-drag pt-10`}>
      <div className="flex items-center gap-3 px-3 mb-10">
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
            className={`flex items-center px-4 py-2 my-0.5 transition-all text-left border-l-[3px] eu-no-drag ${
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

const TopBar = memo(function TopBar({ onHelp, onSearch }: { onHelp: () => void; onSearch: () => void }) {
  const tabs = useTabs();

  // Cache for per-course tab icons (key + color) so course tabs show the user-chosen SVG icon instead of generic BookIcon
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
  }, [tabs.tabs.length]); // refresh icon map when course tabs change (listCourses is cached)

  return (
    <div
      className="eu-topbar h-14 shrink-0 flex items-center eu-drag bg-transparent font-mono overflow-hidden border-b border-hairline"
      style={{ paddingLeft: 12 }}
    >
      {/* Tab strip group (content-sized when few tabs; shrinks + scrolls internally when many).
          The + lives right after the scroller (inside the group, before the big spacer) so it is
          always visible at the end of the tabs area — never scrolls away and is easy to spot. */}
      <div className="h-full flex items-stretch min-w-0 eu-no-drag">
        <div className="h-full flex items-stretch gap-0.5 overflow-x-auto text-xs eu-no-drag min-w-0 pr-1">
          {tabs.tabs.map((tab) => {
            const active = tab.id === tabs.activeId;
            return (
              <div
                key={tab.id}
                onClick={() => tabs.setActive(tab.id)}
                className={`group h-full flex items-center gap-1.5 px-4 cursor-default select-none whitespace-nowrap rounded-t-sm transition-all border-b-2 ${active
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
                    return TAB_ICONS[tab.kind];
                  })()}
                </span>
                <span className="truncate max-w-[140px] tracking-[-0.1px]">{tab.title}</span>
                {tabs.tabs.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); tabs.close(tab.id); }}
                    className={`shrink-0 w-4 h-4 ml-0.5 -mr-0.5 flex items-center justify-center rounded-sm transition-all ${active ? "opacity-40" : "opacity-0"} group-hover:opacity-60 hover:opacity-100 hover:bg-red-100 hover:text-red-600`}
                  >
                    <XIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {/* New tab "+" — placed immediately after the tabs scroller (with small gap) so it is always
            visible and clearly associated with the tab strip, even when the tab list scrolls. */}
        <button
          onClick={() => {
            // Nouvel onglet (dashboard). Matches the ⌘T shortcut and the original
            // "new tab" affordance. Since dashboard is a singleton, this just
            // activates it (or creates if somehow closed). The tabs provider
            // handles maxTabs eviction for non-singletons.
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

      {/* Spacer so left (logo + tabs) hugs left and right tools hug right; avoids sparse empty inside tab strip when few tabs open */}
      <div className="flex-1" />

      {/* Right-side actions (search + icon tools). Cleaner, fewer borders on icon buttons. */}
      <div className="flex items-center gap-1.5 shrink-0 pl-2 pr-2 eu-no-drag h-full">
        <button
          onClick={onSearch}
          title={`Rechercher (${isMac ? "⌘" : "Ctrl"}K)`}
          className="flex items-center gap-1.5 pl-3 pr-2.5 h-8 text-xs rounded-full border border-hairline bg-surface-soft/10 hover:bg-surface-soft hover:border-hairline text-ash hover:text-primary transition-all self-center"
        >
          <SearchIcon className="w-3.5 h-3.5 opacity-80" />
          <span className="hidden sm:inline tracking-[-0.1px]">{get("common.search", "Rechercher")}</span>
          <span className="inline-flex items-center justify-center px-1 py-px rounded border border-hairline/50 bg-surface text-[8px] font-mono text-ash/70 tabular-nums">{isMac ? "⌘K" : "Ctrl+K"}</span>
        </button>

        {/* Icon cluster: help + account. Borderless for cleaner titlebar look. */}
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

function WindowControls() {
  const [win, setWin] = useState<any>(null);

  useEffect(() => {
    if (!isTauri()) return;
    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => setWin(getCurrentWindow()))
      .catch(() => {});
  }, []);

  if (!win) return null;

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    win.close();
  };
  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    win.minimize();
  };
  const handleMaximize = (e: React.MouseEvent) => {
    e.stopPropagation();
    win.toggleMaximize();
  };

  return (
    <div
      className="fixed top-2.5 left-3 z-[999] flex items-center gap-1.5 eu-no-drag"
      style={{ WebkitAppRegion: "no-drag" } as any}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Close (red) */}
      <button
        onClick={handleClose}
        className="group w-3.5 h-3.5 rounded-full bg-[#ff5f57] hover:bg-[#ff3b30] flex items-center justify-center transition-all shadow-sm"
        title="Close"
      >
        <XIcon className="w-2 h-2 text-[#5a0000] opacity-0 group-hover:opacity-90 transition-opacity" />
      </button>
      {/* Minimize (yellow) */}
      <button
        onClick={handleMinimize}
        className="group w-3.5 h-3.5 rounded-full bg-[#ffbd2e] hover:bg-[#ff9500] flex items-center justify-center transition-all shadow-sm"
        title="Minimize"
      >
        <span className="block w-[9px] h-px bg-[#5a3a00] opacity-0 group-hover:opacity-90 transition-opacity" />
      </button>
      {/* Maximize (green) */}
      <button
        onClick={handleMaximize}
        className="group w-3.5 h-3.5 rounded-full bg-[#28c840] hover:bg-[#1aab2e] flex items-center justify-center transition-all shadow-sm"
        title="Maximize / Restore"
      >
        <span className="block w-[7px] h-[7px] border border-[#0a4a12] opacity-0 group-hover:opacity-90 transition-opacity" />
      </button>
    </div>
  );
}

const MainContent = memo(function MainContent({ info, activeId }: { info: AppInfo | null; activeId: string | null }) {
  return (
    <div
      key={activeId}
      className="flex-1 min-h-0 bg-[rgb(var(--eu-bg))] animate-fade-in eu-drag"
    >
      <TabContent info={info} />
    </div>
  );
});

function TabContent({ info }: { info: AppInfo | null }) {
  const tabs = useTabs();
  const tab = tabs.active;
  if (!tab) return null;

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
      return <Scroll><Documents /></Scroll>;
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
    case "whiteboard":
      return (
        <Suspense fallback={<Loading label={get("common.loading", "Chargement…")} />}>
          <Whiteboard tabId={tab.id} fileId={tab.params.fileId} />
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
          <NoteEditor noteId={tab.params.noteId} isNew={!!tab.params.isNew} initialCourseId={tab.params.courseId} />
        </Suspense>
      );
    default:
      return null;
  }
}

function Scroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto eu-drag">
      <div className="mx-auto max-w-[960px] px-6 lg:px-8 py-6 font-mono">{children}</div>
    </div>
  );
}

function Shell() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [dragging, setDragging] = useState(false);
  const tabs = useTabs();
  const toast = useToast();

  // For activity time tracking (Bilan / Recap).
  const activityContextRef = useRef<{ area: string; courseId: number | null }>({ area: "dashboard", courseId: null });
  const [appFocused, setAppFocused] = useState(true);
  const appFocusedRef = useRef(appFocused);
  useEffect(() => {
    appFocusedRef.current = appFocused;
  }, [appFocused]);

  // macOS vibrancy (frosted sidebar/topbar)
  useEffect(() => {
    // Enable frosted glass / transparency styles on all desktop platforms.
    // The system vibrancy (mac) or mica/acrylic (win) will show through the alpha bgs.
    // On linux it provides subtle transparency for a modern look.
    document.documentElement.classList.add("has-vibrancy");
  }, []);

  const handleHelp = useCallback(() => setHelp(true), []);
  const handleSearch = useCallback(() => setPalette(true), []);

  useEffect(() => {
    api.appInfo().then(setInfo).catch(() => {});
  }, []);

  // Global drag-and-drop file import into the documents library.
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
              const added = await api.importPaths(paths, null);
              if (added.length) {
                added.forEach((f) => api.logEvent("file_import", f.name, null));
                await api.reindexDocuments();
                window.dispatchEvent(new CustomEvent("eu:library-changed"));
                toast(get("messages.imported", "{count} importé(s)").replace("{count}", String(added.length)), "success");
              }
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

  // Window focus/blur tracking (Tauri) + seeds to ensure time recording starts/credits immediately on use.
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
          // seed a tick shortly after gaining focus
          setTimeout(() => {
            if (document.visibilityState === "visible") {
              const ctx = activityContextRef.current;
              api.logEvent("active_tick", ctx.area, ctx.courseId).catch(() => {});
            }
          }, 1500);
        });
        unlistenBlur = await win.listen("tauri://blur", () => setAppFocused(false));
      } catch {
        // ignore in non-tauri or error
      }
    })();
    return () => {
      unlistenFocus?.();
      unlistenBlur?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Cross-platform modifier: Cmd on macOS, Ctrl on Windows/Linux.
      // Matches the dynamic labels in SHORTCUTS (MOD) and the help UI.
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      } else if (mod && e.key.toLowerCase() === "t") {
        e.preventDefault();
        // Nouvel onglet (matches the topbar + button and the shortcuts doc)
        if (tabs.active?.kind !== "dashboard") {
          tabs.open({ kind: "dashboard" });
        }
      } else if (mod && e.key.toLowerCase() === "w") {
        e.preventDefault();
        if (tabs.activeId) tabs.close(tabs.activeId);
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (tabs.active?.kind !== "dashboard") {
          tabs.open({ kind: "dashboard" });
        }
      } else if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        // Rechercher un document (open the documents library / search view)
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
      } else if (e.ctrlKey && e.key === "Tab") {
        // "Onglet suivant" is always Ctrl+Tab (even on macOS, per the shortcuts doc),
        // to avoid conflicting with OS-level Cmd+Tab (app switcher).
        // Works on Linux/Windows with Ctrl+Tab too.
        e.preventDefault();
        tabs.next();
      } else if (mod && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        tabs.focusIndex(Number(e.key) - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tabs]);

  return (
    <div className="flex h-full w-full overflow-hidden bg-[rgb(var(--eu-bg))] eu-drag eu-root">
      <WindowControls />
      <Sidebar />
      <main className="flex-1 h-full flex flex-col min-w-0 bg-[rgb(var(--eu-bg))] eu-main">
        <TopBar onHelp={handleHelp} onSearch={handleSearch} />
        <MainContent info={info} activeId={tabs.activeId} />
      </main>
      <CommandPalette open={palette} onClose={() => setPalette(false)} onHelp={handleHelp} />
      <ShortcutsHelp open={help} onClose={() => setHelp(false)} />
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
      <TabsProvider>
        <Shell />
      </TabsProvider>
    </ToastProvider>
  );
}
