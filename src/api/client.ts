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

/**
 * Screens not moved to the data layer yet announce their changes with
 * `eu:*-changed` window events: each one invalidates the queries it covers,
 * so old and new screens stay in step during the migration.
 */
const EVENT_SCOPES: Record<string, string[][]> = {
  "eu:library-changed": [["library"], ["search"]],
  "eu:course-changed": [["courses"]],
  "eu:reminders-changed": [["reminders"]],
  "eu:schedule-changed": [["schedule"]],
  "eu:quicklinks-changed": [["links"]],
  "eu:pronote-changed": [["pronote"], ["schedule"]],
  "eu:keepawake-changed": [["keepAwake"]],
  "eu:settings-changed": [["settings"]],
};

let bridged = false;

export function startDataBridge() {
  if (bridged || typeof window === "undefined") return;
  bridged = true;
  for (const [event, scopes] of Object.entries(EVENT_SCOPES)) {
    window.addEventListener(event, () => {
      for (const queryKey of scopes) void queryClient.invalidateQueries({ queryKey });
    });
  }
  // Backend jobs (indexing, sync) name the scope they changed.
  if (isTauri()) {
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<{ scope: string }>("eu://invalidate", (e) => {
        void queryClient.invalidateQueries({ queryKey: [e.payload.scope] });
      }),
    );
  }
}
