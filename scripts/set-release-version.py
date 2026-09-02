#!/usr/bin/env python3
"""Compute or apply Euclide release versions (semver X.Y.Z)."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEMVER = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")


def parse(version: str) -> tuple[int, int, int] | None:
    m = SEMVER.fullmatch(version.strip())
    if not m:
        return None
    return int(m.group(1)), int(m.group(2)), int(m.group(3))


def fmt(parts: tuple[int, int, int]) -> str:
    return f"{parts[0]}.{parts[1]}.{parts[2]}"


def git_tag_versions() -> list[tuple[int, int, int]]:
    try:
        out = subprocess.check_output(
            ["git", "tag", "-l", "v*"],
            cwd=ROOT,
            text=True,
        )
    except subprocess.CalledProcessError:
        return []
    found: list[tuple[int, int, int]] = []
    for line in out.splitlines():
        parsed = parse(line)
        if parsed:
            found.append(parsed)
    return found


def file_version() -> tuple[int, int, int]:
    conf = json.loads((ROOT / "src-tauri" / "tauri.conf.json").read_text())
    return parse(str(conf.get("version") or "")) or (0, 0, 0)


def current() -> tuple[int, int, int]:
    versions = git_tag_versions() + [file_version()]
    return max(versions)


def next_patch() -> str:
    major, minor, patch = current()
    return fmt((major, minor, patch + 1))


def sub_nth_version_field(text: str, ver: str, n: int) -> str:
    count = 0

    def repl(match: re.Match[str]) -> str:
        nonlocal count
        count += 1
        if count == n:
            return f'{match.group(1)}{ver}{match.group(3)}'
        return match.group(0)

    return re.sub(r'("version"\s*:\s*")(\d+\.\d+\.\d+)(")', repl, text, count=n)


def set_version(version: str) -> str:
    parsed = parse(version)
    if not parsed:
        raise SystemExit(f"invalid version: {version}")
    ver = fmt(parsed)

    tauri = ROOT / "src-tauri" / "tauri.conf.json"
    tauri.write_text(sub_nth_version_field(tauri.read_text(), ver, 1))

    pkg = ROOT / "package.json"
    pkg.write_text(sub_nth_version_field(pkg.read_text(), ver, 1))

    lock = ROOT / "package-lock.json"
    lock_text = lock.read_text()
    lock_text, n1 = re.subn(
        r'("name": "euclide",\n  "version": ")(\d+\.\d+\.\d+)(")',
        rf"\g<1>{ver}\g<3>",
        lock_text,
        count=1,
    )
    lock_text, n2 = re.subn(
        r'("": \{\n      "name": "euclide",\n      "version": ")(\d+\.\d+\.\d+)(")',
        rf"\g<1>{ver}\g<3>",
        lock_text,
        count=1,
    )
    if n1 != 1 or n2 != 1:
        raise SystemExit(f"package-lock.json version replace failed ({n1}, {n2})")
    lock.write_text(lock_text)

    cargo = ROOT / "src-tauri" / "Cargo.toml"
    cargo_text, n = re.subn(
        r'(?m)^(\[package\]\n(?:.*\n)*?^version\s*=\s*")([^"]+)(")',
        rf"\g<1>{ver}\g<3>",
        cargo.read_text(),
        count=1,
    )
    if n != 1:
        raise SystemExit("Cargo.toml package version replace failed")
    cargo.write_text(cargo_text)

    cargo_lock = ROOT / "src-tauri" / "Cargo.lock"
    cargo_lock_text, n = re.subn(
        r'(name = "euclide"\nversion = ")([^"]+)(")',
        rf"\g<1>{ver}\g<3>",
        cargo_lock.read_text(),
        count=1,
    )
    if n != 1:
        raise SystemExit("Cargo.lock euclide version replace failed")
    cargo_lock.write_text(cargo_lock_text)

    print(ver)
    return ver


def main() -> None:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--next", action="store_true")
    group.add_argument("--set", metavar="VERSION")
    args = parser.parse_args()
    if args.next:
        print(next_patch())
        return
    set_version(args.set)


if __name__ == "__main__":
    main()
