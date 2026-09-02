#!/usr/bin/env node
/**
 * Pre-seed Tauri's linuxdeploy GTK plugin so it strips bundled libwayland-*.
 *
 * linuxdeploy copies Ubuntu's libwayland-{client,cursor,egl,server} into the
 * AppImage. On Arch/Hyprland (and other hosts with a newer Mesa) those stale
 * copies talk to the host EGL stack and WebKit aborts:
 *   Could not create surfaceless EGL display: EGL_BAD_ALLOC
 *
 * libwayland's soname has been stable for years; it must come from the host,
 * same as libGL/libEGL (which linuxdeploy already excludes).
 *
 * Tauri only downloads linuxdeploy-plugin-gtk.sh when the cache file is
 * missing, so we copy/patch it before `tauri build`. No-op on non-Linux.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

const MARKER = "euclide-unbundle-wayland";
const SNIPPET = `
# ${MARKER}: libwayland must come from the host so it matches Mesa/EGL.
if [ -n "\${APPDIR:-}" ]; then
  find "\$APPDIR" -name 'libwayland-*.so*' -delete 2>/dev/null || true
fi
`;

if (platform() !== "linux") {
  process.exit(0);
}

const cache = join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "tauri");
mkdirSync(cache, { recursive: true });
const dest = join(cache, "linuxdeploy-plugin-gtk.sh");
const url =
  "https://raw.githubusercontent.com/tauri-apps/linuxdeploy-plugin-gtk/master/linuxdeploy-plugin-gtk.sh";

if (!existsSync(dest)) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`seed-linuxdeploy-gtk: download failed (${res.status}); skipping`);
      process.exit(0);
    }
    writeFileSync(dest, await res.text());
  } catch (err) {
    console.warn(`seed-linuxdeploy-gtk: ${err?.message || err}; skipping`);
    process.exit(0);
  }
}

const body = readFileSync(dest, "utf8");
if (!body.includes(MARKER)) {
  writeFileSync(dest, `${body.trimEnd()}\n${SNIPPET}`);
}
chmodSync(dest, 0o755);
console.log(`seed-linuxdeploy-gtk: ${dest}`);
