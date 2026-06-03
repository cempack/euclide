# Builds the Euclide Python sidecar into a onedir bundle (Windows) for fast startup.
# Output: sidecar/dist/euclide-sidecar/ (dir containing euclide-sidecar.exe + support files)
# Use --noconsole so no cmd window pops when spawned from the GUI app.
# Then copy the euclide-sidecar/ dir next to Euclide.exe (or into resources).
$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $here "..\src-tauri\resources\euclide_sidecar.py"
$out = Join-Path $here "dist"

python -m pip install --upgrade pip
python -m pip install -r (Join-Path $here "requirements.txt") pyinstaller

python -m PyInstaller `
  --onedir `
  --noconsole `
  --name euclide-sidecar `
  --distpath $out `
  --workpath (Join-Path $here "build") `
  --specpath (Join-Path $here "build") `
  $script

Write-Host ""
Write-Host "Sidecar built: $out\euclide-sidecar.exe"
Write-Host "Copy it next to the Euclide executable (or in app resources) before distribution."