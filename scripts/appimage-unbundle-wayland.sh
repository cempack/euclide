#!/usr/bin/env bash
#
# After a Tauri AppImage build:
#   1. Drop bundled libwayland-* so host Mesa/EGL is used.
#   2. Patch the linuxdeploy GTK AppRun hook: it ships
#      `export GDK_BACKEND=x11`, which on Wayland makes Ubuntu WebKit
#      create a surfaceless EGL display and abort (EGL_BAD_ALLOC).
#   3. Export WEBKIT_DISABLE_DMABUF_RENDERER / COMPOSITING_MODE in that
#      hook so they exist before the binary and GTK start.
#
# Always extract and inspect — even when libwayland is already gone,
# the GDK_BACKEND line must still be removed.
#
# Usage:
#   scripts/appimage-unbundle-wayland.sh [bundle-dir ...]
#   scripts/appimage-unbundle-wayland.sh --self-test
#
set -euo pipefail

WEBKIT_MARKER="euclide-webkit-env"

patch_gtk_runtime_file() {
  local f="$1"
  local changed=0

  if grep -q '^export GDK_BACKEND=x11' "$f" 2>/dev/null; then
    sed -i '/^export GDK_BACKEND=x11/d' "$f"
    changed=1
  fi

  if ! grep -q "$WEBKIT_MARKER" "$f" 2>/dev/null; then
    cat >> "$f" << EOF

# ${WEBKIT_MARKER}: do not force X11 on Wayland. Ubuntu WebKit + X11 EGL aborts
# with EGL_BAD_ALLOC on current Mesa. Skip the bundled WebKit GPU path.
if [ -z "\${WAYLAND_DISPLAY:-}" ] && [ -z "\${WAYLAND_SOCKET:-}" ]; then
  export GDK_BACKEND="\${GDK_BACKEND:-x11}"
fi
export WEBKIT_DISABLE_DMABUF_RENDERER="\${WEBKIT_DISABLE_DMABUF_RENDERER:-1}"
export WEBKIT_DISABLE_COMPOSITING_MODE="\${WEBKIT_DISABLE_COMPOSITING_MODE:-1}"
EOF
    changed=1
  fi

  if [[ "$changed" -eq 1 ]]; then
    return 0
  fi
  return 1
}

if [[ "${1:-}" == "--self-test" ]]; then
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' EXIT
  cat > "$tmp" << 'EOF'
#! /usr/bin/env bash
export GDK_BACKEND=x11 # Crash with Wayland backend on Wayland
export XDG_DATA_DIRS="$APPDIR/usr/share"
EOF
  patch_gtk_runtime_file "$tmp"
  if grep -q '^export GDK_BACKEND=x11' "$tmp"; then
    echo "self-test failed: GDK_BACKEND=x11 still present" >&2
    exit 1
  fi
  if ! grep -q "$WEBKIT_MARKER" "$tmp"; then
    echo "self-test failed: missing webkit marker" >&2
    exit 1
  fi
  if ! grep -q 'WEBKIT_DISABLE_COMPOSITING_MODE' "$tmp"; then
    echo "self-test failed: missing compositing disable" >&2
    exit 1
  fi
  echo "appimage-unbundle-wayland: self-test ok"
  exit 0
fi

