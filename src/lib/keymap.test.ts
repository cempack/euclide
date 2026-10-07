import { describe, expect, it } from "vitest";
import { matchShortcut } from "./keymap";

const press = (key: string, mods: { ctrl?: boolean; shift?: boolean; code?: string } = {}) =>
  matchShortcut({
    key,
    code: mods.code ?? "",
    ctrlKey: !!mods.ctrl,
    metaKey: false,
    shiftKey: !!mods.shift,
    altKey: false,
  });

describe("matchShortcut", () => {
  it("tells Ctrl+K from Ctrl+Shift+K", () => {
    expect(press("k", { ctrl: true })?.id).toBe("palette");
    expect(press("K", { ctrl: true, shift: true })?.id).toBe("capture");
  });

  it("reads tab digits by physical key, as a French keyboard types them", () => {
    // AZERTY: the « 1 » key without Shift is « & ».
    expect(press("&", { ctrl: true, code: "Digit1" })).toEqual({ id: "gotoTab", digit: 1 });
    expect(press("7", { ctrl: true, code: "Digit7" })).toEqual({ id: "gotoTab", digit: 7 });
  });

  it("accepts a symbol whether or not it needed Shift", () => {
    expect(press("/", { ctrl: true, shift: true, code: "Period" })?.id).toBe("help");
    expect(press(",", { ctrl: true })?.id).toBe("settings");
  });

  it("leaves plain typing and unknown chords alone", () => {
    expect(press("k")).toBeNull();
    expect(press("q", { ctrl: true })).toBeNull();
    expect(press("Escape")?.id).toBe("leaveProjection");
    expect(press("Tab", { ctrl: true, shift: true, code: "Tab" })?.id).toBe("prevTab");
  });
});
