"""
user_secrets.py — Python twin of ui/src/lib/server/user-secrets.ts.

Python CLI scripts (scan-broad.py, gemini-first-pass.py) can't import
from the TypeScript codebase, so this file mirrors the encryption
format byte-for-byte. A file written by the TS/MJS side decrypts
correctly here, and vice versa.

Round-trip parity is enforced by a vitest case
(ui/src/lib/server/user-secrets.test.ts :: mjs/ts/py parity). Touch
any of the three implementations and re-run that test.

Resolution order for a Python script that wants a credential:

    1. per-user value (this module) — keyed by HERON_USER_ID env
    2. process.env fallback (legacy single-user install)

If HERON_USER_ID isn't set, scripts fall straight through to
os.environ — that's the pre-multi-user path and stays supported.

Dependencies:
    - cryptography  (AES-GCM + HKDF)  — pinned in .venv

Usage:
    from lib.user_secrets import get_credential
    api_key = get_credential("GEMINI_API_KEY")
    if api_key is None:
        ...
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
from typing import Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

SCHEMA_VERSION = 1
HKDF_INFO = b"heron-user-secrets-v1"
SYSTEM_USER_ID = "system-user"

# Repo root: scripts/lib/user_secrets.py → scripts → repo root
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent


def _data_dir() -> Path:
    """Same precedence as the TS impl + ui/src/lib/server/db/index.ts:
    HERON_DATA_DIR > HERON_DATA_DIR > <repo>/data."""
    if os.environ.get("HERON_DATA_DIR"):
        return Path(os.environ["HERON_DATA_DIR"])
    if os.environ.get("HERON_DATA_DIR"):
        return Path(os.environ["HERON_DATA_DIR"])
    return _REPO_ROOT / "data"


def _secrets_file_for(user_id: str) -> Path:
    """Mirror userSharedPathForUser('secrets') from profile-paths.ts."""
    data = _data_dir()
    if user_id == SYSTEM_USER_ID:
        return data / "profiles" / "_shared" / "secrets.json"
    return data / "users" / user_id / "profiles" / "_shared" / "secrets.json"


def _derive_key(salt_b64: str) -> bytes:
    """HKDF-SHA256(ikm = sha256(BETTER_AUTH_SECRET), salt, info, 32).

    Same double-hash trick as the TS impl: BETTER_AUTH_SECRET is hex-
    encoded user input, so sha256 it first to get a clean 256-bit IKM
    before HKDF spreads it across the per-user salt."""
    secret = os.environ.get("BETTER_AUTH_SECRET")
    if not secret:
        raise RuntimeError(
            "user_secrets.py: BETTER_AUTH_SECRET missing — load .env before resolving credentials."
        )
    ikm = hashlib.sha256(secret.encode("utf-8")).digest()
    salt = base64.b64decode(salt_b64)
    return HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        info=HKDF_INFO,
    ).derive(ikm)


def get_secret(user_id: str, key: str) -> Optional[str]:
    """Decrypt a single key from the user's secrets file.

    Returns None if the file doesn't exist or the key isn't in it.
    Raises if the file is present but corrupt or the GCM auth tag
    doesn't verify (rotated BETTER_AUTH_SECRET, tampered file, etc.) —
    the caller gets a loud signal rather than a silent fallback.
    """
    p = _secrets_file_for(user_id)
    if not p.is_file():
        return None
    with p.open("r", encoding="utf-8") as f:
        parsed = json.load(f)
    if parsed.get("version") != SCHEMA_VERSION:
        raise RuntimeError(
            f"user_secrets.py: {p} version={parsed.get('version')}, expected {SCHEMA_VERSION}."
        )
    entry = parsed.get("entries", {}).get(key)
    if not entry:
        return None
    aes_key = _derive_key(parsed["salt"])
    iv = base64.b64decode(entry["iv"])
    tag = base64.b64decode(entry["tag"])
    ciphertext = base64.b64decode(entry["ciphertext"])
    # Python's AESGCM expects the auth tag appended to the ciphertext --
    # the JS Buffer split it into separate fields, so glue them back.
    aesgcm = AESGCM(aes_key)
    plaintext = aesgcm.decrypt(iv, ciphertext + tag, associated_data=None)
    return plaintext.decode("utf-8")


def get_credential(key: str) -> Optional[str]:
    """Two-tier resolver: per-user store first, os.environ fallback.

    Resolves the userId from HERON_USER_ID. When unset, the
    function skips the per-user lookup and goes straight to
    os.environ — that's the pre-multi-user path and stays supported.

    CLI usage:
        from lib.user_secrets import get_credential
        api_key = get_credential("GEMINI_API_KEY")
    """
    user_id = os.environ.get("HERON_USER_ID")
    if user_id:
        try:
            from_store = get_secret(user_id, key)
            if from_store is not None:
                return from_store
        except Exception as err:  # noqa: BLE001 - intentional broad catch
            # Don't bail the script over a decrypt failure -- surface a
            # warning + fall through to os.environ. The dashboard's
            # health-check will flag the corrupt secrets.json separately.
            import sys

            print(
                f"[user_secrets.py] {err}",
                file=sys.stderr,
            )
    from_env = os.environ.get(key)
    if from_env:
        return from_env
    return None
