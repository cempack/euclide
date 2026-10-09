import { afterCommit, editors } from "../stores/editors";
import { tabs } from "../stores/tabs";
import { errorMessage } from "../lib/errors";
import { tr } from "../lib/i18n";
import { reportError } from "../lib/report";
import type { useConfirm, useToast } from "../components/ui";

type Confirm = ReturnType<typeof useConfirm>;
type Toast = ReturnType<typeof useToast>;

/**
 * Saves the editor in tab `id`. Saving a new note or board gives its tab a
 * new id, so the tab is found again by its mountId, which never changes.
 * Resolves to the tab's id once nothing in it is left unsaved, else null;
 * throws what the save threw.
 */
export async function saveTab(id: string): Promise<string | null> {
  const mountId = tabs.list().find((t) => t.id === id)?.mountId;
  await editors.flush(id);
  await afterCommit();
  const now = tabs.list().find((t) => t.mountId === mountId)?.id ?? id;
  return editors.isDirty(now) ? null : now;
}

/** A tab's close button, Ctrl+W: what is unsaved is the teacher's call. */
export async function closeTab(id: string, confirm: Confirm, toast: Toast): Promise<void> {
  if (!editors.isDirty(id)) {
    tabs.close(id);
    return;
  }
  const choice = await confirm.dirty({
    title: tr("confirm.unsavedTitle"),
    message: tr("confirm.unsavedMessage"),
  });
  if (choice === "cancel") return;
  if (choice === "discard") {
    tabs.close(id, { discard: true });
    return;
  }
  try {
    const saved = await saveTab(id);
    if (saved) tabs.close(saved);
    else toast(tr("confirm.closeFailed"), "error");
  } catch (err) {
    reportError("tabs.closeSave", err);
    toast(errorMessage(err, tr("messages.genericError")), "error");
  }
}

/** Ctrl+S: « Enregistré » only once everything in the tab is. */
export async function saveActiveTab(toast: Toast): Promise<void> {
  const id = tabs.activeId();
  if (!editors.isDirty(id)) return;
  try {
    const saved = await saveTab(id);
    toast(saved ? tr("messages.saved") : tr("messages.notSaved"), saved ? "success" : "error");
  } catch (err) {
    reportError("editor.save", err);
    toast(errorMessage(err, tr("messages.genericError")), "error");
  }
}
