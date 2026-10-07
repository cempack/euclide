#!/usr/bin/env node
/**
 * Design lint: keeps the screens on the design system (src/styles.css).
 *
 * Fails on, in src/**\/*.tsx:
 *   - text sizes picked by hand: text-[13px], text-sm… (use a type role:
 *     eu-t-page/title/body/small/caption/label/metric, or text-code);
 *   - Tailwind's default palette: bg-white, text-gray-500… (use the tokens);
 *   - hex colours in class names or inline styles: bg-[#fff], color: "#333".
 *
 * Colours that are data (pen colours, course colours) live in arrays and
 * variables, not in class names or style literals, and are not flagged.
 * Display sizes in rem (text-[4rem]) are allowed: they scale in projection.
 *
 * `node scripts/design-lint.mjs` — exits 1 and lists file:line on a finding.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");

/** Files that are on their way out (replaced in a later milestone). */
const EXEMPT = new Set([]);

const PALETTE =
  "white|black|gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const RULES = [
  {
    re: /\btext-\[\d+(?:\.\d+)?px\]/g,
    why: "text size in px: use a type role (eu-t-*) or a rem size",
  },
  {
    re: /\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b/g,
    why: "Tailwind text size: use a type role (eu-t-*)",
  },
  {
    re: new RegExp(
      `\\b(?:bg|text|border(?:-[trblxy])?|ring|fill|stroke|outline|divide|from|to|via|accent|caret|decoration|placeholder)-(?:${PALETTE})(?:-\\d{2,3})?(?:\\/\\d+)?\\b`,
      "g",
    ),
    why: "Tailwind default palette: use a colour token (ink, panel, stage-*, paper…)",
  },
  {
    re: /-\[#[0-9a-fA-F]{3,8}\]/g,
    why: "hex colour in a class: use a colour token",
  },
  {
    re: /\b(?:color|background|backgroundColor|borderColor|fill|stroke)\s*:\s*["'`]#[0-9a-fA-F]{3,8}["'`]/g,
    why: "hex colour in a style: use a colour token (var(--color-…))",
  },
  {
    re: /eu-t-label\s+normal-case\s+tracking-normal/g,
    why: "label without capitals is the caption role: use eu-t-caption",
  },
];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (name.endsWith(".tsx")) yield path;
  }
}

const findings = [];
for (const path of files(SRC)) {
  const rel = relative(ROOT, path).replaceAll("\\", "/");
  if (EXEMPT.has(rel)) continue;
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) return;
    for (const { re, why } of RULES) {
      for (const m of line.matchAll(re)) findings.push(`${rel}:${i + 1}: ${m[0]} — ${why}`);
    }
  });
}

if (findings.length) {
  console.error(findings.join("\n"));
  console.error(`\n${findings.length} design-lint finding(s).`);
  process.exit(1);
}
console.log("design-lint: ok");
