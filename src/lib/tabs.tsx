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
  /** Pinned tabs are never evicted when the tab limit is reached. */
  pinned?: boolean;
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
  "recap",
];

/** How the tab cap is chosen. `auto` follows the strip width; the others are explicit. */
export type MaxTabsMode = "auto" | "unlimited" | "fixed";

/** Smallest number of tabs we will keep available in auto / fixed modes. */
export const TAB_FIT_MIN = 3;
/** Typical painted width of one tab (icon + title + close), used to count how many fit. */
export const TAB_SLOT_PX = 156;
/** Used only until the strip has been measured. */
const TAB_FIT_FALLBACK = 8;
const MAX_TABS_FIXED_CAP = 30;

export function fitTabCount(availablePx: number): number {
  if (!Number.isFinite(availablePx) || availablePx <= 0) return TAB_FIT_MIN;
  return Math.max(TAB_FIT_MIN, Math.floor(availablePx / TAB_SLOT_PX));
}

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

function evictToLimit(
  prev: Tab[],
  limit: number,
  activeId: string,
  dirty: Record<string, boolean>
): Tab[] {
  if (limit <= 0 || prev.length <= limit) return prev;
  const next = [...prev];
  while (next.length > limit) {
    const evictIdx = next.findIndex((t) => t.id !== activeId && !t.pinned && !dirty[t.id]);
    if (evictIdx === -1) break;
    next.splice(evictIdx, 1);
  }
  return next;
}

