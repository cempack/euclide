/**
 * Euclide's mark, « Intersection »: two circles drawn with the compass, and
 * the point where they cross — the first gesture of the Elements. On its
 * blue tile, as on the app's icon (public/logo.svg); small sizes draw it
 * bolder, as public/logo-small.svg does for the favicon.
 */
const TILE = { blue: "#0F4FA8", ink: "#FFFFFF", point: "#A9C8FB" };

export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  const small = size <= 32;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      <rect width="24" height="24" rx="5.4" fill={TILE.blue} />
      <g transform={small ? "translate(2.4 2.1) scale(0.8)" : "translate(4.32 4.32) scale(0.64)"} fill="none">
        <circle cx="8.5" cy="13.2" r="7" stroke={TILE.ink} strokeWidth={small ? 2.3 : 1.9} />
        <circle cx="15.5" cy="13.2" r="7" stroke={TILE.ink} strokeWidth={small ? 2.3 : 1.9} />
        <circle
          cx="12"
          cy="7.14"
          r={small ? 3 : 2.6}
          fill={TILE.point}
          stroke={TILE.blue}
          strokeWidth={small ? 1.3 : 1.2}
        />
      </g>
    </svg>
  );
}
