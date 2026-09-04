import { useMemo, useState } from "react";

import { getFaviconUrl } from "../lib/format";
import { domainBadge } from "../lib/color";
import { useAppearance } from "../lib/theme";

/** Missing or any value other than `"0"` means remote favicons are on. */
export function remoteFaviconsEnabled(raw: string | null | undefined): boolean {
  return raw !== "0";
}

/**
 * Site mark for a quick link.
 *
 * Remote favicons are on by default (« Icônes de sites distantes »). Opting
 * out draws a local domain badge and never hits the network.
 */
export function Favicon({
  url,
  className = "w-5 h-5",
  remote = true,
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
