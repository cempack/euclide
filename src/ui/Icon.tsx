import type { LucideIcon, LucideProps } from "lucide-react";

/**
 * Every icon in Euclide: lucide glyphs at one stroke weight, in three sizes —
 * 14 (dense rows, chips), 16 (buttons, navigation), 20 (headers, empty states).
 * Decorative by default; give the button around it the accessible name.
 */
export type IconSize = 14 | 16 | 20;

export type IconProps = Omit<LucideProps, "size" | "ref"> & {
  icon: LucideIcon;
  size?: IconSize;
};

export const ICON_STROKE = 1.75;

export function Icon({ icon: Glyph, size = 16, ...rest }: IconProps) {
  return <Glyph size={size} strokeWidth={ICON_STROKE} aria-hidden focusable={false} {...rest} />;
}
