#!/usr/bin/env bash
# Builds the Euclide Python sidecar into a single standalone executable so school
# machines never need a system Python install.
#
# Output: a `euclide-sidecar` (or `euclide-sidecar.exe` on Windows) binary that is placed
# next to the Tauri executable / inside the app resources at bundle time.
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
  --onefile \
  --name euclide-sidecar \
  --distpath "$OUT" \
  --workpath "$BUILD_DIR" \
  --specpath "$BUILD_DIR" \
  "$SCRIPT"

deactivate || true

echo ""
echo "Sidecar construit : $OUT/euclide-sidecar"
echo "Copiez-le a cote de l'executable Euclide (ou dans les ressources) avant la distribution."
echo "Le binaire est pour la plateforme courante (macOS dans ce cas)."
