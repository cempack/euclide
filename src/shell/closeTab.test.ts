import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editors } from "../stores/editors";
import { tabs, useTabsStore } from "../stores/tabs";
import { closeTab, saveActiveTab, saveTab } from "./closeTab";
import type { useConfirm, useToast } from "../components/ui";

type Confirm = ReturnType<typeof useConfirm>;
type Toast = ReturnType<typeof useToast>;

const answer = (choice: "save" | "discard" | "cancel") =>
  ({ dirty: vi.fn(async () => choice) }) as unknown as Confirm;

/** A new note that saves as the editor does: the tab takes the note's id. */
function newNote(saves = true): string {
  const tmp = tabs.open({ kind: "note", params: { isNew: true } });
  editors.setDirty(tmp, true);
  const unregister = editors.registerFlush(tmp, async () => {
    if (!saves) return;
    tabs.retarget(tmp, "note:9", "Nouvelle note", { noteId: 9, isNew: false });
    editors.setDirty("note:9", false);
  });
  cleanups.push(
    unregister,
    () => editors.forget("note:9"),
    () => editors.forget(tmp),
  );
  return tmp;
}

let cleanups: (() => void)[] = [];
let toast: Toast & ReturnType<typeof vi.fn>;

beforeEach(() => {
  useTabsStore.setState({
    tabs: [
      { id: "dashboard", kind: "dashboard", title: "Tableau de bord", params: {}, mountId: "dashboard" },
    ],
    activeId: "dashboard",
    maxTabsMode: "unlimited",
    maxTabsFixed: 12,
    tabFitCapacity: 0,
  });
  toast = vi.fn() as unknown as Toast & ReturnType<typeof vi.fn>;
});

afterEach(() => {
  for (const fn of cleanups) fn();
  cleanups = [];
});

describe("closeTab", () => {
  it("closes a new note's tab after saving it, though saving changed the tab's id", async () => {
    const tmp = newNote();
    await closeTab(tmp, answer("save"), toast);
    expect(tabs.list().map((t) => t.id)).toEqual(["dashboard"]);
    expect(toast).not.toHaveBeenCalled();
  });

  it("keeps the tab open, and says so, when the save left changes behind", async () => {
    const tmp = newNote(false);
    await closeTab(tmp, answer("save"), toast);
    expect(tabs.list().some((t) => t.id === tmp)).toBe(true);
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("reste ouvert"), "error");
  });

  it("closes without saving on « Ne pas enregistrer » and stays on « Annuler »", async () => {
    const tmp = newNote();
    await closeTab(tmp, answer("cancel"), toast);
    expect(tabs.list().some((t) => t.id === tmp)).toBe(true);
    await closeTab(tmp, answer("discard"), toast);
    expect(tabs.list().map((t) => t.id)).toEqual(["dashboard"]);
    expect(editors.takeDiscarded(tmp)).toBe(true);
  });

  it("closes a tab with nothing unsaved without asking", async () => {
    const docs = tabs.open({ kind: "documents" });
    const confirm = answer("cancel");
    await closeTab(docs, confirm, toast);
    expect(tabs.list().map((t) => t.id)).toEqual(["dashboard"]);
    expect(confirm.dirty).not.toHaveBeenCalled();
  });
});

describe("saving", () => {
  it("follows the tab to its new id", async () => {
    const tmp = newNote();
    expect(await saveTab(tmp)).toBe("note:9");
  });

  it("says « Enregistré » only when everything is", async () => {
    newNote(false);
    await saveActiveTab(toast);
    expect(toast).toHaveBeenLastCalledWith(expect.not.stringMatching(/^Enregistré$/), "error");
    newNote();
    await saveActiveTab(toast);
    expect(toast).toHaveBeenLastCalledWith("Enregistré", "success");
  });
});
