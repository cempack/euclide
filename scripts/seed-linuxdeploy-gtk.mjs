#!/usr/bin/env node
/**
 * Pre-seed Tauri's linuxdeploy GTK plugin:
 *
 * 1. Do not generate `export GDK_BACKEND=x11` in the AppRun hook. On Wayland
 *    that forces X11 EGL for the Ubuntu WebKit shipped in the AppImage, which
 *    aborts: Could not create surfaceless EGL display: EGL_BAD_ALLOC.
 * 2. Default WEBKIT_DISABLE_DMABUF_RENDERER / WEBKIT_DISABLE_COMPOSITING_MODE
 *    in that same hook so they exist before the binary (and GTK) start.
 * 3. Strip bundled libwayland-*.so* so the host Mesa/EGL stack is used.
 *
 * Tauri only downloads linuxdeploy-plugin-gtk.sh when the cache file is
 * missing, so we copy/patch it before `tauri build`. No-op on non-Linux.
 *
 * `node scripts/seed-linuxdeploy-gtk.mjs --self-test` checks the patcher.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const WAYLAND_MARKER = "euclide-unbundle-wayland";
const WEBKIT_MARKER = "euclide-webkit-env";

const GDK_EXPORT_RE = /^export GDK_BACKEND=x11[^\n]*$/m;

const WEBKIT_HOOK = `\
# ${WEBKIT_MARKER}: do not force X11 on Wayland. Ubuntu WebKit + X11 EGL aborts
# with EGL_BAD_ALLOC on current Mesa. Skip the bundled WebKit GPU path.
if [ -z "\${WAYLAND_DISPLAY:-}" ] && [ -z "\${WAYLAND_SOCKET:-}" ]; then
  export GDK_BACKEND="\${GDK_BACKEND:-x11}"
fi
export WEBKIT_DISABLE_DMABUF_RENDERER="\${WEBKIT_DISABLE_DMABUF_RENDERER:-1}"
export WEBKIT_DISABLE_COMPOSITING_MODE="\${WEBKIT_DISABLE_COMPOSITING_MODE:-1}"`;

const WAYLAND_SNIPPET = `
# ${WAYLAND_MARKER}: libwayland must come from the host so it matches Mesa/EGL.
if [ -n "\${APPDIR:-}" ]; then
  find "\$APPDIR" -name 'libwayland-*.so*' -delete 2>/dev/null || true
fi
`;

export function patchLinuxdeployGtk(body) {
  let out = body;
  if (GDK_EXPORT_RE.test(out)) {
    out = out.replace(GDK_EXPORT_RE, WEBKIT_HOOK);
  }
  if (!out.includes(WAYLAND_MARKER)) {
    out = `${out.trimEnd()}\n${WAYLAND_SNIPPET}`;
  }
  return out;
}

function selfTest() {
  const sample = [
    "cat > \"$HOOKFILE\" <<\\EOF",
    "#! /usr/bin/env bash",
    "export GDK_BACKEND=x11 # Crash with Wayland backend on Wayland - We tested it without it and ended up with this: https://github.com/tauri-apps/tauri/issues/8541",
    "export XDG_DATA_DIRS=\"$APPDIR/usr/share:/usr/share:$XDG_DATA_DIRS\"",
    "EOF",
    "",
  ].join("\n");
  const out = patchLinuxdeployGtk(sample);
  const failures = [];
  if (/^export GDK_BACKEND=x11/m.test(out)) {
    failures.push("still forces GDK_BACKEND=x11");
  }
  if (!out.includes(WEBKIT_MARKER)) {
    failures.push("missing webkit env marker");
  }
  if (!out.includes("WEBKIT_DISABLE_COMPOSITING_MODE")) {
    failures.push("missing WEBKIT_DISABLE_COMPOSITING_MODE");
  }
  if (!out.includes(WAYLAND_MARKER)) {
    failures.push("missing wayland unbundle snippet");
  }
  const closeEof = out.lastIndexOf("\nEOF");
  if (closeEof < 0 || out.indexOf(WEBKIT_MARKER) > closeEof) {
    failures.push("webkit hook landed outside the generated AppRun hook");
  }
  const again = patchLinuxdeployGtk(out);
  if (again !== out && patchLinuxdeployGtk(again) !== again) {
    failures.push("patch is not stable on re-run");
  }
  if (failures.length) {
    console.error(`seed-linuxdeploy-gtk self-test failed: ${failures.join("; ")}`);
    process.exit(1);
  }
  console.log("seed-linuxdeploy-gtk: self-test ok");
}

async function seedCache() {
  if (platform() !== "linux") {
    return;
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
        return;
      }
      writeFileSync(dest, await res.text());
    } catch (err) {
      console.warn(`seed-linuxdeploy-gtk: ${err?.message || err}; skipping`);
      return;
    }
  }

  const before = readFileSync(dest, "utf8");
  const after = patchLinuxdeployGtk(before);
  if (after !== before) {
    writeFileSync(dest, after);
  }
  chmodSync(dest, 0o755);
  console.log(`seed-linuxdeploy-gtk: ${dest}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (process.argv.includes("--self-test")) {
    selfTest();
  } else {
    await seedCache();
  }
}
