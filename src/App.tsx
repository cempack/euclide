import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api, type AppInfo } from "./lib/api";
import { notifyPendingReminders } from "./lib/notify";
import { t } from "./lib/i18n";
import { isMac } from "./lib/shortcuts";
import { ThemeProvider } from "./lib/theme";
import { TabsProvider, useTabs, type TabKind } from "./lib/tabs";
import { ToastProvider, useToast } from "./components/ui";
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
  SparkleIcon,
  ToolIcon,
  XIcon,
} from "./components/icons";
import Dashboard from "./screens/Dashboard";
import Courses from "./screens/Courses";
import CourseDetail from "./screens/CourseDetail";
import Documents from "./screens/Documents";
import Tools from "./screens/Tools";
import Recap from "./screens/Recap";
import Settings from "./screens/Settings";
import Whiteboard from "./components/Whiteboard";
import PdfViewer from "./components/PdfViewer";

const TAB_ICONS: Partial<Record<TabKind, React.ReactNode>> = {
  dashboard: <HomeIcon className="w-4 h-4" />,
  courses: <BookIcon className="w-4 h-4" />,
  course: <BookIcon className="w-4 h-4" />,
  documents: <DocIcon className="w-4 h-4" />,
  tools: <ToolIcon className="w-4 h-4" />,
  recap: <SparkleIcon className="w-4 h-4" />,
  settings: <GearIcon className="w-4 h-4" />,
  whiteboard: <PenIcon className="w-4 h-4" />,
  pdf: <DocIcon className="w-4 h-4" />,
};

const NAV: { kind: TabKind; label: string; icon: React.ReactNode }[] = [
  { kind: "dashboard", label: t.nav.dashboard, icon: <HomeIcon className="w-[18px] h-[18px]" /> },
  { kind: "courses", label: t.nav.courses, icon: <BookIcon className="w-[18px] h-[18px]" /> },
  { kind: "documents", label: t.nav.documents, icon: <DocIcon className="w-[18px] h-[18px]" /> },
  { kind: "tools", label: t.nav.tools, icon: <ToolIcon className="w-[18px] h-[18px]" /> },
  { kind: "recap", label: t.nav.recap, icon: <SparkleIcon className="w-[18px] h-[18px]" /> },
];

