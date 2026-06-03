#!/usr/bin/env bash
# Builds the Euclide Python sidecar as a onedir bundle (fast startup, no per-run extract)
# so school machines never need a system Python install.
#
# Output: a `euclide-sidecar/` directory (containing the launcher + libs) that is placed
# next to the Tauri executable / inside the app resources at bundle time.
# --noconsole prevents terminal windows on Windows/mac when spawned from the GUI.
#
# Uses a temporary venv to avoid polluting system Python (important on macOS with Homebrew).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../src-tauri/resources/euclide_sidecar.py"
OUT="$HERE/dist"
VENV="$HERE/.build-venv"
BUILD_DIR="$HERE/build"

# Clean previous
rm -rf "$VENV" "$OUT" "$BUILD_DIR"

echo "Creating build venv..."
python3 -m venv "$VENV"
source "$VENV/bin/activate"

echo "Installing deps in venv..."
python -m pip install --upgrade pip
python -m pip install -r "$HERE/requirements.txt" pyinstaller

echo "Running PyInstaller..."
python -m PyInstaller \
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
