import { describe, expect, it } from "vitest";
import { contrast, courseVisual, domainBadge, parseColor } from "./color";
import { COURSE_COLORS } from "../components/ui";

const LIGHT_CANVAS = { r: 250, g: 249, b: 248 };
const DARK_PANEL = { r: 25, g: 25, b: 25 };

describe("courseVisual", () => {
  it.each(COURSE_COLORS)("keeps %s legible in both themes", (color) => {
    expect(contrast(parseColor(courseVisual(color, false).fg)!, LIGHT_CANVAS)).toBeGreaterThanOrEqual(3.5);
    expect(contrast(parseColor(courseVisual(color, true).fg)!, DARK_PANEL)).toBeGreaterThanOrEqual(3.5);
  });

  it("falls back to a neutral colour", () => {
    expect(courseVisual("not a colour", false).fg).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("domainBadge", () => {
  it("is deterministic and ignores www", () => {
    const a = domainBadge("https://www.geogebra.org/classic", false);
    expect(a).toEqual(domainBadge("geogebra.org", false));
    expect(a.initials).toBe("GE");
    expect(a.host).toBe("geogebra.org");
  });
});
