import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type TabKind =
  | "dashboard"
  | "courses"
  | "course"
  | "documents"
  | "tools"
  | "recap"
  | "settings"
  | "whiteboard"
  | "pdf"
  | "help";

export interface TabParams {
  courseId?: number;
  fileId?: number;
  fileName?: string;
  url?: string;
  isNew?: boolean;
}

export interface Tab {
  id: string;
  kind: TabKind;
  title: string;
  params: TabParams;
}

export interface OpenSpec {
  kind: TabKind;
  title?: string;
  params?: TabParams;
  background?: boolean;
}

const SINGLETONS: TabKind[] = [
  "dashboard",
  "courses",
  "documents",
  "tools",
  "recap",
  "settings",
  "help",
];

const DEFAULT_TITLES: Record<TabKind, string> = {
  dashboard: "Tableau de bord",
  courses: "Cours",
  course: "Cours",
  documents: "Documents",
  tools: "Outils",
  recap: "Recap",
  settings: "Reglages",
  whiteboard: "Tableau blanc",
  pdf: "Document",
  help: "Raccourcis",
};

function keyOf(spec: OpenSpec): string {
  if (SINGLETONS.includes(spec.kind)) return spec.kind;
  const p = spec.params ?? {};
  if (spec.kind === "course") return `course:${p.courseId}`;
  if (spec.kind === "pdf") return `pdf:${p.fileId}`;
  if (spec.kind === "whiteboard")
    return p.fileId ? `whiteboard:${p.fileId}` : `whiteboard:new:${Math.random().toString(36).slice(2)}`;
  return `${spec.kind}:${Math.random().toString(36).slice(2)}`;
}

type TabsCtx = {
  tabs: Tab[];
  activeId: string | null;
  active: Tab | null;
  open: (spec: OpenSpec) => string;
  close: (id: string) => void;
  setActive: (id: string) => void;
  rename: (id: string, title: string) => void;
  next: () => void;
  prev: () => void;
  focusIndex: (i: number) => void;
};

const Ctx = createContext<TabsCtx | null>(null);
export const useTabs = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTabs hors TabsProvider");
  return c;
};

export function TabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: "dashboard", kind: "dashboard", title: DEFAULT_TITLES.dashboard, params: {} },
  ]);
  const [activeId, setActiveId] = useState<string>("dashboard");

  const open = useCallback((spec: OpenSpec): string => {
    const id = keyOf(spec);
    setTabs((prev) => {
      const existing = prev.find((t) => t.id === id);
      const title = spec.title ?? DEFAULT_TITLES[spec.kind];
      if (existing) {
        // refresh title/params in case they changed
        return prev.map((t) => (t.id === id ? { ...t, title, params: spec.params ?? t.params } : t));
      }
      return [...prev, { id, kind: spec.kind, title, params: spec.params ?? {} }];
    });
    if (!spec.background) setActiveId(id);
    return id;
  }, []);

  const close = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id);
        if (idx === -1) return prev;
        const next = prev.filter((t) => t.id !== id);
        if (next.length === 0) {
          const home: Tab = { id: "dashboard", kind: "dashboard", title: DEFAULT_TITLES.dashboard, params: {} };
          setActiveId("dashboard");
          return [home];
        }
        setActiveId((cur) => {
          if (cur !== id) return cur;
          const fallback = next[Math.max(0, idx - 1)];
          return fallback.id;
        });
        return next;
      });
    },
    []
  );

  const rename = useCallback((id: string, title: string) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
  }, []);

  const focusIndex = useCallback(
    (i: number) => {
      setTabs((prev) => {
        if (prev[i]) setActiveId(prev[i].id);
        return prev;
      });
    },
    []
  );

  const step = useCallback((dir: 1 | -1) => {
    setTabs((prev) => {
      setActiveId((cur) => {
        const idx = prev.findIndex((t) => t.id === cur);
        if (idx === -1) return cur;
        const ni = (idx + dir + prev.length) % prev.length;
        return prev[ni].id;
      });
      return prev;
    });
  }, []);

  const value = useMemo<TabsCtx>(
    () => ({
      tabs,
      activeId,
      active: tabs.find((t) => t.id === activeId) ?? null,
      open,
      close,
      setActive: setActiveId,
      rename,
      next: () => step(1),
      prev: () => step(-1),
      focusIndex,
    }),
    [tabs, activeId, open, close, rename, step, focusIndex]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
