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
  | "python"
  | "settings"
  | "whiteboard"
  | "pdf"
  | "reminders"
  | "help"
  | "note"
  | "recap";

export interface TabParams {
  courseId?: number;
  fileId?: number;
  fileName?: string;
  url?: string;
  isNew?: boolean;
  className?: string;
  matiere?: string;
  noteId?: number;
  filter?: string;
}

export interface Tab {
  id: string;
  kind: TabKind;
  title: string;
  params: TabParams;
  /** Immutable for the life of the pane — used as React key so retarget does not remount. */
  mountId: string;
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
  "python",
  "settings",
  "reminders",
  "help",
  "recap",
];

const DEFAULT_MAX_TABS = 10;

const DEFAULT_TITLES: Record<TabKind, string> = {
  dashboard: "Tableau de bord",
  courses: "Cours",
  course: "Cours",
  "class-content": "Contenu",
  documents: "Documents",
  tools: "Outils",
  python: "Python",
  settings: "Réglages",
  whiteboard: "Tableau",
  pdf: "Document",
  reminders: "Rappels",
  help: "Raccourcis",
  note: "Note",
  recap: "Bilan",
};

function newMountId(): string {
  return `m:${Math.random().toString(36).slice(2, 10)}`;
}

function keyOf(spec: OpenSpec): string {
  if (SINGLETONS.includes(spec.kind)) return spec.kind;
  const p = spec.params ?? {};
  if (spec.kind === "course") return `course:${p.courseId}`;
  if (spec.kind === "class-content") return `class-content:${p.courseId}:${p.className}`;
  if (spec.kind === "pdf") return `pdf:${p.fileId}`;
  if (spec.kind === "whiteboard")
    return p.fileId ? `whiteboard:${p.fileId}` : `whiteboard:new:${Math.random().toString(36).slice(2)}`;
  if (spec.kind === "note")
    return p.noteId ? `note:${p.noteId}` : `note:new:${Math.random().toString(36).slice(2)}`;
  return `${spec.kind}:${Math.random().toString(36).slice(2)}`;
}

function isRestorable(t: { kind: TabKind; params: TabParams }): boolean {
  if (t.kind === "note" && !t.params.noteId) return false;
  if (t.kind === "whiteboard" && !t.params.fileId) return false;
  if (t.kind === "pdf" && !t.params.fileId) return false;
  if (t.kind === "course" && typeof t.params.courseId !== "number") return false;
  if (t.kind === "class-content" && (typeof t.params.courseId !== "number" || !t.params.className))
    return false;
  if (t.kind === "help") return false;
  return true;
}

type TabsCtx = {
  tabs: Tab[];
  activeId: string | null;
  active: Tab | null;
  open: (spec: OpenSpec) => string;
  close: (id: string) => void;
  setActive: (id: string) => void;
  rename: (id: string, title: string, paramsPatch?: Partial<TabParams>) => void;
  retarget: (oldId: string, newId: string, title?: string, paramsPatch?: Partial<TabParams>) => void;
  next: () => void;
  prev: () => void;
  focusIndex: (i: number) => void;
  maxTabs: number;
  updateMaxTabs: (n: number) => void;
  isDirty: (id: string) => boolean;
  setTabDirty: (id: string, dirty: boolean) => void;
  registerFlush: (id: string, fn: () => Promise<void>) => () => void;
  flush: (id: string) => Promise<void>;
  hydrated: boolean;
};

const Ctx = createContext<TabsCtx | null>(null);
export const useTabs = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTabs: no provider");
  return c;
};

const HOME: Tab = {
  id: "dashboard",
  kind: "dashboard",
  title: DEFAULT_TITLES.dashboard,
  params: {},
  mountId: "dashboard",
};

