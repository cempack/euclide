"""Freezes the sidecar with PyInstaller as a onedir bundle (fast start-up, no
extraction on each run), so school PCs never need Python installed.

    python sidecar/build.py      →  sidecar/dist/euclide-sidecar/

Called by build_sidecar.sh / build_sidecar.ps1 once the dependencies are in.
"""

import hashlib
import shutil
from pathlib import Path

import PyInstaller.__main__

HERE = Path(__file__).resolve().parent
BUNDLE = HERE / "dist" / "euclide-sidecar"

# Jedi's type stubs for third-party packages and for Django: a lesson's
# script can import none of them (the standard library and the shims only).
# They were 85 % of the bundle's files, every one written to the USB key by
# an update and scanned by the antivirus at the next start. Jedi skips a
# stub folder that is missing.
UNUSED = [
    "jedi/third_party/typeshed/stubs",
    "jedi/third_party/django-stubs",
]

# The bundle's fingerprint: Euclide's USB updater leaves the Python module in
# place when an update brings the same one (portable_update.rs).
FINGERPRINT = ".euclide-build"

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
    trim(BUNDLE)
    fingerprint(BUNDLE)


def trim(bundle):
    for rel in UNUSED:
        shutil.rmtree(bundle / "_internal" / rel, ignore_errors=True)


def fingerprint(bundle):
    """A hash of every file of the bundle, names included."""
    digest = hashlib.sha256()
    files = sorted(p for p in bundle.rglob("*") if p.is_file() and p.name != FINGERPRINT)
    for path in files:
        digest.update(path.relative_to(bundle).as_posix().encode() + b"\0")
        digest.update(path.read_bytes())
    (bundle / FINGERPRINT).write_text(digest.hexdigest() + "\n", encoding="ascii")


if __name__ == "__main__":
    main()
