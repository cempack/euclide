/**
 * Pictures in a note. A picture of the library is written
 * `![légende](eufile://file/<id>)`: the same text on every system, turned
 * into the webview's address only when the note is shown (lib/api.ts,
 * fileUrl). `![légende|300](…)` sets its width in pixels, `|50%` in percent
 * of the text's width.
 */
const LIBRARY_FILE = /^eufile:\/\/file\/(\d+)$/;

export const libraryImageUrl = (id: number) => `eufile://file/${id}`;

/** The library file a picture's address names, or null. */
export function libraryFileId(url: string): number | null {
  const m = LIBRARY_FILE.exec(url);
  return m ? Number(m[1]) : null;
}

/** The text of a picture's `[…]`, and the width set after a `|`. */
export function imageSize(alt: string): { text: string; width?: string } {
  const m = /^(.*?)\s*\|\s*(\d{1,4})\s*(%?)\s*$/.exec(alt);
  if (!m || Number(m[2]) === 0) return { text: alt };
  return { text: m[1], width: m[3] ? `${Math.min(100, Number(m[2]))}%` : `${m[2]}px` };
}

/** `![légende](eufile://file/<id>)`, its `[`, `]` and `\` escaped. */
export function imageMarkdown(id: number, caption = ""): string {
  return `![${caption.replace(/[[\]\\]/g, "\\$&")}](${libraryImageUrl(id)})`;
}

export const isImageName = (name: string) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);

/** The pictures a note or the board takes: those the webview shows on every system. */
export const PICTURE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/svg+xml",
];

/**
 * The pictures among what was pasted: `files` in Chromium (Windows), only
 * `items` in some WebKit builds (Linux).
 */
export function pastedPictures(data: DataTransfer): File[] {
  const files = data.files.length
    ? Array.from(data.files)
    : Array.from(data.items, (item) => item.getAsFile()).filter((f): f is File => f != null);
  return files.filter((f) => PICTURE_TYPES.includes(f.type));
}

/** A note's title as a file name: what Windows refuses becomes « - ». */
export function fileStem(title: string): string {
  const clean = title
    .trim()
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\p{Cc}/gu, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .trim();
  return clean || "Note";
}

/** The extension of a picture's type (« image/png » → « png »). */
export function imageExtension(type: string): string {
  const sub = type.split("/")[1]?.split(/[;+]/)[0].toLowerCase() ?? "";
  if (sub === "jpeg") return "jpg";
  return ["png", "gif", "webp", "bmp", "svg"].includes(sub) ? sub : "png";
}

/**
 * `text` padded with line breaks so it stands as a block of its own (a
 * picture, a table) between `before` and `after`: a blank line on each side,
 * none added at the start or the end of the note.
 */
export function asBlock(before: string, text: string, after: string): string {
  const lead = !before || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const tail = !after || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  return lead + text + tail;
}
