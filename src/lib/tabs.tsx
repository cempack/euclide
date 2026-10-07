import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { api } from "./api";
import { bootSetting, forgetBootSetting } from "./boot";
import { tabSwitchBegin } from "./perf";

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

function evictToLimit(prev: Tab[], limit: number, activeId: string, dirty: Record<string, boolean>): Tab[] {
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
  /** `discard` drops unsaved changes: editors must not save on unmount. */
  close: (id: string, opts?: { discard?: boolean }) => void;
  /** True once if the tab was closed with `discard`; editors check it on unmount. */
  takeDiscarded: (id: string) => boolean;
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

type DirtyMap = Record<string, boolean>;

function createDirtyStore() {
  let map: DirtyMap = {};
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => map,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    set: (id: string, dirty: boolean) => {
      if (!!map[id] === dirty) return;
      const next = { ...map };
      if (dirty) next[id] = true;
      else delete next[id];
      map = next;
      emit();
    },
    clear: (id: string) => {
      if (!(id in map)) return;
      const next = { ...map };
      delete next[id];
      map = next;
      emit();
    },
    retarget: (oldId: string, newId: string) => {
      if (!(oldId in map) && !(newId in map)) return;
      const next = { ...map };
      if (oldId in next) {
        next[newId] = next[oldId];
        delete next[oldId];
      }
      map = next;
      emit();
    },
  };
}

type DirtyStore = ReturnType<typeof createDirtyStore>;

const DirtyCtx = createContext<DirtyStore | null>(null);

/** Subscribe to unsaved-tab dots without re-rendering every `useTabs` consumer. */
export function useDirtyMap(): DirtyMap {
  const store = useContext(DirtyCtx);
  if (!store) throw new Error("useDirtyMap: no provider");
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

const HOME: Tab = {
  id: "dashboard",
  kind: "dashboard",
  title: DEFAULT_TITLES.dashboard,
  params: {},
  mountId: "dashboard",
};

type TabLimit = { mode: MaxTabsMode; fixed: number | null; migrate: boolean };

/** The tab limit from the saved settings (versions before 0.1.10 only saved max_tabs). */
export function parseTabLimit(modeRaw: string | null, nRaw: string | null): TabLimit {
  const n = nRaw != null ? parseInt(nRaw, 10) : NaN;
  const fixed = Number.isFinite(n) && n >= 3 ? Math.min(MAX_TABS_FIXED_CAP, Math.floor(n)) : null;
  if (modeRaw === "unlimited") return { mode: "unlimited", fixed, migrate: false };
  if (modeRaw === "fixed" && Number.isFinite(n) && n > 0) return { mode: "fixed", fixed, migrate: false };
  if (modeRaw === "auto") return { mode: "auto", fixed, migrate: false };
  if (nRaw === "0") return { mode: "unlimited", fixed, migrate: false };
  return { mode: "auto", fixed, migrate: true };
}

type Session = { tabs: Tab[]; activeId: string };

/** The tabs saved by the previous session, or null when there are none. */
export function parseSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      activeId?: string;
      tabs?: Array<{ id: string; kind: TabKind; title: string; params?: TabParams; pinned?: boolean }>;
    };
    const tabs: Tab[] = (parsed.tabs || [])
      .filter((t) => t && t.kind && t.id && isRestorable({ kind: t.kind, params: t.params || {} }))
      .map((t) => ({
        id: t.id,
        kind: t.kind,
        title: t.title || DEFAULT_TITLES[t.kind] || t.kind,
        params: t.params || {},
        mountId: t.id,
        pinned: !!t.pinned,
      }));
    if (!tabs.length) return null;
    if (!tabs.some((t) => t.kind === "dashboard")) tabs.unshift({ ...HOME, mountId: newMountId() });
    const activeId =
      parsed.activeId && tabs.some((t) => t.id === parsed.activeId) ? parsed.activeId : tabs[0].id;
    return { tabs, activeId };
  } catch {
    return null; // corrupt session
  }
}

function sessionPayload(tabs: Tab[], activeId: string): string {
  return JSON.stringify({
    activeId,
    tabs: tabs.filter(isRestorable).map((t) => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      params: t.params,
      pinned: t.pinned,
    })),
  });
}

/**
 * The previous session as saved at launch (lib/boot.ts), so the first render
 * already shows its tabs; null when only the backend knows (reload, browser).
 */
function sessionAtLaunch(): { session: Session | null; limit: TabLimit; raw: string | null } | null {
  const raw = bootSetting("open_tabs");
  if (raw === undefined) return null;
  const limit = parseTabLimit(bootSetting("max_tabs_mode") ?? null, bootSetting("max_tabs") ?? null);
  for (const key of ["open_tabs", "max_tabs_mode", "max_tabs"]) forgetBootSetting(key);
  return { session: parseSession(raw), limit, raw };
}

