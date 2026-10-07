// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The colour tokens in styles.css, checked for legibility in both themes:
 * text pairs at WCAG AA (4.5:1), dots and gauges at 3:1 against their surface.
 */
const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function tokens(selector: string): Record<string, [number, number, number]> {
  // The block of `selector` that defines the palette (it sets --eu-canvas).
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(
    ([, sel, body]) => sel.includes(selector) && body.includes("--eu-canvas:"),
  );
  expect(blocks.length, selector).toBe(1);
  const out: Record<string, [number, number, number]> = {};
  for (const [, name, r, g, b] of blocks[0][2].matchAll(/--eu-([a-z-]+):\s*(\d+) (\d+) (\d+);/g)) {
    out[name] = [Number(r), Number(g), Number(b)];
  }
  return out;
}

function luminance([r, g, b]: [number, number, number]): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT: Array<[string, string[]]> = [
  ["ink", ["chrome", "canvas", "panel", "panel-alt"]],
  ["ink-muted", ["chrome", "canvas", "panel", "panel-alt"]],
  ["ink-faint", ["chrome", "canvas", "panel", "panel-alt"]],
  ["accent", ["panel", "accent-soft"]],
  ["ok", ["panel", "ok-soft"]],
  ["warn", ["panel", "warn-soft"]],
  ["danger", ["panel", "danger-soft"]],
  ["on-fill", ["danger-fill"]],
  ["panel", ["ink"]], // primary button
  ["stage-ink", ["stage", "stage-alt"]],
  ["stage-muted", ["stage", "stage-alt"]],
  ["stage-accent", ["stage"]],
  ["stage-danger", ["stage"]],
];

const MARKS: Array<[string, string[]]> = [
  ["ok-solid", ["panel"]],
  ["warn-solid", ["panel"]],
  ["danger-solid", ["panel"]],
];

describe.each([
  ["light", '[data-theme="light"]'],
  ["dark", '[data-theme="dark"]'],
])("%s theme", (_name, selector) => {
  const t = tokens(selector);

  it.each(TEXT)("%s text reads at 4.5:1", (fg, backgrounds) => {
    for (const bg of backgrounds) {
      expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(MARKS)("%s marks stand out at 3:1", (fg, backgrounds) => {
    for (const bg of backgrounds) {
      expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("tells muted text from faint text", () => {
    expect(contrast(t["ink-muted"], t.panel) / contrast(t["ink-faint"], t.panel)).toBeGreaterThan(1.4);
  });
});
