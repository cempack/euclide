/**
 * Colour helpers.
 *
 * Course colours are *user data*, not theme tokens: they are stored per course
 * in SQLite and may be any value chosen over the life of the app. So instead of
 * trusting them, we derive presentable values at render time:
 *   - `courseVisual()` returns a glyph colour that stays legible and a tint for
 *     the surface behind it, adjusted for the active theme;
 *   - `domainBadge()` builds a stable local badge for a URL, so quick links no
 *     longer need a request to Google's favicon service (Euclide is offline).
 *
 * Everything is plain arithmetic — no `color-mix()`, which is not available on
 * the older WebKitGTK builds found on school Linux machines.
 */

export type Rgb = { r: number; g: number; b: number };

export function parseColor(input: string | null | undefined): Rgb | null {
  if (!input) return null;
  const s = input.trim();
  const hex = s.startsWith("#") ? s.slice(1) : s;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(s);
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  return null;
}

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = Math.max(0, Math.min(1, amount));
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/** Relative luminance (WCAG). */
export function luminance({ r, g, b }: Rgb): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export type CourseVisual = {
  /** Glyph / spine colour, legible on the current theme. */
  fg: string;
  /** Soft surface behind the glyph. */
  tint: string;
  /** Hairline for that surface. */
  border: string;
};

const FALLBACK: Rgb = { r: 92, g: 95, b: 99 };

/**
 * Adapt a stored course colour to the active theme.
 * Light: darken pale colours until they carry at least ~3.5:1 on paper.
 * Dark: lighten them, since mid-tones sink into the canvas.
 */
export function courseVisual(color: string | null | undefined, dark: boolean): CourseVisual {
  const base = parseColor(color) ?? FALLBACK;
  const canvas: Rgb = dark ? { r: 25, g: 25, b: 25 } : { r: 250, g: 249, b: 248 };

  let fg = base;
  for (let i = 0; i < 8 && contrast(fg, canvas) < 3.6; i++) {
    fg = mix(fg, dark ? WHITE : BLACK, 0.12);
  }

  return {
    fg: toHex(fg),
    tint: `rgba(${clamp(base.r)}, ${clamp(base.g)}, ${clamp(base.b)}, ${dark ? 0.2 : 0.13})`,
    border: `rgba(${clamp(base.r)}, ${clamp(base.g)}, ${clamp(base.b)}, ${dark ? 0.34 : 0.28})`,
  };
}

// ---------------------------------------------------------------------------
// Local site badges (replaces the remote favicon service)
// ---------------------------------------------------------------------------

const BADGE_HUES = [210, 158, 28, 268, 340, 190, 96, 12, 240, 130];

export type SiteBadge = { initials: string; fg: string; bg: string; host: string };

/**
 * Deterministic badge for a URL: same site always gets the same colour, and it
 * works with no network. Initials come from the registrable-ish domain label.
 */
export function domainBadge(url: string, dark: boolean): SiteBadge {
  let host = "";
  try {
    host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    host = url;
  }
  const clean = host.replace(/^www\./, "");
  const label = clean.split(".")[0] || clean || "?";
  const initials = label.slice(0, 2).toUpperCase();

  let sum = 0;
  for (let i = 0; i < clean.length; i++) sum = (sum * 31 + clean.charCodeAt(i)) % 100000;
  const hue = BADGE_HUES[sum % BADGE_HUES.length];

  return {
    initials,
    host: clean,
    fg: dark ? `hsl(${hue} 62% 76%)` : `hsl(${hue} 58% 30%)`,
    bg: dark ? `hsl(${hue} 42% 18%)` : `hsl(${hue} 62% 94%)`,
  };
}
