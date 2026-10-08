import { describe, expect, it } from "vitest";
import { compile } from "./expr";

const at = (src: string, x: number) => {
  const c = compile(src);
  if (!c.ok) throw new Error(c.error);
  return c.f(x);
};

describe("compile", () => {
  it("reads what a class writes", () => {
    expect(at("f(x) = 2x² - 3x + 1", 2)).toBe(3);
    expect(at("y = 0,5x + 1", 4)).toBe(3);
    expect(at("3(x+1)", 2)).toBe(9);
    expect(at("x(x−1)", 3)).toBe(6);
    expect(at("√x", 9)).toBe(3);
    expect(at("racine(x+7)", 9)).toBe(4);
    expect(at("2^x", 3)).toBe(8);
    expect(at("-x^2", 3)).toBe(-9);
    expect(at("1/x", 4)).toBe(0.25);
    expect(at("x ÷ 2 × 3", 4)).toBe(6);
    expect(at("abs(x) - 1", -3)).toBe(2);
    expect(at("ln(e)", 0)).toBeCloseTo(1);
    expect(at("sin(pi/2)", 0)).toBeCloseTo(1);
    expect(at("2sin x", Math.PI / 2)).toBeCloseTo(2);
    expect(at("3", 10)).toBe(3);
  });

  it("explains what is wrong, in French", () => {
    for (const bad of ["", "2x +", "(x + 1", "x $ 2", "cosh(x)"]) {
      const c = compile(bad);
      expect(c.ok).toBe(false);
      if (!c.ok) expect(c.error.length).toBeGreaterThan(5);
    }
  });
});
