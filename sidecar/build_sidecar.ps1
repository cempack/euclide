# Builds the Euclide Python sidecar into a onedir bundle (Windows) for fast startup.
# Output: sidecar/dist/euclide-sidecar/ (dir containing euclide-sidecar.exe + support files)
# Use --noconsole so no cmd window pops when spawned from the GUI app.
# Then copy the euclide-sidecar/ dir next to Euclide.exe (or into resources).
$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $here "..\src-tauri\resources\euclide_sidecar.py"
$out = Join-Path $here "dist"

python -m pip install --disable-pip-version-check --no-input -r (Join-Path $here "requirements.txt") pyinstaller

python -m PyInstaller `
  --noconfirm `
  --onedir `
  --noconsole `
  --name euclide-sidecar `
  --distpath $out `
  --workpath (Join-Path $here "build") `
  --specpath (Join-Path $here "build") `
  $script

if (-not (Test-Path "$out\euclide-sidecar")) {
  Write-Error "ERROR: PyInstaller did not produce the expected onedir bundle at $out\euclide-sidecar"
  Get-ChildItem $out | Format-Table
  exit 1
}

Write-Host ""
Write-Host "Sidecar built: $out\euclide-sidecar (dir)"
Write-Host "Copy the euclide-sidecar dir next to the Euclide executable (or in app resources) before distribution."
