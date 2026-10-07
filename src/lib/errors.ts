/**
 * Backend errors arrive as `{ code, message }` (src-tauri/src/error.rs), with
 * `message` already in French. Commands not yet converted, plugins and JS
 * exceptions may still produce strings or `Error` objects: these helpers read
 * all of them.
 */

export function errorCode(err: unknown): string | null {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return null;
}

/** The message to show the teacher, or `fallback` when there is none. */
export function errorMessage(err: unknown, fallback = "Une erreur est survenue."): string {
  let msg = "";
  if (typeof err === "string") msg = err;
  // A TypeError and the like is a bug, in English: the teacher gets the fallback.
  else if (err instanceof Error) msg = err.name === "Error" ? err.message : "";
  else if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string") msg = m;
  }
  // Older commands sometimes returned a JSON-quoted string.
  msg = msg.trim().replace(/^"+|"+$/g, "");
  return msg || fallback;
}
