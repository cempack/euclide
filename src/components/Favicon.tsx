import { useMemo, useState } from "react";

import { getFaviconUrl } from "../lib/format";
import { domainBadge } from "../lib/color";
import { useAppearance } from "../lib/theme";

/**
 * Site mark for a quick link.
 *
 * Local by default: a deterministic badge derived from the domain, so the
 * library looks the same on a classroom machine with no network as it does
 * online — and Euclide stops calling Google's favicon service on every render.
 * Remote favicons remain available behind the « Icônes de sites distantes »
 * setting (Réglages → Apparence).
 */
export function Favicon({
  url,
  className = "w-5 h-5",
  remote = false,
}: {
  url: string;
  className?: string;
  remote?: boolean;
}) {
  const { resolved } = useAppearance();
  const [failed, setFailed] = useState(false);
  const badge = useMemo(() => domainBadge(url, resolved === "dark"), [url, resolved]);
  const favicon = remote ? getFaviconUrl(url) : null;

  if (favicon && !failed) {
    return (
      <img
        src={favicon}
        className={`${className} object-contain rounded-sm`}
        onError={() => setFailed(true)}
        alt=""
        loading="lazy"
      />
    );
  }

  return (
    <span
      aria-hidden
      title={badge.host}
      className={`${className} shrink-0 grid place-items-center rounded-sm font-mono font-semibold leading-none`}
      style={{ background: badge.bg, color: badge.fg, fontSize: "0.6em" }}
    >
      {badge.initials}
    </span>
  );
}
