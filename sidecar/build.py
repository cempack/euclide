"""Freezes the sidecar with PyInstaller as a onedir bundle (fast start-up, no
extraction on each run), so school PCs never need Python installed.

    python sidecar/build.py      →  sidecar/dist/euclide-sidecar/

Called by build_sidecar.sh / build_sidecar.ps1 once the dependencies are in.
"""

from pathlib import Path

import PyInstaller.__main__

HERE = Path(__file__).resolve().parent

# What a lesson's script may import. PyInstaller only bundles the standard
# modules it sees imported, and student scripts are not there to be seen.
LESSON_MODULES = [
    "array",
    "bisect",
    "calendar",
    "cmath",
    "collections",
    "copy",
    "csv",
    "dataclasses",
    "datetime",
    "decimal",
    "doctest",
    "enum",
    "fractions",
    "functools",
    "heapq",
    "itertools",
    "json",
    "math",
    "operator",
    "random",
    "re",
    "statistics",
    "string",
    "textwrap",
    "time",
    "typing",
    "unicodedata",
]


def main():
    args = [
        str(HERE / "run_sidecar.py"),
        "--noconfirm",
        "--onedir",
        # No console window when Euclide starts it.
        "--noconsole",
        "--name",
        "euclide-sidecar",
        "--distpath",
        str(HERE / "dist"),
        "--workpath",
        str(HERE / "build"),
        "--specpath",
        str(HERE / "build"),
        "--paths",
        str(HERE),
        "--collect-submodules",
        "euclide_sidecar",
        # turtle and matplotlib are Euclide's own (shims/); Tk is never needed.
        "--exclude-module",
        "tkinter",
    ]
    for module in LESSON_MODULES:
        args += ["--hidden-import", module]
    PyInstaller.__main__.run(args)


if __name__ == "__main__":
    main()
