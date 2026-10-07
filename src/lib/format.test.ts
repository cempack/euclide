import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatDueLabel,
  humanMinutes,
  localYmd,
  localYmdToIso,
  minutesRemaining,
  minutesUntil,
} from "./format";

describe("humanMinutes", () => {
  it("writes French durations", () => {
    expect(humanMinutes(5)).toBe("5 min");
    expect(humanMinutes(60)).toBe("1 h");
    expect(humanMinutes(65)).toBe("1 h 05");
    expect(humanMinutes(-3)).toBe("0 min");
  });
});

describe("local dates", () => {
  it("formats the local day, not the UTC one", () => {
    expect(localYmd(new Date(2026, 9, 6, 23, 30))).toBe("2026-10-06");
    expect(localYmd(new Date(2026, 9, 31), 1)).toBe("2026-11-01");
  });

  it("stores a picked day as the end of that local day", () => {
    const iso = localYmdToIso("2026-10-06")!;
    const back = new Date(iso);
    expect([back.getFullYear(), back.getMonth(), back.getDate(), back.getHours()]).toEqual([2026, 9, 6, 23]);
    expect(localYmdToIso("06/10/2026")).toBeNull();
  });
});

describe("class timing", () => {
  const now = new Date(2026, 9, 6, 10, 40);
  it("counts minutes until a class starts and until it ends", () => {
    expect(minutesUntil("11:00", now)).toBe(20);
    expect(minutesRemaining({ start_time: "10:15", end_time: "11:15" }, now)).toBe(35);
  });
});

describe("formatDueLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 6, 10, 0));
  });
  afterEach(() => vi.useRealTimers());

  const at = (days: number, hours = 12) => new Date(2026, 9, 6 + days, hours).toISOString();

  it("names today, tomorrow and late", () => {
    expect(formatDueLabel(at(0, 17))).toEqual({ text: "aujourd'hui", tone: "soon" });
    expect(formatDueLabel(at(1, 8))).toEqual({ text: "demain", tone: "soon" });
    expect(formatDueLabel(at(-1))).toEqual({ text: "en retard", tone: "over" });
    expect(formatDueLabel(at(3)).text).toBe("dans 3j");
  });

  it("reads SQLite timestamps as UTC", () => {
    const sqlite = new Date(2026, 9, 7, 12).toISOString().slice(0, 19).replace("T", " ");
    expect(formatDueLabel(sqlite).text).toBe("demain");
  });

  it("ignores empty and invalid dates", () => {
    expect(formatDueLabel(null).text).toBe("");
    expect(formatDueLabel("pas une date").text).toBe("");
  });
});
