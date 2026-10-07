import { describe, expect, it } from "vitest";
import { TAB_FIT_MIN, TAB_SLOT_PX, fitTabCount, parseSession, parseTabLimit } from "./tabs";

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