export function TabsProvider({ children }: { children: ReactNode }) {
  const [atLaunch] = useState(sessionAtLaunch);
  const [tabs, setTabsState] = useState<Tab[]>(atLaunch?.session?.tabs ?? [HOME]);
  const [activeId, setActiveIdState] = useState<string>(atLaunch?.session?.activeId ?? "dashboard");

  // The refs are the source of truth and change synchronously, so several
  // actions in one event (open a tab then focus it, close then reopen…) each
  // see the previous one. State updaters must stay free of side effects:
  // React 19 runs them later, and twice in development.
  const tabsRef = useRef<Tab[]>(tabs);
  const activeIdRef = useRef<string>(activeId);
  const commitTabs = useCallback((next: Tab[]) => {
    if (next === tabsRef.current) return;
    tabsRef.current = next;
    setTabsState(next);
  }, []);
  const setActiveId = useCallback((id: string) => {
    if (id === activeIdRef.current) return;
    tabSwitchBegin();
    activeIdRef.current = id;
    setActiveIdState(id);
  }, []);
  const [maxTabsMode, setMaxTabsModeState] = useState<MaxTabsMode>(atLaunch?.limit.mode ?? "auto");
  const [maxTabsFixed, setMaxTabsFixed] = useState<number>(atLaunch?.limit.fixed ?? TAB_FIT_FALLBACK);
  const [tabFitCapacity, setTabFitCapacityState] = useState<number>(0);
  const [hydrated, setHydrated] = useState(atLaunch !== null);
  // What the database holds, so an unchanged session is not written back.
  const savedSession = useRef<string | null>(atLaunch?.raw ?? null);
  const dirtyStore = useMemo(() => createDirtyStore(), []);

  const effectiveMaxTabs =
    maxTabsMode === "unlimited"
      ? 0
      : maxTabsMode === "auto"
        ? tabFitCapacity > 0
          ? tabFitCapacity
          : TAB_FIT_FALLBACK
        : maxTabsFixed;

  const flushFns = useRef(new Map<string, () => Promise<void>>());
  const discarded = useRef(new Set<string>());

  useEffect(() => {
    if (atLaunch) {
      if (atLaunch.limit.migrate) api.setSetting("max_tabs_mode", "auto").catch(() => {});
      return;
    }
    // Reload of the page or browser mode: ask the backend.
    let cancelled = false;
    (async () => {
      try {
        const [modeRaw, nRaw] = await Promise.all([
          api.getSetting("max_tabs_mode"),
          api.getSetting("max_tabs"),
        ]);
        if (cancelled) return;
        const limit = parseTabLimit(modeRaw, nRaw);
        if (limit.fixed != null) setMaxTabsFixed(limit.fixed);
        setMaxTabsModeState(limit.mode);
        if (limit.migrate) api.setSetting("max_tabs_mode", "auto").catch(() => {});
      } catch {
        if (!cancelled) setMaxTabsModeState("auto");
      }

      try {
        const raw = await api.getSetting("open_tabs");
        if (cancelled) return;
        savedSession.current = raw;
        const session = parseSession(raw);
        if (session) {
          commitTabs(session.tabs);
          setActiveId(session.activeId);
        }
      } catch {
        // keep the dashboard
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [atLaunch, commitTabs, setActiveId]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      const payload = sessionPayload(tabs, activeId);
      if (payload === savedSession.current) return;
      savedSession.current = payload;
      api.setSetting("open_tabs", payload).catch(() => {});
    }, 450);
    return () => clearTimeout(timer);
  }, [hydrated, tabs, activeId]);

  const setTabDirty = useCallback(
    (id: string, dirty: boolean) => {
      dirtyStore.set(id, dirty);
    },
    [dirtyStore],
  );

  const isDirty = useCallback((id: string) => !!dirtyStore.getSnapshot()[id], [dirtyStore]);

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
      const title = spec.title ?? DEFAULT_TITLES[spec.kind];
      const newParams = spec.params ?? {};
      const prev = tabsRef.current;

      const find = (): Tab | undefined => {
        if (spec.kind === "note" && newParams.noteId)
          return prev.find((t) => t.kind === "note" && t.params.noteId === newParams.noteId);
        if (spec.kind === "pdf" && newParams.fileId)
          return prev.find((t) => t.kind === "pdf" && t.params.fileId === newParams.fileId);
        if (spec.kind === "whiteboard" && newParams.fileId)
          return prev.find((t) => t.kind === "whiteboard" && t.params.fileId === newParams.fileId);
        if (spec.kind === "note" && newParams.isNew && !newParams.noteId)
          return prev.find((t) => t.kind === "note" && !t.params.noteId);
        if (spec.kind === "whiteboard" && newParams.isNew && !newParams.fileId)
          return prev.find((t) => t.kind === "whiteboard" && !t.params.fileId);
        return undefined;
      };

      let id: string;
      const reused = find();
      if (reused) {
        id = reused.id;
      } else {
        id = keyOf(spec);
        const existing = prev.find((t) => t.id === id);
        if (existing) {
          const paramsSame = JSON.stringify(existing.params) === JSON.stringify(newParams);
          if (existing.title !== title || !paramsSame) {
            commitTabs(prev.map((t) => (t.id === id ? { ...t, title, params: newParams } : t)));
          }
        } else {
          let nextTabs = prev;
          if (effectiveMaxTabs > 0 && prev.length >= effectiveMaxTabs) {
            nextTabs = evictToLimit(
              prev,
              effectiveMaxTabs - 1,
              activeIdRef.current,
              dirtyStore.getSnapshot(),
            );
          }
          commitTabs([...nextTabs, { id, kind: spec.kind, title, params: newParams, mountId: newMountId() }]);
        }
      }

      if (!spec.background) setActiveId(id);
      return id;
    },
    [effectiveMaxTabs, dirtyStore, commitTabs, setActiveId],
  );

  const setTabFitCapacity = useCallback((n: number) => {
    const count = Math.max(TAB_FIT_MIN, Math.floor(n));
    setTabFitCapacityState((prev) => (prev === count ? prev : count));
  }, []);

  const setMaxTabsMode = useCallback(
    (mode: MaxTabsMode, fixed?: number) => {
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
          commitTabs(evictToLimit(tabsRef.current, cap, activeIdRef.current, dirtyStore.getSnapshot()));
        }
      }
    },
    [maxTabsFixed, dirtyStore, commitTabs],
  );

  const updateMaxTabs = useCallback(
    (n: number) => {
      if (n <= 0) setMaxTabsMode("unlimited");
      else setMaxTabsMode("fixed", n);
    },
    [setMaxTabsMode],
  );

  const close = useCallback(
    (id: string, opts?: { discard?: boolean }) => {
      if (opts?.discard) discarded.current.add(id);
      dirtyStore.clear(id);
      flushFns.current.delete(id);
      const prev = tabsRef.current;
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) return;
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        commitTabs([{ ...HOME, mountId: newMountId() }]);
        setActiveId("dashboard");
        return;
      }
      commitTabs(next);
      if (activeIdRef.current === id) setActiveId(next[Math.max(0, idx - 1)].id);
    },
    [dirtyStore, commitTabs, setActiveId],
  );

  const takeDiscarded = useCallback((id: string) => discarded.current.delete(id), []);

  /** No-op when nothing changes: notes rename their tab on every keystroke. */
  const rename = useCallback(
    (id: string, title: string, paramsPatch?: Partial<TabParams>) => {
      const prev = tabsRef.current;
      const tab = prev.find((t) => t.id === id);
      if (!tab) return;
      const params = paramsPatch ? { ...tab.params, ...paramsPatch } : tab.params;
      const sameParams = !paramsPatch || JSON.stringify(params) === JSON.stringify(tab.params);
      if (tab.title === title && sameParams) return;
      commitTabs(prev.map((t) => (t.id === id ? { ...t, title, params } : t)));
    },
    [commitTabs],
  );

  const retarget = useCallback(
    (oldId: string, newId: string, title?: string, paramsPatch?: Partial<TabParams>) => {
      if (oldId === newId) {
        if (title || paramsPatch) rename(oldId, title || "", paramsPatch);
        return;
      }
      const prev = tabsRef.current;
      if (prev.some((t) => t.id === newId)) {
        commitTabs(prev.filter((t) => t.id !== oldId));
      } else {
        commitTabs(
          prev.map((t) =>
            t.id !== oldId
              ? t
              : {
                  ...t,
                  id: newId,
                  title: title ?? t.title,
                  params: paramsPatch ? { ...t.params, ...paramsPatch } : t.params,
                },
          ),
        );
      }
      if (activeIdRef.current === oldId) setActiveId(newId);
      dirtyStore.retarget(oldId, newId);
      const fn = flushFns.current.get(oldId);
      if (fn) {
        flushFns.current.delete(oldId);
        flushFns.current.set(newId, fn);
      }
    },
    [rename, dirtyStore, commitTabs, setActiveId],
  );

  const focusIndex = useCallback(
    (i: number) => {
      const tab = tabsRef.current[i];
      if (tab) setActiveId(tab.id);
    },
    [setActiveId],
  );

  const move = useCallback(
    (fromIndex: number, toIndex: number) => {
      const prev = tabsRef.current;
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length
      ) {
        return;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      commitTabs(next);
    },
    [commitTabs],
  );

  const togglePin = useCallback(
    (id: string) => {
      commitTabs(tabsRef.current.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)));
    },
    [commitTabs],
  );

  const step = useCallback(
    (dir: 1 | -1) => {
      const prev = tabsRef.current;
      const idx = prev.findIndex((t) => t.id === activeIdRef.current);
      if (idx === -1) return;
      setActiveId(prev[(idx + dir + prev.length) % prev.length].id);
    },
    [setActiveId],
  );

  const value = useMemo<TabsCtx>(
    () => ({
      tabs,
      activeId,
      active: tabs.find((t) => t.id === activeId) ?? null,
      open,
      close,
      takeDiscarded,
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
      takeDiscarded,
      setActiveId,
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
      isDirty,
      setTabDirty,
      registerFlush,
      flush,
      hydrated,
    ],
  );

  return (
    <DirtyCtx.Provider value={dirtyStore}>
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
    </DirtyCtx.Provider>
  );
}
