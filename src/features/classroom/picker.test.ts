import { describe, expect, it } from "vitest";
import {
  below,
  coin,
  drawName,
  makeGroups,
  parseNames,
  randomInt,
  rollDie,
  shuffle,
  type Below,
  type GroupsBy,
} from "./picker";

/** The same draws every run: a small linear congruential generator, read by its high bits. */
function seeded(seed = 7): Below {
  let s = seed;
  return (n) => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return Math.floor((s / 2147483648) * n);
  };
}

const CLASS = Array.from({ length: 25 }, (_, i) => `Élève ${i + 1}`);

describe("drawing names", () => {
  it("draws every name once before any comes back", () => {
    const rand = seeded();
    const drawn: string[] = [];
    for (let i = 0; i < CLASS.length; i++) {
      const name = drawName(CLASS, drawn, rand);
      expect(name).not.toBeNull();
      expect(drawn).not.toContain(name);
      drawn.push(name!);
    }
    expect(new Set(drawn).size).toBe(CLASS.length);
    expect(drawName(CLASS, drawn, rand)).toBeNull();
    // After « Recommencer », every name is back.
    expect(CLASS).toContain(drawName(CLASS, [], rand));
  });

  it("gives every student the same chance", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 5000; i++) {
      const name = drawName(CLASS.slice(0, 5), [])!;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    for (const n of counts.values()) expect(Math.abs(n - 1000)).toBeLessThan(150);
  });
});

describe("groups", () => {
  it("never leaves a student alone with « par 2 »", () => {
    const groups = makeGroups(CLASS, { size: 2 }, seeded());
    expect(groups).toHaveLength(12);
    expect(groups.map((g) => g.length).sort()).toEqual([...Array(11).fill(2), 3]);
  });

  it("keeps sizes one apart at most, and everyone in exactly one group", () => {
    const rand = seeded(3);
    for (let n = 1; n <= 36; n++) {
      const names = CLASS.concat(CLASS.map((s) => `${s} bis`)).slice(0, n);
      const ways: GroupsBy[] = [
        { size: 2 },
        { size: 3 },
        { size: 4 },
        { size: 5 },
        { count: 2 },
        { count: 6 },
      ];
      for (const by of ways) {
        const groups = makeGroups(names, by, rand);
        const sizes = groups.map((g) => g.length);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
        expect(groups.flat().sort()).toEqual(names.slice().sort());
        if ("count" in by) expect(groups).toHaveLength(Math.min(n, by.count));
      }
    }
    expect(makeGroups([], { size: 3 })).toEqual([]);
  });
});

describe("chance", () => {
  it("shuffles into a permutation", () => {
    const out = shuffle(CLASS, seeded());
    expect(out.slice().sort()).toEqual(CLASS.slice().sort());
    expect(out).not.toEqual(CLASS);
  });

  it("rolls, picks a number and tosses a coin within bounds", () => {
    const rand = seeded(11);
    const faces = new Set<number>();
    for (let i = 0; i < 600; i++) {
      const d = rollDie(6, rand);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(6);
      faces.add(d);
      const x = randomInt(10, -3, rand);
      expect(x).toBeGreaterThanOrEqual(-3);
      expect(x).toBeLessThanOrEqual(10);
    }
    expect(faces.size).toBe(6);
    expect(randomInt(4, 4, rand)).toBe(4);
    expect(new Set(Array.from({ length: 50 }, () => coin(rand)))).toEqual(new Set(["pile", "face"]));
    expect(() => randomInt(2.5, 2.7)).toThrow(RangeError);
  });

  it("draws without bias from crypto", () => {
    for (let i = 0; i < 200; i++) {
      const x = below(3);
      expect([0, 1, 2]).toContain(x);
    }
    expect(() => below(0)).toThrow(RangeError);
  });
});

describe("a pasted list", () => {
  it("keeps one name per line, without numbers, bullets, blanks or repeats", () => {
    expect(parseNames("1. DUPONT Léa\n2) Martin  Hugo\n\n- Léa Dupont\n• Zoé\nzoé\n   \r\nNoah")).toEqual([
      "DUPONT Léa",
      "Martin Hugo",
      "Léa Dupont",
      "Zoé",
      "Noah",
    ]);
  });
});
