import { describe, expect, it } from "vitest";
import { displayMath } from "./math";

describe("displayMath", () => {
  it("puts the dollars of a one-line formula on lines of their own", () => {
    expect(displayMath("Soit\n\n$$a^2 - b^2 = (a-b)(a+b)$$\n\nfin")).toBe(
      "Soit\n\n$$\na^2 - b^2 = (a-b)(a+b)\n$$\n\nfin",
    );
  });

  it("keeps the quote around a formula", () => {
    expect(displayMath("> $$ x $$")).toBe("> $$\n> x\n> $$");
  });

  it("leaves inline formulas, several on a line, and code alone", () => {
    expect(displayMath("on a $$x$$ dans la phrase")).toBe("on a $$x$$ dans la phrase");
    expect(displayMath("$$a$$ et $$b$$")).toBe("$$a$$ et $$b$$");
    const code = "```\n$$x$$\n```\n$$y$$";
    expect(displayMath(code)).toBe("```\n$$x$$\n```\n$$\ny\n$$");
    expect(displayMath("````\n```\n$$x$$\n````")).toBe("````\n```\n$$x$$\n````");
  });

  it("does not touch notes without $$", () => {
    const md = "# Titre\n\n$x$";
    expect(displayMath(md)).toBe(md);
  });
});
