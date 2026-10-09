import { useEffect, useState } from "react";
import { tr } from "../lib/i18n";
import { modulesPath, qrModules, type Modules } from "./qr";

/**
 * A QR code of `text`, black on paper whatever the theme, so a phone reads
 * it off a projector. Says so when the text is too long for one.
 */
export function QrCode({ text, className = "" }: { text: string; className?: string }) {
  // The modules belong to the text they were made for: another text shows
  // nothing until its own are ready.
  const [made, setMade] = useState<{ text: string; modules: Modules | null } | null>(null);
  useEffect(() => {
    let live = true;
    void qrModules(text).then((modules) => {
      if (live) setMade({ text, modules });
    });
    return () => {
      live = false;
    };
  }, [text]);

  if (made?.text !== text) return <div className={`eu-qr ${className}`} aria-busy="true" />;
  if (!made.modules) return <p className="eu-qr-too-long">{tr("scene.qrTooLong")}</p>;
  const n = made.modules.length;
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      className={`eu-qr ${className}`}
      role="img"
      aria-label={tr("scene.qrLabel", { text })}
      shapeRendering="crispEdges"
    >
      <path d={modulesPath(made.modules)} />
    </svg>
  );
}
