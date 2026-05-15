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

_DEFAULTS = {
    "name": "heron",
    "displayName": "Heron",
    "bundleId": "com.heron.app",
    "urlScheme": "heron",
    "serviceType": "_heron._tcp",
    "repo": {
        "owner": "kaelys-js",
        "name": "heron",
        "url": "https://github.com/kaelys-js/heron",
        "issues": "https://github.com/kaelys-js/heron/issues",
    },
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
    return {
        "name": raw.get("name", _DEFAULTS["name"]),
        "displayName": raw.get("displayName", _DEFAULTS["displayName"]),
        "bundleId": ids.get("bundleId", _DEFAULTS["bundleId"]),
        "urlScheme": ids.get("urlScheme", _DEFAULTS["urlScheme"]),
        "serviceType": ids.get("serviceType", _DEFAULTS["serviceType"]),
        "repo": {
            "owner": repo.get("owner", _DEFAULTS["repo"]["owner"]),
            "name": repo.get("name", _DEFAULTS["repo"]["name"]),
            "url": repo.get("url", _DEFAULTS["repo"]["url"]),
            "issues": repo.get("issues", _DEFAULTS["repo"]["issues"]),
        },
        "raw": raw,
    }


BRAND = _load_brand()
BRAND_REPO_ROOT = _ROOT
