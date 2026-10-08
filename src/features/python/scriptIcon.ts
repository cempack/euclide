import { ChartSpline, CodeXml, Keyboard, ListChecks, Turtle, type LucideIcon } from "lucide-react";

/** What a script does, at a glance: draws, plots, is checked, asks, or computes. */
export function scriptIcon(code: string): LucideIcon {
  if (/^\s*(from\s+turtle\s+import|import\s+turtle)\b/m.test(code)) return Turtle;
  if (/\bmatplotlib\b/.test(code)) return ChartSpline;
  if (/^\s*>>>/m.test(code)) return ListChecks;
  if (/\binput\s*\(/.test(code)) return Keyboard;
  return CodeXml;
}
