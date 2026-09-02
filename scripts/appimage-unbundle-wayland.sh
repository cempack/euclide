#!/usr/bin/env bash
#
# After a Tauri AppImage build, drop bundled libwayland-* so the host Mesa/EGL
# stack is used. Ubuntu copies inside the image abort WebKit on current Arch
# (Hyprland, Intel xe, Mesa 26): "Could not create surfaceless EGL display".
#
# WEBKIT_DISABLE_DMABUF_RENDERER does not help: the abort is inside EGL display
# init, before WebKit reads that variable.
#
# If no libwayland files are present (gtk plugin already stripped them), this
# is a no-op and updater signatures stay valid.
#
# Usage: scripts/appimage-unbundle-wayland.sh [bundle-dir ...]
#
set -euo pipefail

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

repack_one() {
  local APP="$1"
  local WORK EXTRACT APP_ABS APPIMAGETOOL found
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

  found="$(find "$EXTRACT/squashfs-root" -type f \( \
    -name 'libwayland-client.so.*' -o \
    -name 'libwayland-cursor.so.*' -o \
    -name 'libwayland-egl.so.*' -o \
    -name 'libwayland-server.so.*' \) -print || true)"

  if [[ -z "$found" ]]; then
    echo "    no bundled libwayland — leaving $(basename "$APP") as-is"
    rm -rf "$WORK"
    return 0
  fi

  echo "$found" | sed 's/^/    drop /'
  find "$EXTRACT/squashfs-root" -type f \( \
    -name 'libwayland-client.so.*' -o \
    -name 'libwayland-cursor.so.*' -o \
    -name 'libwayland-egl.so.*' -o \
    -name 'libwayland-server.so.*' \) -delete

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
  echo "    repacked $(basename "$APP") — libwayland comes from the host"
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
