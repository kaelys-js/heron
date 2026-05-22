"""
_brand.py — shared brand.json loader for Python scripts.

Any .py script that needs the brand identifiers imports from here.

Usage:
    from _brand import BRAND
    print(BRAND["name"])              # -> 'heron' (or whatever brand.json says)
    print(BRAND["repo"]["url"])       # -> 'https://github.com/kaelys-js/heron'

Fail-safe: returns historical defaults if brand.json is missing/corrupt.
"""

import json
from pathlib import Path

# scripts/lib/_brand.py -> scripts/lib/ -> scripts/ -> repo root.
_ROOT = Path(__file__).resolve().parent.parent.parent
_BRAND_JSON = _ROOT / "branding" / "brand.json"

# Historical defaults -- the LAST KNOWN GOOD brand state, used when
# brand.json is missing or unparseable. When brand.json changes
# (rebrand, fork), these defaults stay pinned to the current canonical
# brand and get refreshed by hand during the next maintainer commit --
# they intentionally do NOT derive from the brand.json that just
# disappeared (the whole point is to be a sensible failover).
_DEFAULTS = {
    "name": "heron",
    "displayName": "Heron",
    "bundleId": "com.heron.app",
    "appGroup": "group.com.heron.app",
    "urlScheme": "heron",
    "serviceType": "_heron._tcp",
    "spotlightDomain": "com.heron.app.jobs",
    "envPrefix": "HERON",
    "tagline": "Stand still. Strike well.",
    "subline": "A thinking partner for career transitions. Patient, precise, local-first.",
    "description": "Heron is a thinking partner for career transitions. Local-first job-search platform.",
    "community": {"discord": {"url": "https://discord.gg/MyFbztUK5U"}},
    "repo": {
        "owner": "kaelys-js",
        "name": "heron",
        "url": "https://github.com/kaelys-js/heron",
        "issues": "https://github.com/kaelys-js/heron/issues",
    },
    "homepageUrl": "https://heron.app",
    "supportEmail": "hello@heron.app",
}


def _load_brand() -> dict:
    if not _BRAND_JSON.exists():
        return dict(_DEFAULTS)
    try:
        raw = json.loads(_BRAND_JSON.read_text())
    except (OSError, json.JSONDecodeError):
        return dict(_DEFAULTS)
    ids = raw.get("identifiers", {}) or {}
    repo = raw.get("repo", {}) or {}
    voice = raw.get("voice", {}) or {}
    community = raw.get("community", {}) or {}
    discord = (community.get("discord", {}) or {}) if isinstance(community, dict) else {}
    name = raw.get("name", _DEFAULTS["name"])
    return {
        "name": name,
        "displayName": raw.get("displayName", _DEFAULTS["displayName"]),
        "bundleId": ids.get("bundleId", _DEFAULTS["bundleId"]),
        "appGroup": ids.get("appGroup", _DEFAULTS["appGroup"]),
        "urlScheme": ids.get("urlScheme", _DEFAULTS["urlScheme"]),
        "serviceType": ids.get("serviceType", _DEFAULTS["serviceType"]),
        "spotlightDomain": ids.get("spotlightDomain", _DEFAULTS["spotlightDomain"]),
        # Uppercase brand name suffix for env-var names. Callers compose
        # f"{BRAND['envPrefix']}_DATA_DIR" so a rebrand re-derives.
        "envPrefix": name.upper(),
        "tagline": voice.get("tagline", _DEFAULTS["tagline"]),
        "subline": voice.get("subline", _DEFAULTS["subline"]),
        "description": raw.get("description", _DEFAULTS["description"]),
        "community": {
            "discord": {
                "url": discord.get("url", _DEFAULTS["community"]["discord"]["url"]),
            },
        },
        "repo": {
            "owner": repo.get("owner", _DEFAULTS["repo"]["owner"]),
            "name": repo.get("name", _DEFAULTS["repo"]["name"]),
            "url": repo.get("url", _DEFAULTS["repo"]["url"]),
            "issues": repo.get("issues", _DEFAULTS["repo"]["issues"]),
        },
        "homepageUrl": raw.get("homepageUrl", _DEFAULTS["homepageUrl"]),
        "supportEmail": raw.get("supportEmail", _DEFAULTS["supportEmail"]),
        "raw": raw,
    }


BRAND = _load_brand()
BRAND_REPO_ROOT = _ROOT
