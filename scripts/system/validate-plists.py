#!/usr/bin/env python3
"""
validate-plists.py — assert every Apple plist file in the repo parses
cleanly.

Why: a malformed Info.plist or .entitlements file breaks the iOS build
with an obscure xcodebuild error that masks the actual cause. Catching
the parse error at PR-time means contributors don't hit it during a
build days later. Same logic for .xcprivacy and the project .pbxproj
file (which is an OpenStep ASCII plist).

Covers the XML / binary plist variants Apple ships:
  - .plist             — Info.plist, capacitor.config.plist, etc.
  - .entitlements      — App + extension entitlements
  - .xcprivacy         — Privacy manifest (App Store required since 2024)

NOT covered:
  - .pbxproj           — OpenStep ASCII plist; Python's plistlib doesn't
                         parse it. Xcode validates this format on every
                         open, and macOS's `plutil -lint` covers it on
                         the iOS CI runner (see test.yml ios job).
  - .storyboard / .xcsettings / .xcconfig / .xcscheme — XML but not
                         plists; get the xmllint --noout treatment in
                         validate-xml.sh.

Uses Python's stdlib `plistlib` so the script is dependency-free and
cross-platform — runs on Linux CI runners without needing macOS's
`plutil`. plistlib auto-detects XML vs binary plist formats.

Exit 0 if every file parses; exit 1 with a per-file error report.
"""

from __future__ import annotations

import plistlib
import sys
from pathlib import Path

# Resolve REPO_ROOT relative to this script (scripts/system/validate-plists.py).
REPO_ROOT = Path(__file__).resolve().parent.parent.parent

# Directories never scanned (build outputs, deps, derived data).
SKIP_DIRS = {
    "node_modules",
    ".svelte-kit",
    "build",
    "dist",
    ".turbo",
    ".vite",
    "coverage",
    "_build",
    ".venv",
    "venv",
    ".git",
    "DerivedData",
    "SourcePackages",
    "Pods",
    ".gradle",
}

# Apple plist file extensions we validate. .pbxproj is intentionally
# excluded -- it's OpenStep ASCII plist which plistlib doesn't read.
PLIST_GLOBS = ["*.plist", "*.entitlements", "*.xcprivacy"]


def iter_plists(root: Path):
    """Yield (relative_path, absolute_path) for every plist file under root."""
    for pattern in PLIST_GLOBS:
        for p in root.rglob(pattern):
            parts = p.relative_to(root).parts
            if any(part in SKIP_DIRS for part in parts):
                continue
            yield p.relative_to(root), p


def validate(rel: Path, abs_path: Path) -> tuple[bool, str | None]:
    """Return (ok, error_message). error_message is None on success."""
    try:
        with abs_path.open("rb") as f:
            plistlib.load(f)
        return True, None
    except plistlib.InvalidFileException as e:
        return False, f"InvalidFileException: {e}"
    except ValueError as e:
        return False, f"ValueError: {e}"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def main() -> int:
    files = list(iter_plists(REPO_ROOT))
    if not files:
        print("(no plist files found)")
        return 0

    errors: list[tuple[Path, str]] = []
    for rel, abs_path in sorted(files):
        ok, err = validate(rel, abs_path)
        if ok:
            print(f"  ✓ {rel}")
        else:
            print(f"  ✗ {rel}  {err}")
            errors.append((rel, err))

    if errors:
        print(f"\n× {len(errors)} plist file(s) failed to parse.")
        return 1
    print(f"\n✓ {len(files)} plist file(s) parsed cleanly")
    return 0


if __name__ == "__main__":
    sys.exit(main())
