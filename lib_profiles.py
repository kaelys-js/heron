"""
lib_profiles.py — Shared profile-path helpers for Python scanners.

Mirrors the SvelteKit `lib/server/profile-paths.ts` API. Every Python
scanner / scoring / apply script imports this to resolve per-profile
file paths.

Usage:

    from lib_profiles import (
        get_active_profile_id, profile_path, ensure_profile_dirs,
        resolve_profile_arg,
    )

    # In argparse setup:
    parser.add_argument('--profile', default=None,
                        help='Profile slug; defaults to active profile.')
    args = parser.parse_args()

    pid = resolve_profile_arg(args.profile)
    cv_md = profile_path(pid, 'cv-md')

The single source of truth for which profile is "active" is
`data/profiles.json` written by the dashboard's profiles.ts module.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROFILES_JSON = ROOT / "data" / "profiles.json"
PROFILES_ROOT = ROOT / "data" / "profiles"

# Mirror of ProfileFileKind in profile-paths.ts. Keep in sync.
PROFILE_FILE_KINDS = {
    "cv-md": "cv.md",
    "profile-yml": "profile.yml",
    "profile-md": "_profile.md",
    "portals-yml": "portals.yml",
    "article-digest": "article-digest.md",
    "pipeline": "pipeline.md",
    "applications": "applications.md",
    "scan-history": "scan-history.tsv",
    "gemini-scores": "gemini-scores.tsv",
    "follow-ups": "follow-ups.md",
    "projects-json": "projects.json",
    # Directories
    "profile-dir": "",
    "reports-dir": "reports",
    "output-dir": "output",
    "interview-prep-dir": "interview-prep",
}


def read_profiles() -> dict:
    """Load data/profiles.json. Returns a sane default when missing/broken."""
    try:
        with PROFILES_JSON.open() as f:
            data = json.load(f)
            if isinstance(data, dict) and "activeId" in data and "profiles" in data:
                return data
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass
    return {
        "activeId": "default",
        "profiles": [{"id": "default", "name": "Default", "color": "blue"}],
    }


def get_active_profile_id() -> str:
    return read_profiles().get("activeId", "default")


def list_profile_ids() -> list[str]:
    return [p["id"] for p in read_profiles().get("profiles", []) if "id" in p]


def profile_path(profile_id: str, kind: str) -> Path:
    """Resolve a per-profile file/dir path. Mirrors profile-paths.ts."""
    if not profile_id or not isinstance(profile_id, str):
        raise ValueError(f"profile_path: profile_id required (got {profile_id!r})")
    if "/" in profile_id or "\\" in profile_id or ".." in profile_id:
        raise ValueError(f"profile_path: invalid profile_id (path traversal): {profile_id!r}")
    if kind not in PROFILE_FILE_KINDS:
        raise ValueError(f"profile_path: unknown kind {kind!r}. Valid: {sorted(PROFILE_FILE_KINDS)}")
    base = PROFILES_ROOT / profile_id
    rel = PROFILE_FILE_KINDS[kind]
    return base if rel == "" else base / rel


def ensure_profile_dirs(profile_id: str) -> None:
    """Make sure the profile directory + standard subdirs exist. Idempotent."""
    profile_path(profile_id, "profile-dir").mkdir(parents=True, exist_ok=True)
    profile_path(profile_id, "reports-dir").mkdir(parents=True, exist_ok=True)
    profile_path(profile_id, "output-dir").mkdir(parents=True, exist_ok=True)
    profile_path(profile_id, "interview-prep-dir").mkdir(parents=True, exist_ok=True)


def resolve_profile_arg(value: str | None) -> str:
    """Resolve a CLI --profile arg to an actual profile id. None → active.
    Raises SystemExit(2) if the named profile doesn't exist."""
    if value is None:
        return get_active_profile_id()
    known = list_profile_ids()
    if value not in known:
        print(
            f"ERROR: unknown profile {value!r}. Known: {known}",
            file=sys.stderr,
        )
        sys.exit(2)
    return value
