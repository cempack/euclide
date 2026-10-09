import { create } from "zustand";
import { api } from "../lib/api";
import { bootSetting, forgetBootSetting } from "../lib/boot";
import { tabSwitchBegin } from "../lib/perf";
import { editors } from "./editors";
import { logged, reportError } from "../lib/report";

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
  /** Python: a script to open (its file name), and when it was asked for. */
  script?: string;
  scriptAt?: number;
  /** Settings: the section to show, and when it was asked for. */
  section?: string;
  sectionAt?: number;
  /** A PDF: words to find in it (a search hit), and when they were asked for. */
  find?: string;
  findAt?: number;
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

type TabsState = {
  tabs: Tab[];
  activeId: string;
  maxTabsMode: MaxTabsMode;
  /** Remembered slider value when the mode is not `fixed`. */
  maxTabsFixed: number;
  /** How many tabs the strip can paint without scrolling. `0` until measured. */
  tabFitCapacity: number;
  /** The saved session has been read (at once when it came with the page). */
  hydrated: boolean;
};

const atLaunch = sessionAtLaunch();

/**
 * The open tabs. Components read the slice they show through the hooks
 * below, so opening a tab re-renders the strip and the panes, not every
 * screen that can open one; actions live in `tabs` and never subscribe.
 */
export const useTabsStore = create<TabsState>()(() => ({
  tabs: atLaunch?.session?.tabs ?? [HOME],
  activeId: atLaunch?.session?.activeId ?? "dashboard",
  maxTabsMode: atLaunch?.limit.mode ?? "auto",
  maxTabsFixed: atLaunch?.limit.fixed ?? TAB_FIT_FALLBACK,
  tabFitCapacity: 0,
  hydrated: atLaunch !== null,
}));

const state = useTabsStore.getState;
const setState = useTabsStore.setState;

/** Effective cap used when opening a tab. `0` means unlimited. */
function maxTabsOf(s: TabsState): number {
  if (s.maxTabsMode === "unlimited") return 0;
  if (s.maxTabsMode === "auto") return s.tabFitCapacity > 0 ? s.tabFitCapacity : TAB_FIT_FALLBACK;
  return s.maxTabsFixed;
}

function commitTabs(next: Tab[]) {
  if (next !== state().tabs) setState({ tabs: next });
}

function setActive(id: string) {
  if (id === state().activeId) return;
  tabSwitchBegin();
  setState({ activeId: id });
}

function step(dir: 1 | -1) {
  const { tabs: list, activeId } = state();
  const idx = list.findIndex((t) => t.id === activeId);
  if (idx !== -1) setActive(list[(idx + dir + list.length) % list.length].id);
}

function setMaxTabsMode(mode: MaxTabsMode, fixed?: number) {
  const nextFixed =
    typeof fixed === "number" && Number.isFinite(fixed)
      ? Math.max(TAB_FIT_MIN, Math.min(MAX_TABS_FIXED_CAP, Math.floor(fixed)))
      : null;
  if (nextFixed != null) {
    setState({ maxTabsFixed: nextFixed });
    api.setSetting("max_tabs", String(nextFixed)).catch(logged("tabs.limit"));
  }
  setState({ maxTabsMode: mode });
  api.setSetting("max_tabs_mode", mode).catch(logged("tabs.limit"));
  if (mode === "unlimited") {
    api.setSetting("max_tabs", "0").catch(logged("tabs.limit"));
    return;
  }
  const cap = nextFixed ?? state().maxTabsFixed;
  api.setSetting("max_tabs", String(cap)).catch(logged("tabs.limit"));
  if (mode === "fixed") commitTabs(evictToLimit(state().tabs, cap, state().activeId, editors.dirtyMap()));
}

