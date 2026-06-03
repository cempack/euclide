import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";

export type TabKind =
  | "dashboard"
  | "courses"
  | "course"
  | "class-content"
  | "documents"
  | "tools"
  | "recap"
  | "settings"
  | "whiteboard"
  | "pdf"
  | "reminders"
  | "help";

export interface TabParams {
  courseId?: number;
  fileId?: number;
  fileName?: string;
  url?: string;
  isNew?: boolean;
  className?: string;
  matiere?: string;
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
  "reminders",
  "help",
];

// Default max tabs (overridable via settings). 0 = unlimited (no limit, no eviction).
const DEFAULT_MAX_TABS = 10;

const DEFAULT_TITLES: Record<TabKind, string> = {
  dashboard: "Tableau de bord",
  courses: "Cours",
  course: "Cours",
  "class-content": "Contenu de classe",
  documents: "Documents",
  tools: "Outils",
  recap: "Bilan",
  settings: "Reglages",
  whiteboard: "Tableau blanc",
  pdf: "Document",
  reminders: "Rappels",
  help: "Raccourcis",
};

function keyOf(spec: OpenSpec): string {
  if (SINGLETONS.includes(spec.kind)) return spec.kind;
  const p = spec.params ?? {};
  if (spec.kind === "course") return `course:${p.courseId}`;
  if (spec.kind === "class-content") return `class-content:${p.courseId}:${p.className}`;
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
  maxTabs: number; // 0 means unlimited (no eviction on new tabs)
  updateMaxTabs: (n: number) => void;
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
  const [maxTabs, setMaxTabs] = useState<number>(DEFAULT_MAX_TABS);

  // Load persisted max tabs (or default + persist default on first run)
  useEffect(() => {
    api
      .getSetting("max_tabs")
      .then((v) => {
        if (v != null) {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n >= 0) {
            setMaxTabs(n);
            return;
          }
        }
        // First run or invalid: persist default
        api.setSetting("max_tabs", String(DEFAULT_MAX_TABS)).catch(() => {});
        setMaxTabs(DEFAULT_MAX_TABS);
      })
      .catch(() => {
        setMaxTabs(DEFAULT_MAX_TABS);
      });
  }, []);

  // Ref so the open() logic can read the *current* active without stale closures
  const activeIdRef = useRef<string>(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const open = useCallback(
    (spec: OpenSpec): string => {
      const id = keyOf(spec);
      const title = spec.title ?? DEFAULT_TITLES[spec.kind];
      const newParams = spec.params ?? {};

      setTabs((prev) => {
        const existing = prev.find((t) => t.id === id);
        if (existing) {
          // no-op if nothing changed (prevents unnecessary re-renders)
          const paramsSame = JSON.stringify(existing.params) === JSON.stringify(newParams);
          if (existing.title === title && paramsSame) {
            return prev;
          }
          return prev.map((t) =>
            t.id === id ? { ...t, title, params: newParams } : t
          );
        }

        // New tab (e.g. a fresh whiteboard, another PDF, a specific course tab, etc.).
        // Enforce maxTabs (if >0) by evicting the oldest non-active tab if we're at the limit.
        // This keeps the + button (and any other open() call) always functional without
        // letting the tab strip get too cluttered. If maxTabs==0, unlimited tabs allowed.
        let nextTabs = prev;
        if (maxTabs > 0 && prev.length >= maxTabs) {
          const curActive = activeIdRef.current;
          const evictIdx = prev.findIndex((t) => t.id !== curActive);
          if (evictIdx !== -1) {
            nextTabs = prev.filter((_, i) => i !== evictIdx);
          } else {
            // Fallback (shouldn't normally happen): drop the oldest
            nextTabs = prev.slice(0, maxTabs - 1);
          }
        }
        return [...nextTabs, { id, kind: spec.kind, title, params: newParams }];
      });

      if (!spec.background) {
        // only change active if it's actually different (prevents "load again" on current tab)
        setActiveId((cur) => (cur === id ? cur : id));
      }
      return id;
    },
    [maxTabs]
  );

  const updateMaxTabs = useCallback((n: number) => {
    const val = n <= 0 ? 0 : Math.max(3, Math.min(30, Math.floor(n)));
    setMaxTabs(val);
    api.setSetting("max_tabs", String(val)).catch(() => {});

    // When the limit is reduced (via Settings), immediately evict excess tabs
    // (oldest non-active first, same policy as on open()). This ensures the
    // tab bar respects the new lower limit right away instead of only on
    // future opens.
    if (val > 0) {
      setTabs((prev) => {
        if (prev.length <= val) return prev;
        const curActive = activeIdRef.current;
        let next = [...prev];
        while (next.length > val) {
          const evictIdx = next.findIndex((t) => t.id !== curActive);
          if (evictIdx !== -1) {
            next.splice(evictIdx, 1);
          } else {
            next.pop();
          }
        }
        return next;
      });
    }
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
      maxTabs,
      updateMaxTabs,
    }),
    [tabs, activeId, open, close, rename, step, focusIndex, maxTabs, updateMaxTabs]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
