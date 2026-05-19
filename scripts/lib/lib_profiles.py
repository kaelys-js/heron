"""
lib_profiles.py — Shared user+profile-path helpers for Python scripts.

Mirrors the SvelteKit `lib/server/profile-paths.ts` and `lib-profiles.mjs`
APIs. Every Python scanner / scoring / apply script imports this to
resolve per-user, per-profile file paths.

MULTI-USER LAYOUT:

    data/users/{user_id}/profiles/{slug}/cv.md
    data/users/{user_id}/profiles/{slug}/profile.yml
    data/users/{user_id}/profiles/{slug}/portals.yml
    data/users/{user_id}/profiles/{slug}/applications.md
    …

LEGACY SINGLE-USER LAYOUT (still works for pre-multi-user installs):

    data/profiles/{slug}/cv.md
    …

Scripts get the user id from the dashboard via either:
  * --user <userId>            CLI flag (preferred)
  * HERON_USER_ID env var (set by the orchestrator when it spawns)

When neither is set, lib_profiles falls back to the legacy `data/profiles/`
root. This lets old single-user workflows keep working.

Usage:

    from lib_profiles import (
        resolve_user_arg, resolve_profile_arg, profile_path,
    )

    parser.add_argument('--profile', default=None)
    parser.add_argument('--user', default=None)
    args = parser.parse_args()

    user_id = resolve_user_arg(args.user)
    profile_id = resolve_profile_arg(args.profile)
    cv_md = profile_path(profile_id, 'cv-md', user_id=user_id)
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent.parent  # scripts/<domain>/ → repo/
PROFILES_JSON = REPO_ROOT / "data" / "profiles.json"
LEGACY_PROFILES_ROOT = REPO_ROOT / "data" / "profiles"
USERS_ROOT = REPO_ROOT / "data" / "users"

# Mirror of SYSTEM_USER_ID in user-context.ts. When the script is invoked
# without --user (legacy single-user mode), this is what `resolve_user_arg`
# returns, and `_user_profiles_root` maps it back to LEGACY_PROFILES_ROOT.
SYSTEM_USER_ID = "__system__"

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
    # Item 4d / Option-C additions — see lib-profiles.mjs for rationale.
    # jds/ → per-profile saved JD text (was repo-root, shared, privacy leak).
    "jds-dir": "jds",
    # writing-samples/ → per-profile voice-calibration samples.
    "writing-samples-dir": "writing-samples",
    # batch/ → per-profile bulk-CV worker state. Previously repo-root
    # `batch/` (shared — concurrent users corrupted each other's state).
    "batch-dir": "batch",
}

# User-shared kinds — files that transcend the user's profiles but
# stay private to that user. Lives one level above the profile tree.
USER_SHARED_KINDS = {
    "story-bank": "story-bank.md",
}


def _user_profiles_root(user_id: str) -> Path:
    """Where this user's profile tree lives. SYSTEM_USER_ID maps to the
    legacy `data/profiles/` root so single-user mode still works."""
    if user_id == SYSTEM_USER_ID:
        return LEGACY_PROFILES_ROOT
    return USERS_ROOT / user_id / "profiles"


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


def profile_path(profile_id: str, kind: str, *, user_id: str = SYSTEM_USER_ID) -> Path:
    """Resolve a per-user, per-profile file/dir path. Mirrors profile-paths.ts."""
    if not profile_id or not isinstance(profile_id, str):
        raise ValueError(f"profile_path: profile_id required (got {profile_id!r})")
    if "/" in profile_id or "\\" in profile_id or ".." in profile_id:
        raise ValueError(f"profile_path: invalid profile_id (path traversal): {profile_id!r}")
    if not user_id or not isinstance(user_id, str):
        raise ValueError(f"profile_path: user_id required (got {user_id!r})")
    if "/" in user_id or "\\" in user_id or ".." in user_id:
        raise ValueError(f"profile_path: invalid user_id (path traversal): {user_id!r}")
    if kind not in PROFILE_FILE_KINDS:
        raise ValueError(
            f"profile_path: unknown kind {kind!r}. Valid: {sorted(PROFILE_FILE_KINDS)}"
        )
    base = _user_profiles_root(user_id) / profile_id
    rel = PROFILE_FILE_KINDS[kind]
    return base if rel == "" else base / rel


def user_shared_path(kind: str, *, user_id: str = SYSTEM_USER_ID) -> Path:
    """Resolve a per-user shared-across-profiles file path.

    multi-user → data/users/{user_id}/_shared/{file}
    legacy     → data/profiles/_shared/{file}        (user_id == SYSTEM_USER_ID)
    """
    if not user_id or not isinstance(user_id, str):
        raise ValueError(f"user_shared_path: user_id required (got {user_id!r})")
    if "/" in user_id or "\\" in user_id or ".." in user_id:
        raise ValueError(f"user_shared_path: invalid user_id (path traversal): {user_id!r}")
    if kind not in USER_SHARED_KINDS:
        raise ValueError(
            f"user_shared_path: unknown kind {kind!r}. Valid: {sorted(USER_SHARED_KINDS)}"
        )
    # Path: data/users/{user_id}/profiles/_shared/{file}   (multi-user)
    #   or: data/profiles/_shared/{file}                   (legacy single-user)
    # The "_shared" dir lives INSIDE the profiles/ tree (alongside each
    # profile dir) so the layout reads as: "every dir under profiles/ is
    # either a real profile or the _shared escape-hatch".
    if user_id == SYSTEM_USER_ID:
        base = LEGACY_PROFILES_ROOT / "_shared"
    else:
        base = USERS_ROOT / user_id / "profiles" / "_shared"
    return base / USER_SHARED_KINDS[kind]


def ensure_profile_dirs(profile_id: str, *, user_id: str = SYSTEM_USER_ID) -> None:
    """Make sure the profile directory + standard subdirs exist. Idempotent."""
    profile_path(profile_id, "profile-dir", user_id=user_id).mkdir(parents=True, exist_ok=True)
    profile_path(profile_id, "reports-dir", user_id=user_id).mkdir(parents=True, exist_ok=True)
    profile_path(profile_id, "output-dir", user_id=user_id).mkdir(parents=True, exist_ok=True)
    profile_path(profile_id, "interview-prep-dir", user_id=user_id).mkdir(
        parents=True, exist_ok=True
    )
    profile_path(profile_id, "jds-dir", user_id=user_id).mkdir(parents=True, exist_ok=True)
    profile_path(profile_id, "writing-samples-dir", user_id=user_id).mkdir(
        parents=True, exist_ok=True
    )
    profile_path(profile_id, "batch-dir", user_id=user_id).mkdir(parents=True, exist_ok=True)
    # user-shared dir is created lazily on first write
    user_shared_path("story-bank", user_id=user_id).parent.mkdir(parents=True, exist_ok=True)


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


def resolve_user_arg(value: str | None = None) -> str:
    """Resolve a CLI --user arg or HERON_USER_ID env var. Returns
    SYSTEM_USER_ID when neither is set (legacy single-user fallback)."""
    if value is None:
        value = os.environ.get("HERON_USER_ID")
    if not value:
        return SYSTEM_USER_ID
    if not isinstance(value, str):
        print(f"ERROR: --user must be a string, got {type(value)}", file=sys.stderr)
        sys.exit(2)
    if "/" in value or "\\" in value or ".." in value:
        print(f"ERROR: --user has invalid characters: {value!r}", file=sys.stderr)
        sys.exit(2)
    return value
