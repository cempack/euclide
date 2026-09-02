#!/usr/bin/env bash
# Builds the Euclide Python sidecar as a onedir bundle (fast startup, no per-run extract)
# so school machines never need a system Python install.
#
# Output: a `euclide-sidecar/` directory (containing the launcher + libs) that is placed
# next to the Tauri executable / inside the app resources at bundle time.
# --noconsole prevents terminal windows on Windows/mac when spawned from the GUI.
#
# Reuses the build venv when present so local/CI rebuilds skip venv creation.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../src-tauri/resources/euclide_sidecar.py"
OUT="$HERE/dist"
VENV="$HERE/.build-venv"
BUILD_DIR="$HERE/build"

rm -rf "$OUT" "$BUILD_DIR"

if [ ! -x "$VENV/bin/python" ]; then
  echo "Creating build venv..."
  python3 -m venv "$VENV"
fi
# shellcheck source=/dev/null
source "$VENV/bin/activate"

echo "Installing deps in venv..."
python -m pip install --disable-pip-version-check --no-input -r "$HERE/requirements.txt" pyinstaller

echo "Running PyInstaller..."
python -m PyInstaller \
  --noconfirm \
  --onedir \
  --noconsole \
  --name euclide-sidecar \
  --distpath "$OUT" \
  --workpath "$BUILD_DIR" \
  --specpath "$BUILD_DIR" \
  "$SCRIPT"

if [ ! -d "$OUT/euclide-sidecar" ]; then
  echo "ERROR: PyInstaller did not produce the expected onedir bundle at $OUT/euclide-sidecar"
  ls -la "$OUT" || true
  exit 1
fi

deactivate || true

echo ""
echo "Sidecar construit : $OUT/euclide-sidecar/ (dossier)"
echo "Copiez le dossier euclide-sidecar a cote de l'executable Euclide (ou dans les ressources) avant la distribution."
echo "Le binaire est pour la plateforme courante (macOS dans ce cas)."
