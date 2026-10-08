import { QueryClient } from "@tanstack/react-query";
import { isTauri } from "../lib/api";

/**
 * The data layer's cache. Everything lives on this PC: no network modes, no
 * refetch on focus or reconnect, no retries for database calls (a failure is
 * real, retrying only hides it). Data changes through the app's own actions,
 * which invalidate what they touched, and through backend jobs, which say so
 * with an `eu://invalidate` event.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "always",
      retry: 0,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
    },
    mutations: { networkMode: "always", retry: 0 },
  },
});

// Dev builds: the visual tests wait until nothing is loading before a
// screenshot (tests/visual/screens.spec.ts).
if (import.meta.env.DEV) (window as unknown as { __euQueries?: QueryClient }).__euQueries = queryClient;

/** What a change can touch; each scope names the queries that show it. */
export type Scope =
  | "library"
  | "courses"
  | "reminders"
  | "schedule"
  | "links"
  | "pronote"
  | "keepAwake"
  | "settings"
  | "thumbnails";

const SCOPE_KEYS: Record<Scope, string[][]> = {
  library: [["library"], ["search"]],
  courses: [["courses"]],
  reminders: [["reminders"]],
  schedule: [["schedule"]],
  links: [["links"]],
  pronote: [["pronote"], ["schedule"]],
  keepAwake: [["keepAwake"]],
  settings: [["settings"]],
  thumbnails: [],
};

const listeners = new Map<Scope, Set<() => void>>();

/**
 * Something changed: the queries that show it refetch (where they are on
 * screen), and code that is not a query (the preview job) hears it.
 */
export function changed(...scopes: Scope[]) {
  for (const scope of scopes) {
    for (const queryKey of SCOPE_KEYS[scope]) void queryClient.invalidateQueries({ queryKey });
    listeners.get(scope)?.forEach((fn) => fn());
  }
}

/** Calls `fn` after each change to `scope`; returns the unsubscribe. */
export function onChanged(scope: Scope, fn: () => void): () => void {
  const set = listeners.get(scope) ?? new Set();
  set.add(fn);
  listeners.set(scope, set);
  return () => set.delete(fn);
}

let bridged = false;

export function startDataBridge() {
  if (bridged || typeof window === "undefined") return;
  bridged = true;
  // Backend jobs (indexing, sync) name the scope they changed.
  if (isTauri()) {
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<{ scope: string }>("eu://invalidate", (e) => {
        const scope = e.payload.scope;
        if (scope in SCOPE_KEYS) changed(scope as Scope);
        else void queryClient.invalidateQueries({ queryKey: [scope] });
      }),
    );
  }
}
