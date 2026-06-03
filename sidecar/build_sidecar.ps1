# Builds the Euclide Python sidecar into a single standalone executable (Windows).
# Requires Python + pip. Output placed in sidecar/dist/euclide-sidecar.exe
# Then copy next to Euclide.exe (or into resources before tauri build).
$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $here "..\src-tauri\resources\euclide_sidecar.py"
$out = Join-Path $here "dist"

python -m pip install --upgrade pip
python -m pip install -r (Join-Path $here "requirements.txt") pyinstaller

python -m PyInstaller `
  --onefile `
  --name euclide-sidecar `
  --distpath $out `
  --workpath (Join-Path $here "build") `
  --specpath (Join-Path $here "build") `
  $script

Write-Host ""
Write-Host "Sidecar built: $out\euclide-sidecar.exe"
Write-Host "Copy it next to the Euclide executable (or in app resources) before distribution."