function Sidebar({ info }: { info: AppInfo | null }) {

  const tabs = useTabs();
  const isActive = (kind: TabKind) => tabs.active?.kind === kind;

  return (
    <aside className="eu-sidebar w-[230px] shrink-0 h-full flex flex-col px-3 pt-10 pb-4 bg-[#fff8e0] border-r border-[#e6d5a8]">
      <div className="flex items-center gap-3 px-3 mb-6 eu-no-drag">
        <img src="/euclide-logo.png" alt="Euclide" className="w-10 h-10 rounded-2xl shadow-soft" />
        <div className="leading-tight">
          <p className="font-semibold tracking-tight text-[#1f1f1f]">{t.appName}</p>
          <p className="text-[11px] font-semibold uppercase tracking-[1px] text-[#8a8a8a]">bureau d'enseignement</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((item) => (
          <button
            key={item.kind}
            onClick={() => tabs.open({ kind: item.kind })}
            className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left ${
              isActive(item.kind)
                ? "text-[#fa520f]"
                : "text-[#6a6a6a] hover:text-[#1f1f1f] hover:bg-[#fffaeb]"
            }`}
          >
            {isActive(item.kind) && (
              <motion.div
                layoutId="nav-pill"
                className="absolute inset-0 rounded-lg bg-white border border-[#e6d5a8] shadow-soft"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative z-10">{item.icon}</span>
            <span className="relative z-10">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="mt-5 px-1">
        <p className="px-2 mb-2 eu-micro-uppercase">
          Acces rapide
        </p>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => tabs.open({ kind: "whiteboard", title: "Nouveau tableau", params: { isNew: true } })}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[#6a6a6a] hover:text-[#1f1f1f] hover:bg-[#fffaeb] transition-colors"
          >
            <PenIcon className="w-[18px] h-[18px]" /> Tableau blanc
          </button>
          <button
            onClick={() => tabs.open({ kind: "documents" })}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[#6a6a6a] hover:text-[#1f1f1f] hover:bg-[#fffaeb] transition-colors"
          >
            <SearchIcon className="w-[18px] h-[18px]" /> Rechercher
          </button>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-1 px-1">
        <button onClick={() => tabs.open({ kind: "settings" })} className="eu-btn-ghost justify-start text-[#6a6a6a]">
          <GearIcon className="w-[18px] h-[18px]" /> {t.nav.settings}
        </button>
        <p className="px-3 pt-1 text-[10.5px] leading-relaxed text-[#a8a8a8]">{t.madeBy}</p>
        {info && <p className="px-3 text-[10px] text-[#c7c7c7]">v{info.version}</p>}
      </div>
      <div className="eu-sunset-stripe" />
    </aside>
  );
}

function TopBar({ onHelp, onSearch }: { onHelp: () => void; onSearch: () => void }) {
  const tabs = useTabs();
  return (
    <div
      className="eu-topbar h-12 shrink-0 flex items-stretch gap-1 px-3 border-b border-[#ededed] eu-drag overflow-x-auto"
      style={{ paddingLeft: isMac ? 80 : 12 }}
    >
      <div className="flex items-center gap-1 py-1.5 eu-no-drag min-w-0">
        {tabs.tabs.map((tab) => {
          const active = tab.id === tabs.activeId;
          return (
            <div
              key={tab.id}
              onClick={() => tabs.setActive(tab.id)}
              className={`group flex items-center gap-2 max-w-[180px] pl-3 pr-2 h-9 rounded-lg cursor-default transition-colors ${
                active ? "bg-[#fff8e0] text-[#fa520f]" : "text-[#6a6a6a] hover:bg-[#fffaeb]"
              }`}
            >
              <span className="shrink-0">{TAB_ICONS[tab.kind]}</span>
              <span className="text-[13px] font-medium truncate">{tab.title}</span>
              {tabs.tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    tabs.close(tab.id);
                  }}
                  className="shrink-0 w-5 h-5 grid place-items-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-[#ededed] transition-all"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={() => tabs.open({ kind: "dashboard" })}
          title="Nouvel onglet"
          className="shrink-0 w-9 h-9 grid place-items-center rounded-lg text-[#6a6a6a] hover:bg-[#fffaeb] hover:text-[#1f1f1f] transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1 eu-no-drag">
        <button
          onClick={onSearch}
          title={`Rechercher (${isMac ? "⌘" : "Ctrl"}K)`}
          className="flex items-center gap-2 h-9 pl-2.5 pr-3 rounded-lg text-[#6a6a6a] hover:bg-[#fffaeb] hover:text-[#1f1f1f] transition-colors"
        >
          <SearchIcon className="w-[18px] h-[18px]" />
          <span className="text-[12px] hidden sm:inline">Rechercher</span>
          <span className="eu-kbd hidden sm:inline-flex">{isMac ? "⌘" : "Ctrl"}K</span>
        </button>
        <button
          onClick={onHelp}
          title="Raccourcis clavier"
          className="w-9 h-9 grid place-items-center rounded-lg text-[#6a6a6a] hover:bg-[#fffaeb] hover:text-[#1f1f1f] transition-colors"
        >
          <HelpIcon className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  );
}

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
      return <Scroll><CourseDetail courseId={tab.params.courseId!} /></Scroll>;
    case "documents":
      return <Scroll><Documents /></Scroll>;
    case "tools":
      return <Scroll><Tools /></Scroll>;
    case "recap":
      return <Scroll><Recap /></Scroll>;
    case "settings":
      return <Scroll><Settings info={info} /></Scroll>;
    case "whiteboard":
      return <Whiteboard tabId={tab.id} fileId={tab.params.fileId} />;
    case "pdf":
      return <PdfViewer fileId={tab.params.fileId!} fileName={tab.params.fileName ?? tab.title} />;
    default:
      return null;
  }
}

function Scroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-8 py-7">{children}</div>
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

  useEffect(() => {
    api.appInfo().then(setInfo).catch(() => {});
    notifyPendingReminders();
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
                toast(`${added.length} fichier(s) importe(s)`, "success");
              }
            } catch {
              toast("Import impossible", "error");
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
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      } else if (mod && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setPalette(true);
      } else if (mod && e.key.toLowerCase() === "w") {
        e.preventDefault();
        if (tabs.activeId) tabs.close(tabs.activeId);
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        tabs.open({ kind: "dashboard" });
      } else if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        tabs.open({ kind: "whiteboard", title: "Nouveau tableau", params: { isNew: true } });
      } else if (mod && e.key === ",") {
        e.preventDefault();
        tabs.open({ kind: "settings" });
      } else if (mod && e.key === "/") {
        e.preventDefault();
        setHelp((h) => !h);
      } else if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        tabs.open({ kind: "documents" });
        setTimeout(() => window.dispatchEvent(new CustomEvent("eu:focus-search")), 60);
      } else if (e.ctrlKey && e.key === "Tab") {
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
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar info={info} />
      <main className="flex-1 h-full flex flex-col min-w-0">
        <TopBar onHelp={() => setHelp(true)} onSearch={() => setPalette(true)} />
        <div className="flex-1 min-h-0">
          <TabContent info={info} />
        </div>
      </main>
      <CommandPalette open={palette} onClose={() => setPalette(false)} onHelp={() => setHelp(true)} />
      <ShortcutsHelp open={help} onClose={() => setHelp(false)} />
      {dragging && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-[#fa520f]/10 backdrop-blur-sm pointer-events-none">
          <div className="eu-card px-8 py-6 border-2 border-dashed border-[#fa520f] text-center">
            <DocIcon className="w-10 h-10 mx-auto text-[#fa520f] mb-2" />
            <p className="font-semibold text-eu-text">Deposez vos fichiers</p>
            <p className="eu-sub">Ils rejoindront votre bibliotheque de documents.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <TabsProvider>
          <Shell />
        </TabsProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