DIRS=("${@}")
if [[ ${#DIRS[@]} -eq 0 ]]; then
  DIRS=(
    src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/appimage
    src-tauri/target/release/bundle/appimage
  )
fi

ARCH="${ARCH:-$(uname -m)}"
CHANGED=0

sign_file() {
  local file="$1"
  if [[ ! -f "${file}.sig" && -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
    return 0
  fi
  if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
    echo "ERROR: ${file}.sig exists but TAURI_SIGNING_PRIVATE_KEY is unset." >&2
    exit 1
  fi
  npx --yes @tauri-apps/cli@2 signer sign "$file"
}

drop_bundled_wayland() {
  local root="$1"
  local found
  found="$(find "$root" -type f \( \
    -name 'libwayland-client.so.*' -o \
    -name 'libwayland-cursor.so.*' -o \
    -name 'libwayland-egl.so.*' -o \
    -name 'libwayland-server.so.*' \) -print || true)"
  if [[ -z "$found" ]]; then
    return 1
  fi
  echo "$found" | sed 's/^/    drop /'
  find "$root" -type f \( \
    -name 'libwayland-client.so.*' -o \
    -name 'libwayland-cursor.so.*' -o \
    -name 'libwayland-egl.so.*' -o \
    -name 'libwayland-server.so.*' \) -delete
  return 0
}

patch_extracted_hooks() {
  local root="$1"
  local any=1
  local hook="$root/apprun-hooks/linuxdeploy-plugin-gtk.sh"
  local f

  if [[ -f "$hook" ]]; then
    if patch_gtk_runtime_file "$hook"; then
      echo "    patched apprun-hooks/linuxdeploy-plugin-gtk.sh"
      any=0
    fi
  fi

  while IFS= read -r -d '' f; do
    [[ "$f" == "$hook" ]] && continue
    if grep -q '^export GDK_BACKEND=x11' "$f" 2>/dev/null; then
      sed -i '/^export GDK_BACKEND=x11/d' "$f"
      echo "    stripped GDK_BACKEND=x11 from ${f#"$root/"}"
      any=0
    fi
  done < <(find "$root" -type f \( -name 'AppRun' -o -name '*.sh' \) -print0 2>/dev/null)

  return "$any"
}

repack_one() {
  local APP="$1"
  local WORK EXTRACT APP_ABS APPIMAGETOOL
  local dropped=1 hooked=1
  echo "==> Inspecting $(basename "$APP")"

  WORK="$(mktemp -d)"
  EXTRACT="$WORK/extract"
  mkdir -p "$EXTRACT"
  APP_ABS="$(realpath "$APP")"

  APPIMAGETOOL="$WORK/appimagetool"
  curl -fsSL -o "$APPIMAGETOOL" \
    "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-${ARCH}.AppImage"
  chmod +x "$APPIMAGETOOL"

  set +e
  (cd "$EXTRACT" && "$APP_ABS" --appimage-extract >/dev/null)
  local extract_rc=$?
  set -e
  if [[ "$extract_rc" -ne 0 ]]; then
    echo "    extract failed for $(basename "$APP")" >&2
    rm -rf "$WORK"
    exit 1
  fi

  set +e
  drop_bundled_wayland "$EXTRACT/squashfs-root"
  dropped=$?
  patch_extracted_hooks "$EXTRACT/squashfs-root"
  hooked=$?
  set -e

  if [[ "$dropped" -ne 0 && "$hooked" -ne 0 ]]; then
    echo "    no libwayland and GTK hook already patched — leaving $(basename "$APP") as-is"
    rm -rf "$WORK"
    return 0
  fi

  ARCH="$ARCH" "$APPIMAGETOOL" --appimage-extract-and-run \
    "$EXTRACT/squashfs-root" "$APP.new" >/dev/null
  mv -f "$APP.new" "$APP"
  chmod +x "$APP"
  rm -rf "$WORK"

  if [[ -f "${APP}.tar.gz" ]]; then
    tar -C "$(dirname "$APP")" -czf "${APP}.tar.gz" "$(basename "$APP")"
  fi

  sign_file "$APP"
  if [[ -f "${APP}.tar.gz" ]]; then
    sign_file "${APP}.tar.gz"
  fi

  CHANGED=1
  echo "    repacked $(basename "$APP")"
}

FOUND_DIR=0
for DIR in "${DIRS[@]}"; do
  if [[ ! -d "$DIR" ]]; then
    continue
  fi
  FOUND_DIR=1
  shopt -s nullglob
  images=("$DIR"/*.AppImage)
  shopt -u nullglob
  if [[ ${#images[@]} -eq 0 ]]; then
    echo "No AppImage in $DIR"
    continue
  fi
  for APP in "${images[@]}"; do
    repack_one "$APP"
  done
done

if [[ "$FOUND_DIR" -eq 0 ]]; then
  echo "No AppImage bundle directory found — nothing to do."
  exit 0
fi

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "repacked=$CHANGED" >> "$GITHUB_OUTPUT"
fi