/** Every change to the open tabs. Synchronous: each call sees the last. */
export const tabs = {
  list: () => state().tabs,
  activeId: () => state().activeId,
  active: (): Tab | null => {
    const s = state();
    return s.tabs.find((t) => t.id === s.activeId) ?? null;
  },

  open(spec: OpenSpec): string {
    const title = spec.title ?? DEFAULT_TITLES[spec.kind];
    const newParams = spec.params ?? {};
    const prev = state().tabs;

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
      // A PDF already open, asked for with words to find: they go to it.
      if (spec.kind === "pdf" && newParams.findAt)
        commitTabs(
          prev.map((t) =>
            t.id === id
              ? { ...t, params: { ...t.params, find: newParams.find, findAt: newParams.findAt } }
              : t,
          ),
        );
    } else {
      id = keyOf(spec);
      const existing = prev.find((t) => t.id === id);
      if (existing) {
        const paramsSame = JSON.stringify(existing.params) === JSON.stringify(newParams);
        if (existing.title !== title || !paramsSame) {
          commitTabs(prev.map((t) => (t.id === id ? { ...t, title, params: newParams } : t)));
        }
      } else {
        const limit = maxTabsOf(state());
        const kept =
          limit > 0 && prev.length >= limit
            ? evictToLimit(prev, limit - 1, state().activeId, editors.dirtyMap())
            : prev;
        commitTabs([...kept, { id, kind: spec.kind, title, params: newParams, mountId: newMountId() }]);
      }
    }

    if (!spec.background) setActive(id);
    return id;
  },

  /** `discard` drops unsaved changes: editors must not save on unmount. */
  close(id: string, opts?: { discard?: boolean }) {
    editors.forget(id, opts?.discard);
    const prev = state().tabs;
    const idx = prev.findIndex((t) => t.id === id);
    if (idx === -1) return;
    const next = prev.filter((t) => t.id !== id);
    if (next.length === 0) {
      commitTabs([{ ...HOME, mountId: newMountId() }]);
      setActive("dashboard");
      return;
    }
    commitTabs(next);
    if (state().activeId === id) setActive(next[Math.max(0, idx - 1)].id);
  },

  setActive,

  /**
   * A file was deleted: its tabs go, and their editors must not write it
   * back on the way out.
   */
  closeFile(fileId: number) {
    for (const t of state().tabs.filter((t) => t.params.fileId === fileId))
      tabs.close(t.id, { discard: true });
  },

  /** No-op when nothing changes: notes rename their tab on every keystroke. */
  rename(id: string, title: string, paramsPatch?: Partial<TabParams>) {
    const prev = state().tabs;
    const tab = prev.find((t) => t.id === id);
    if (!tab) return;
    const params = paramsPatch ? { ...tab.params, ...paramsPatch } : tab.params;
    const sameParams = !paramsPatch || JSON.stringify(params) === JSON.stringify(tab.params);
    if (tab.title === title && sameParams) return;
    commitTabs(prev.map((t) => (t.id === id ? { ...t, title, params } : t)));
  },

  /** A new note or board was saved: its tab takes the id that names it. */
  retarget(oldId: string, newId: string, title?: string, paramsPatch?: Partial<TabParams>) {
    if (oldId === newId) {
      if (title || paramsPatch) tabs.rename(oldId, title || "", paramsPatch);
      return;
    }
    const prev = state().tabs;
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
    if (state().activeId === oldId) setActive(newId);
    editors.retarget(oldId, newId);
  },

  next: () => step(1),
  prev: () => step(-1),

  focusIndex(i: number) {
    const tab = state().tabs[i];
    if (tab) setActive(tab.id);
  },

  /** Drag-and-drop reordering of the tab strip. */
  move(fromIndex: number, toIndex: number) {
    const prev = state().tabs;
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= prev.length || toIndex >= prev.length) return;
    const next = [...prev];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    commitTabs(next);
  },

  togglePin(id: string) {
    commitTabs(state().tabs.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)));
  },

  setTabFitCapacity(n: number) {
    const count = Math.max(TAB_FIT_MIN, Math.floor(n));
    if (count !== state().tabFitCapacity) setState({ tabFitCapacity: count });
  },

  setMaxTabsMode,

  updateMaxTabs(n: number) {
    if (n <= 0) setMaxTabsMode("unlimited");
    else setMaxTabsMode("fixed", n);
  },
};

export const useTabList = () => useTabsStore((s) => s.tabs);
export const useActiveId = () => useTabsStore((s) => s.activeId);
export const useActiveTab = () => useTabsStore((s) => s.tabs.find((t) => t.id === s.activeId) ?? null);
export const useActiveKind = () => useTabsStore((s) => s.tabs.find((t) => t.id === s.activeId)?.kind ?? null);
export const useMaxTabs = () => useTabsStore(maxTabsOf);
export const useTabLimit = () => ({
  mode: useTabsStore((s) => s.maxTabsMode),
  fixed: useTabsStore((s) => s.maxTabsFixed),
  fit: useTabsStore((s) => s.tabFitCapacity),
  max: useTabsStore(maxTabsOf),
});

let saveSessionNow = async () => {};

/** Writes the open tabs now rather than after the pause (quitting). */
export const saveTabSession = () => saveSessionNow();

/**
 * Reads the saved session when it did not come with the page (a reload, the
 * browser), then saves the open tabs whenever they change. Returns the stop.
 */
export function startTabSession(): () => void {
  let saved = atLaunch?.raw ?? null;
  let cancelled = false;
  if (atLaunch) {
    if (atLaunch.limit.migrate) api.setSetting("max_tabs_mode", "auto").catch(logged("tabs.limit"));
  } else {
    void (async () => {
      try {
        const [modeRaw, nRaw] = await Promise.all([
          api.getSetting("max_tabs_mode"),
          api.getSetting("max_tabs"),
        ]);
        if (cancelled) return;
        const limit = parseTabLimit(modeRaw, nRaw);
        setState(
          limit.fixed != null
            ? { maxTabsMode: limit.mode, maxTabsFixed: limit.fixed }
            : { maxTabsMode: limit.mode },
        );
        if (limit.migrate) api.setSetting("max_tabs_mode", "auto").catch(logged("tabs.limit"));
      } catch (err) {
        reportError("tabs.readLimit", err); // keep « auto »
      }
      try {
        const raw = await api.getSetting("open_tabs");
        if (cancelled) return;
        saved = raw;
        const session = parseSession(raw);
        if (session) setState({ tabs: session.tabs, activeId: session.activeId });
      } catch (err) {
        reportError("tabs.readSession", err); // keep the dashboard
      } finally {
        if (!cancelled) setState({ hydrated: true });
      }
    })();
  }

  let timer = 0;
  const save = async () => {
    window.clearTimeout(timer);
    if (!state().hydrated) return;
    const { tabs: list, activeId } = state();
    const payload = sessionPayload(list, activeId);
    if (payload === saved) return;
    saved = payload;
    await api.setSetting("open_tabs", payload).catch(logged("tabs.session"));
  };
  saveSessionNow = save;
  const unsubscribe = useTabsStore.subscribe((s, prev) => {
    if (!s.hydrated) return;
    if (s.tabs === prev.tabs && s.activeId === prev.activeId && s.hydrated === prev.hydrated) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void save(), 450);
  });
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    saveSessionNow = async () => {};
    unsubscribe();
  };
}
