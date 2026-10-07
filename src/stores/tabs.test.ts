import { beforeEach, describe, expect, it } from "vitest";
import { editors } from "./editors";
import {
  TAB_FIT_MIN,
  TAB_SLOT_PX,
  fitTabCount,
  parseSession,
  parseTabLimit,
  tabs,
  useTabsStore,
} from "./tabs";

describe("fitTabCount", () => {
  it("never goes below the minimum", () => {
    expect(fitTabCount(0)).toBe(TAB_FIT_MIN);
    expect(fitTabCount(Number.NaN)).toBe(TAB_FIT_MIN);
  });

  it("counts whole tabs", () => {
    expect(fitTabCount(TAB_SLOT_PX * 5 + 20)).toBe(5);
  });
});

describe("parseSession", () => {
  it("restores the saved tabs, adds the dashboard and keeps the active one", () => {
    const raw = JSON.stringify({
      activeId: "n1",
      tabs: [
        { id: "n1", kind: "note", title: "Pythagore", params: { noteId: 4 }, pinned: true },
        { id: "p1", kind: "pdf", title: "Sans fichier", params: {} },
      ],
    });
    const session = parseSession(raw)!;
    expect(session.tabs.map((t) => t.kind)).toEqual(["dashboard", "note"]);
    expect(session.tabs[1]).toMatchObject({ id: "n1", mountId: "n1", pinned: true });
    expect(session.activeId).toBe("n1");
  });

  it("falls back to the first tab and survives corrupt data", () => {
    const raw = JSON.stringify({ activeId: "gone", tabs: [{ id: "d", kind: "documents", title: "" }] });
    expect(parseSession(raw)?.activeId).toBe("dashboard");
    expect(parseSession("{oops")).toBeNull();
    expect(parseSession(null)).toBeNull();
  });
});

describe("parseTabLimit", () => {
  it("reads the mode and migrates the settings of old versions", () => {
    expect(parseTabLimit("fixed", "12")).toEqual({ mode: "fixed", fixed: 12, migrate: false });
    expect(parseTabLimit(null, "0")).toEqual({ mode: "unlimited", fixed: null, migrate: false });
    expect(parseTabLimit(null, null)).toEqual({ mode: "auto", fixed: null, migrate: true });
    expect(parseTabLimit("fixed", "99").fixed).toBe(30);
  });
});

describe("tabs store", () => {
  const reset = () =>
    useTabsStore.setState({
      tabs: [
        { id: "dashboard", kind: "dashboard", title: "Tableau de bord", params: {}, mountId: "dashboard" },
      ],
      activeId: "dashboard",
      maxTabsMode: "fixed",
      maxTabsFixed: 3,
      tabFitCapacity: 0,
    });
  beforeEach(reset);

  it("reuses a document's tab instead of opening it twice", () => {
    const a = tabs.open({ kind: "pdf", params: { fileId: 7 } });
    tabs.open({ kind: "courses" });
    expect(tabs.open({ kind: "pdf", params: { fileId: 7 } })).toBe(a);
    expect(tabs.list()).toHaveLength(3);
    expect(tabs.activeId()).toBe(a);
  });

  it("makes room by closing the oldest tab that is neither active, pinned nor unsaved", () => {
    tabs.togglePin("dashboard");
    const note = tabs.open({ kind: "note", params: { noteId: 1 } });
    editors.setDirty(note, true);
    tabs.open({ kind: "courses" });
    tabs.setActive(note);
    tabs.open({ kind: "documents" });
    expect(tabs.list().map((t) => t.kind)).toEqual(["dashboard", "note", "documents"]);
    // Nothing can go: the limit gives way rather than lose work.
    tabs.open({ kind: "reminders" });
    expect(tabs.list()).toHaveLength(4);
    editors.forget(note);
  });

  it("moves an unsaved new note's state along when it gets its id", () => {
    const tmp = tabs.open({ kind: "note", params: { isNew: true } });
    editors.setDirty(tmp, true);
    tabs.retarget(tmp, "note:9", "Pythagore", { noteId: 9, isNew: false });
    expect(tabs.activeId()).toBe("note:9");
    expect(tabs.active()).toMatchObject({ title: "Pythagore", params: { noteId: 9 } });
    expect(editors.isDirty(tmp)).toBe(false);
    expect(editors.isDirty("note:9")).toBe(true);
    editors.forget("note:9");
  });

  it("closing the last tab leaves the dashboard, and closing the active one focuses its neighbour", () => {
    const docs = tabs.open({ kind: "documents" });
    tabs.close(docs);
    expect(tabs.activeId()).toBe("dashboard");
    tabs.close("dashboard");
    expect(tabs.list().map((t) => t.kind)).toEqual(["dashboard"]);
  });

  it("closes a deleted file's tabs without letting their editors save it back", () => {
    const board = tabs.open({ kind: "whiteboard", params: { fileId: 5 } });
    tabs.open({ kind: "pdf", params: { fileId: 6 } });
    tabs.closeFile(5);
    expect(tabs.list().some((t) => t.params.fileId === 5)).toBe(false);
    expect(editors.takeDiscarded(board)).toBe(true);
  });

  it("does not touch state when a rename changes nothing", () => {
    const before = tabs.list();
    tabs.rename("dashboard", "Tableau de bord");
    expect(tabs.list()).toBe(before);
  });
});
