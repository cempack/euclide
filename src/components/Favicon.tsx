import { useState } from "react";

import { getFaviconUrl } from "../lib/format";
import { LinkIcon } from "./icons";

export function Favicon({ url, className = "w-5 h-5" }: { url: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const favicon = getFaviconUrl(url);

  if (!favicon || failed) {
    return <LinkIcon className={className} />;
  }

  return (
    <img
      src={favicon}
      className={`${className} object-contain`}
      onError={() => setFailed(true)}
      alt=""
      loading="lazy"
    />
  );
}
