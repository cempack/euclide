#!/usr/bin/env bash
# Builds the Euclide Python sidecar into a single standalone executable so school
# machines never need a system Python install.
#
# Output: a `euclide-sidecar` (or `euclide-sidecar.exe` on Windows) binary that is placed
# next to the Tauri executable / inside the app resources at bundle time.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../src-tauri/resources/euclide_sidecar.py"
OUT="$HERE/dist"

python3 -m pip install --upgrade pip
python3 -m pip install -r "$HERE/requirements.txt" pyinstaller

python3 -m PyInstaller \
  --onefile \
  --name euclide-sidecar \
  --distpath "$OUT" \
  --workpath "$HERE/build" \
  --specpath "$HERE/build" \
  "$SCRIPT"

echo ""
echo "Sidecar construit : $OUT/euclide-sidecar"
echo "Copiez-le a cote de l'executable Euclide (ou dans les ressources) avant la distribution."
