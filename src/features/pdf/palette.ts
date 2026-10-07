import type { StringKey } from "../../lib/i18n";

/** Pen and note colours: dark enough to read on paper, as in the board. */
export const INK: { value: string; label: StringKey }[] = [
  { value: "#111213", label: "colors.black" },
  { value: "#0f4fa8", label: "colors.blue" },
  { value: "#c0262d", label: "colors.red" },
  { value: "#116b2e", label: "colors.green" },
  { value: "#c2410c", label: "colors.orange" },
  { value: "#7c3aed", label: "colors.purple" },
];

/** Highlighter colours: light, the text shows through. */
export const HIGHLIGHT: { value: string; label: StringKey }[] = [
  { value: "#fff066", label: "colors.yellow" },
  { value: "#53ffbc", label: "colors.green" },
  { value: "#80ebff", label: "colors.blue" },
  { value: "#ffcbe6", label: "colors.pink" },
];
