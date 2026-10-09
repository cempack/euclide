import { useEffect } from "react";
import { api, isTauri } from "../lib/api";
import { fmt, tr } from "../lib/i18n";
import { afterCommit, editors } from "../stores/editors";
import { saveTabSession, tabs } from "../stores/tabs";
import { logged } from "../lib/report";
import type { useConfirm, useToast } from "../components/ui";

type Confirm = ReturnType<typeof useConfirm>;
type Toast = ReturnType<typeof useToast>;

const dirtyIds = () => Object.keys(editors.dirtyMap());

/**
 * Before the window closes: notes finish their pending autosave without a
 * word; whatever else is unsaved (a whiteboard, a script) is the teacher's
 * call. True when Euclide may quit.
 */
async function readyToQuit(confirm: Confirm, toast: Toast): Promise<boolean> {
  const kindOf = new Map(tabs.list().map((t) => [t.id, t.kind]));
  await Promise.allSettled(
    dirtyIds()
      .filter((id) => kindOf.get(id) === "note")
      .map(editors.flush),
  );
  await afterCommit();

  const left = dirtyIds();
  if (!left.length) return true;
  const names = left.map((id) => tabs.list().find((t) => t.id === id)?.title ?? id).join(", ");
  const choice = await confirm.dirty({
    title: tr("confirm.quitTitle"),
    message: fmt(left.length === 1 ? tr("confirm.quitMessageOne") : tr("confirm.quitMessage"), { names }),
  });
  if (choice === "cancel") return false;
  if (choice === "discard") return true;

  const results = await Promise.allSettled(left.map(editors.flush));
  await afterCommit();
  if (results.some((r) => r.status === "rejected") || dirtyIds().length) {
    toast(tr("confirm.quitFailed"), "error");
    return false;
  }
  return true;
}

/** Answers the window's close button (src-tauri/src/exit.rs). */
export function useExitGuard(confirm: Confirm, toast: Toast) {
  useEffect(() => {
    if (!isTauri()) return;
    let handling = false;
    let stopped = false;
    let unlisten: (() => void) | undefined;
    const onRequest = async (request: number) => {
      // Say so at once: past two seconds without an answer, Rust quits anyway.
      api.closeAck(request).catch(logged("exit.closeAck"));
      if (handling) return;
      handling = true;
      try {
        if (await readyToQuit(confirm, toast)) {
          // Saving a new note renames its tab: reopen on what was really open.
          await saveTabSession();
          await api.appExit();
        }
      } finally {
        handling = false;
      }
    };
    void import("@tauri-apps/api/event")
      .then(({ listen }) => listen<number>("eu://close-requested", (e) => void onRequest(e.payload)))
      .then((u) => {
        if (stopped) u();
        else unlisten = u;
      });
    return () => {
      stopped = true;
      unlisten?.();
    };
  }, [confirm, toast]);
}