function isRestorable(t: { kind: TabKind; params: TabParams }): boolean {
  if (t.kind === "note" && !t.params.noteId) return false;
  if (t.kind === "whiteboard" && !t.params.fileId) return false;
  if (t.kind === "pdf" && !t.params.fileId) return false;
  if (t.kind === "course" && typeof t.params.courseId !== "number") return false;
  if (t.kind === "class-content" && (typeof t.params.courseId !== "number" || !t.params.className))
    return false;
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
  /** Drag-and-drop reordering of the tab strip. */
  move: (fromIndex: number, toIndex: number) => void;
  togglePin: (id: string) => void;
  /** Effective cap used when opening a tab. `0` means unlimited. */
  maxTabs: number;
  maxTabsMode: MaxTabsMode;
  /** Remembered slider value when the mode is not `fixed`. */
  maxTabsFixed: number;
  /** How many tabs the strip can paint without scrolling. `0` until measured. */
  tabFitCapacity: number;
  setTabFitCapacity: (n: number) => void;
  setMaxTabsMode: (mode: MaxTabsMode, fixed?: number) => void;
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
  const [maxTabsMode, setMaxTabsModeState] = useState<MaxTabsMode>("auto");
  const [maxTabsFixed, setMaxTabsFixed] = useState<number>(TAB_FIT_FALLBACK);
  const [tabFitCapacity, setTabFitCapacityState] = useState<number>(0);
  const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  const effectiveMaxTabs =
    maxTabsMode === "unlimited"
      ? 0
      : maxTabsMode === "auto"
        ? tabFitCapacity > 0
          ? tabFitCapacity
          : TAB_FIT_FALLBACK
        : maxTabsFixed;

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
        const [modeRaw, nRaw] = await Promise.all([
          api.getSetting("max_tabs_mode"),
          api.getSetting("max_tabs"),
        ]);
        if (cancelled) return;
        const n = nRaw != null ? parseInt(nRaw, 10) : NaN;
        if (Number.isFinite(n) && n >= 3) {
          setMaxTabsFixed(Math.min(MAX_TABS_FIXED_CAP, Math.floor(n)));
        }
        if (modeRaw === "unlimited") {
          setMaxTabsModeState("unlimited");
        } else if (modeRaw === "fixed" && Number.isFinite(n) && n > 0) {
          setMaxTabsModeState("fixed");
        } else if (modeRaw === "auto") {
          setMaxTabsModeState("auto");
        } else if (nRaw === "0") {
          setMaxTabsModeState("unlimited");
        } else {
          setMaxTabsModeState("auto");
          api.setSetting("max_tabs_mode", "auto").catch(() => {});
        }
      } catch {
        if (!cancelled) setMaxTabsModeState("auto");
      }

      try {
        const raw = await api.getSetting("open_tabs");
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw) as {
          activeId?: string;
          tabs?: Array<{
            id: string;
            kind: TabKind;
            title: string;
            params?: TabParams;
            pinned?: boolean;
          }>;
        };
        const restored: Tab[] = (parsed.tabs || [])
          .filter((t) => t && t.kind && t.id && isRestorable({ kind: t.kind, params: t.params || {} }))
          .map((t) => ({
            id: t.id,
            kind: t.kind,
            title: t.title || DEFAULT_TITLES[t.kind] || t.kind,
            params: t.params || {},
            mountId: t.id,
            pinned: !!t.pinned,
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
          pinned: t.pinned,
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
        if (effectiveMaxTabs > 0 && prev.length >= effectiveMaxTabs) {
          nextTabs = evictToLimit(
            prev,
            effectiveMaxTabs - 1,
            activeIdRef.current,
            dirtyMapRef.current
          );
        }
        return [...nextTabs, { id, kind: spec.kind, title, params: newParams, mountId: newMountId() }];
      });

      if (!spec.background) {
        setActiveId((cur) => (cur === id ? cur : id));
      }
      return id;
    },
    [effectiveMaxTabs]
  );

  const setTabFitCapacity = useCallback((n: number) => {
    const count = Math.max(TAB_FIT_MIN, Math.floor(n));
    setTabFitCapacityState((prev) => (prev === count ? prev : count));
  }, []);

  useEffect(() => {
    if (maxTabsMode !== "auto" || tabFitCapacity < TAB_FIT_MIN) return;
    setTabs((prev) => evictToLimit(prev, tabFitCapacity, activeIdRef.current, dirtyMapRef.current));
  }, [maxTabsMode, tabFitCapacity]);

  const setMaxTabsMode = useCallback((mode: MaxTabsMode, fixed?: number) => {
    const nextFixed =
      typeof fixed === "number" && Number.isFinite(fixed)
        ? Math.max(TAB_FIT_MIN, Math.min(MAX_TABS_FIXED_CAP, Math.floor(fixed)))
        : null;
    if (nextFixed != null) {
      setMaxTabsFixed(nextFixed);
      api.setSetting("max_tabs", String(nextFixed)).catch(() => {});
    }
    setMaxTabsModeState(mode);
    api.setSetting("max_tabs_mode", mode).catch(() => {});
    if (mode === "unlimited") {
      api.setSetting("max_tabs", "0").catch(() => {});
    } else {
      const cap = nextFixed ?? maxTabsFixed;
      api.setSetting("max_tabs", String(cap)).catch(() => {});
      if (mode === "fixed") {
        setTabs((prev) => evictToLimit(prev, cap, activeIdRef.current, dirtyMapRef.current));
      }
    }
  }, [maxTabsFixed]);

  const updateMaxTabs = useCallback((n: number) => {
    if (n <= 0) setMaxTabsMode("unlimited");
    else setMaxTabsMode("fixed", n);
  }, [setMaxTabsMode]);

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

  const move = useCallback((fromIndex: number, toIndex: number) => {
    setTabs((prev) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const togglePin = useCallback((id: string) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)));
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
      move,
      togglePin,
      maxTabs: effectiveMaxTabs,
      maxTabsMode,
      maxTabsFixed,
      tabFitCapacity,
      setTabFitCapacity,
      setMaxTabsMode,
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
      move,
      togglePin,
      effectiveMaxTabs,
      maxTabsMode,
      maxTabsFixed,
      tabFitCapacity,
      setTabFitCapacity,
      setMaxTabsMode,
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