export function TabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>([HOME]);
  const [activeId, setActiveId] = useState<string>("dashboard");
  const [maxTabs, setMaxTabs] = useState<number>(DEFAULT_MAX_TABS);
  const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  const activeIdRef = useRef<string>(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const dirtyMapRef = useRef(dirtyMap);
  useEffect(() => {
    dirtyMapRef.current = dirtyMap;
  }, [dirtyMap]);

  const flushFns = useRef(new Map<string, () => Promise<void>>());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await api.getSetting("max_tabs");
        if (cancelled) return;
        if (v != null) {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n >= 0) setMaxTabs(n);
          else {
            api.setSetting("max_tabs", String(DEFAULT_MAX_TABS)).catch(() => {});
            setMaxTabs(DEFAULT_MAX_TABS);
          }
        } else {
          api.setSetting("max_tabs", String(DEFAULT_MAX_TABS)).catch(() => {});
          setMaxTabs(DEFAULT_MAX_TABS);
        }
      } catch {
        if (!cancelled) setMaxTabs(DEFAULT_MAX_TABS);
      }

      try {
        const raw = await api.getSetting("open_tabs");
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw) as {
          activeId?: string;
          tabs?: Array<{ id: string; kind: TabKind; title: string; params?: TabParams }>;
        };
        const restored: Tab[] = (parsed.tabs || [])
          .filter((t) => t && t.kind && t.id && isRestorable({ kind: t.kind, params: t.params || {} }))
          .map((t) => ({
            id: t.id,
            kind: t.kind,
            title: t.title || DEFAULT_TITLES[t.kind] || t.kind,
            params: t.params || {},
            mountId: t.id,
          }));
        if (!restored.length) return;
        if (!restored.some((t) => t.kind === "dashboard")) {
          restored.unshift({ ...HOME, mountId: newMountId() });
        }
        setTabs(restored);
        const nextActive =
          parsed.activeId && restored.some((t) => t.id === parsed.activeId)
            ? parsed.activeId
            : restored[0].id;
        setActiveId(nextActive);
      } catch {
        // ignore corrupt session
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      const payload = {
        activeId,
        tabs: tabs.filter(isRestorable).map((t) => ({
          id: t.id,
          kind: t.kind,
          title: t.title,
          params: t.params,
        })),
      };
      api.setSetting("open_tabs", JSON.stringify(payload)).catch(() => {});
    }, 450);
    return () => clearTimeout(timer);
  }, [hydrated, tabs, activeId]);

  const setTabDirty = useCallback((id: string, dirty: boolean) => {
    setDirtyMap((prev) => {
      if (!!prev[id] === dirty) return prev;
      const next = { ...prev };
      if (dirty) next[id] = true;
      else delete next[id];
      return next;
    });
  }, []);

  const isDirty = useCallback((id: string) => !!dirtyMap[id], [dirtyMap]);

  const registerFlush = useCallback((id: string, fn: () => Promise<void>) => {
    flushFns.current.set(id, fn);
    return () => {
      if (flushFns.current.get(id) === fn) flushFns.current.delete(id);
    };
  }, []);

  const flush = useCallback(async (id: string) => {
    const fn = flushFns.current.get(id);
    if (fn) await fn();
  }, []);

  const open = useCallback(
    (spec: OpenSpec): string => {
      let id = "";
      const title = spec.title ?? DEFAULT_TITLES[spec.kind];
      const newParams = spec.params ?? {};

      setTabs((prev) => {
        if (spec.kind === "note" && newParams.noteId) {
          const byNote = prev.find((t) => t.kind === "note" && t.params.noteId === newParams.noteId);
          if (byNote) {
            id = byNote.id;
            return prev;
          }
        }
        if (spec.kind === "pdf" && newParams.fileId) {
          const byFile = prev.find((t) => t.kind === "pdf" && t.params.fileId === newParams.fileId);
          if (byFile) {
            id = byFile.id;
            return prev;
          }
        }
        if (spec.kind === "whiteboard" && newParams.fileId) {
          const byFile = prev.find((t) => t.kind === "whiteboard" && t.params.fileId === newParams.fileId);
          if (byFile) {
            id = byFile.id;
            return prev;
          }
        }
        if (spec.kind === "note" && newParams.isNew && !newParams.noteId) {
          const blank = prev.find((t) => t.kind === "note" && !t.params.noteId);
          if (blank) {
            id = blank.id;
            return prev;
          }
        }
        if (spec.kind === "whiteboard" && newParams.isNew && !newParams.fileId) {
          const blank = prev.find((t) => t.kind === "whiteboard" && !t.params.fileId);
          if (blank) {
            id = blank.id;
            return prev;
          }
        }

        id = keyOf(spec);
        const existing = prev.find((t) => t.id === id);
        if (existing) {
          const paramsSame = JSON.stringify(existing.params) === JSON.stringify(newParams);
          if (existing.title === title && paramsSame) return prev;
          return prev.map((t) => (t.id === id ? { ...t, title, params: newParams } : t));
        }

        let nextTabs = prev;
        if (maxTabs > 0 && prev.length >= maxTabs) {
          const curActive = activeIdRef.current;
          const evictIdx = prev.findIndex((t) => t.id !== curActive && !dirtyMapRef.current[t.id]);
          if (evictIdx !== -1) {
            nextTabs = prev.filter((_, i) => i !== evictIdx);
          }
        }
        return [...nextTabs, { id, kind: spec.kind, title, params: newParams, mountId: newMountId() }];
      });

      if (!spec.background) {
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

    if (val > 0) {
      setTabs((prev) => {
        if (prev.length <= val) return prev;
        const curActive = activeIdRef.current;
        let next = [...prev];
        while (next.length > val) {
          const evictIdx = next.findIndex((t) => t.id !== curActive && !dirtyMapRef.current[t.id]);
          if (evictIdx !== -1) next.splice(evictIdx, 1);
          else break;
        }
        return next;
      });
    }
  }, []);

  const close = useCallback((id: string) => {
    setDirtyMap((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    flushFns.current.delete(id);
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) return prev;
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        setActiveId("dashboard");
        return [{ ...HOME, mountId: newMountId() }];
      }
      setActiveId((cur) => {
        if (cur !== id) return cur;
        const fallback = next[Math.max(0, idx - 1)];
        return fallback.id;
      });
      return next;
    });
  }, []);

  const rename = useCallback((id: string, title: string, paramsPatch?: Partial<TabParams>) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        return {
          ...t,
          title,
          params: paramsPatch ? { ...t.params, ...paramsPatch } : t.params,
        };
      })
    );
  }, []);

  const retarget = useCallback(
    (oldId: string, newId: string, title?: string, paramsPatch?: Partial<TabParams>) => {
      if (oldId === newId) {
        if (title || paramsPatch) rename(oldId, title || "", paramsPatch);
        return;
      }
      setTabs((prev) => {
        if (prev.some((t) => t.id === newId)) {
          return prev.filter((t) => t.id !== oldId);
        }
        return prev.map((t) => {
          if (t.id !== oldId) return t;
          return {
            ...t,
            id: newId,
            title: title ?? t.title,
            params: paramsPatch ? { ...t.params, ...paramsPatch } : t.params,
          };
        });
      });
      setActiveId((cur) => (cur === oldId ? newId : cur));
      setDirtyMap((prev) => {
        if (!(oldId in prev) && !(newId in prev)) return prev;
        const next = { ...prev };
        if (oldId in next) {
          next[newId] = next[oldId];
          delete next[oldId];
        }
        return next;
      });
      const fn = flushFns.current.get(oldId);
      if (fn) {
        flushFns.current.delete(oldId);
        flushFns.current.set(newId, fn);
      }
    },
    [rename]
  );

  const focusIndex = useCallback((i: number) => {
    setTabs((prev) => {
      if (prev[i]) setActiveId(prev[i].id);
      return prev;
    });
  }, []);

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
      retarget,
      next: () => step(1),
      prev: () => step(-1),
      focusIndex,
      maxTabs,
      updateMaxTabs,
      isDirty,
      setTabDirty,
      registerFlush,
      flush,
      hydrated,
    }),
    [
      tabs,
      activeId,
      open,
      close,
      rename,
      retarget,
      step,
      focusIndex,
      maxTabs,
      updateMaxTabs,
      dirtyMap,
      isDirty,
      setTabDirty,
      registerFlush,
      flush,
      hydrated,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
