import { describe, expect, it } from "vitest";
import { TAB_FIT_MIN, TAB_SLOT_PX, fitTabCount } from "./tabs";

describe("fitTabCount", () => {
  it("never goes below the minimum", () => {
    expect(fitTabCount(0)).toBe(TAB_FIT_MIN);
    expect(fitTabCount(Number.NaN)).toBe(TAB_FIT_MIN);
  });

  it("counts whole tabs", () => {
    expect(fitTabCount(TAB_SLOT_PX * 5 + 20)).toBe(5);
  });
});
