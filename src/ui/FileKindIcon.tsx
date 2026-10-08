import { FileText, Image, PenLine } from "lucide-react";
import { Icon } from "./Icon";

/** A document's glyph by kind: an image, a board, else a page. */
export function FileKindIcon({ kind, className = "w-5 h-5" }: { kind: string; className?: string }) {
  const glyph = kind === "image" ? Image : kind === "board" || kind === "whiteboard" ? PenLine : FileText;
  return <Icon icon={glyph} size={20} className={className} />;
}
