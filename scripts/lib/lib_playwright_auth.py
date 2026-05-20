"""
lib_playwright_auth.py — Shared Playwright auth helpers for LinkedIn / Indeed.

Both `linkedin-easy-apply.py` and the new `scan-linkedin-auth.py` /
`scan-indeed-auth.py` scrapers reuse the same persistent Chromium profile
strategy: launch_persistent_context with a portal-specific user_data_dir.
After a one-time headed login, every subsequent invocation runs headless
against the same cookies + session storage.

USAGE
-----

  from lib_playwright_auth import (
      launch_persistent, is_logged_in_linkedin, is_logged_in_indeed,
      login_interactive, humanize, user_data_dir,
  )

  # One-shot login (headed, blocks until verified)
  login_interactive('linkedin')

  # Headless scrape session
  with launch_persistent('linkedin', headed=False) as ctx:
      page = ctx.new_page()
      if not is_logged_in_linkedin(page):
          raise RuntimeError("Session expired — re-run --login")
      # ...scrape...

PORTAL DETECTION
----------------

LinkedIn: navigate to /feed/ → if URL contains 'login' or 'signup' or
'authwall' → not logged in. Logged-in URL stays on /feed/.

Indeed: navigate to /account → if redirected to /signin or contains
'/account/login' → not logged in. Logged-in URL stays on /account.

This module is import-only. No top-level side effects beyond defining
constants.
"""

from __future__ import annotations

import sys
import time
import random
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Literal
from urllib.parse import urlparse

try:
    from playwright.sync_api import (
        sync_playwright,
        BrowserContext,
        Page,
        TimeoutError as PlaywrightTimeout,
    )
except ImportError:
    print(
        "ERROR: playwright not installed. Run:\n  .venv/bin/pip install playwright && .venv/bin/python -m playwright install chromium",
        file=sys.stderr,
    )
    sys.exit(1)


ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent.parent  # scripts/<domain>/ → repo/

# One persistent Chromium profile per portal PER USER. State (cookies,
# localStorage, cache) lives inside these dirs -- wiping the dir
# disconnects that user. Under multi-user (HERON_USER_ID set):
#   data/users/{uid}/.playwright-{portal}/
# Legacy single-user (SYSTEM_USER_ID fallback):
#   data/profiles/_shared/.playwright-{portal}/
#
# CRITICAL: the persistent dir IS the credential. Two users on one
# machine MUST NOT share these dirs -- otherwise Alice's apply would
# post as Bob and vice versa. See docs/security.md.
KNOWN_PORTALS: frozenset[str] = frozenset(
    {
        "linkedin",
        "indeed",
        "greenhouse",
        "ashby",
        "lever",
        "workday",
        "recruitee",
        "smartrecruiters",
        "workable",
        "personio",
        "teamtailor",
    }
)

# Public so callers can reuse for `--check-session` etc.
LOGIN_TIMEOUT_S = 5 * 60  # 5 min for the user to complete the headed login
PROBE_TIMEOUT_MS = 15_000  # navigation timeouts during is_logged_in_* probes


def user_data_dir(portal: str) -> Path:
    """Resolve the persistent Chromium dir for the given portal + active user.

    The active user is read from HERON_USER_ID at call time so the
    same Python process can switch between users via env mutation (rare,
    but well-defined: each spawn from the orchestrator gets its own env).

    Exported for callers that need to test existence before spawning a
    browser (the "ERROR: not logged in" preflight in scan-linkedin-auth
    etc.). Internal users should prefer launch_persistent() which calls
    this transparently.
    """
    if portal not in KNOWN_PORTALS:
        raise ValueError(f"Unknown portal: {portal!r}. Known: {sorted(KNOWN_PORTALS)}")
    # Lazy import so this module stays usable for tooling that doesn't
    # have lib_profiles on the path (lefthook hooks, etc.).
    from lib_profiles import resolve_user_arg, SYSTEM_USER_ID  # noqa: E402

    user_id = resolve_user_arg()
    if user_id == SYSTEM_USER_ID:
        # Legacy single-user fallback -- under the _shared escape-hatch
        # so the layout reads as "every dir under profiles/ is either
        # a profile or _shared".
        udd = REPO_ROOT / "data" / "profiles" / "_shared" / f".playwright-{portal}"
    else:
        udd = REPO_ROOT / "data" / "users" / user_id / f".playwright-{portal}"
    udd.mkdir(parents=True, exist_ok=True)
    return udd


@contextmanager
def launch_persistent(
    portal: Literal["linkedin", "indeed"], headed: bool = False
) -> Iterator[BrowserContext]:
    """
    Launch a Chromium persistent context for `portal`. Yields a
    BrowserContext that the caller uses to open pages. Cleans up on exit.

    `headed=True` is for the one-time login flow; the user has to see the
    browser to type credentials. `headed=False` is the headless scrape mode.
    """
    udd = user_data_dir(portal)
    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(
            user_data_dir=str(udd),
            headless=not headed,
            viewport={"width": 1280, "height": 900},
            user_agent=(
                # Use a recent stable Chromium UA so LinkedIn/Indeed don't
                # serve a "your browser is unsupported" page. Don't pretend
                # to be a different browser entirely; the bot-detection
                # signal is more about the JS-runtime fingerprint.
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            args=[
                "--disable-blink-features=AutomationControlled",
            ],
        )
        try:
            yield ctx
        finally:
            try:
                ctx.close()
            except Exception:
                pass


def humanize(min_s: float = 1.5, max_s: float = 4.0) -> None:
    """Random sleep between actions to mimic human cadence. Tuned to be
    safe — long enough that LinkedIn / Indeed don't immediately throttle,
    short enough that scraping a few hundred jobs still finishes in
    minutes not hours."""
    time.sleep(random.uniform(min_s, max_s))


def is_logged_in_linkedin(page: Page) -> bool:
    """Navigate to /feed/ and infer login state from the resulting URL.
    LinkedIn redirects unauthenticated users to /authwall, /login, or
    /signup; logged-in users stay on /feed.

    Match on parsed hostname + path rather than `in url` substring. The
    previous substring form was flagged by CodeQL's
    `py/incomplete-url-substring-sanitization`: a URL whose PATH contains
    `linkedin.com` (`https://attacker.example/?u=linkedin.com`) would
    have fooled the host check.
    """
    try:
        page.goto(
            "https://www.linkedin.com/feed/",
            timeout=PROBE_TIMEOUT_MS,
            wait_until="domcontentloaded",
        )
    except PlaywrightTimeout:
        return False
    parsed = urlparse(page.url)
    host = (parsed.hostname or "").lower()
    path = (parsed.path or "").lower()
    if "login" in path or "signup" in path or "authwall" in path or "checkpoint" in path:
        return False
    return path.startswith("/feed") or host == "linkedin.com" or host.endswith(".linkedin.com")


def is_logged_in_indeed(page: Page) -> bool:
    """Navigate to /account and infer login state. Indeed redirects
    unauthenticated users to secure.indeed.com/auth or /account/login.

    Match on parsed hostname + path rather than `in url` substring (see
    is_logged_in_linkedin for the CodeQL rationale).
    """
    try:
        page.goto(
            "https://www.indeed.com/account",
            timeout=PROBE_TIMEOUT_MS,
            wait_until="domcontentloaded",
        )
    except PlaywrightTimeout:
        return False
    parsed = urlparse(page.url)
    host = (parsed.hostname or "").lower()
    path = (parsed.path or "").lower()
    if path.startswith("/auth") or path.startswith("/login"):
        return False
    if host == "secure.indeed.com" and "auth" in path:
        return False
    return host == "indeed.com" or host.endswith(".indeed.com")


def login_interactive(portal: Literal["linkedin", "indeed"]) -> bool:
    """
    Open a HEADED browser, navigate to the portal's login page, and wait
    for the user to complete login (including any 2FA / captcha) — up to
    LOGIN_TIMEOUT_S. Returns True on success.

    Detection strategy: poll `is_logged_in_*` once a second; once it
    returns True, wait an extra 2s for cookies to fully persist, then
    close the browser. The persistent_context save is automatic.
    """
    landing = {
        "linkedin": "https://www.linkedin.com/login",
        "indeed": "https://secure.indeed.com/auth",
    }[portal]
    is_logged_in = is_logged_in_linkedin if portal == "linkedin" else is_logged_in_indeed

    print(
        f"[lib_playwright_auth] Opening browser for {portal} login… complete it on screen.",
        file=sys.stderr,
    )
    with launch_persistent(portal, headed=True) as ctx:
        page = ctx.new_page()
        try:
            page.goto(landing, timeout=PROBE_TIMEOUT_MS, wait_until="domcontentloaded")
        except PlaywrightTimeout:
            print(f"[lib_playwright_auth] Timed out loading {landing}", file=sys.stderr)
            # Continue -- the user may have manually navigated to a different URL.

        # Poll for login completion.
        deadline = time.time() + LOGIN_TIMEOUT_S
        while time.time() < deadline:
            time.sleep(2)
            try:
                if is_logged_in(page):
                    # Give cookies an extra moment to settle before context close.
                    time.sleep(2)
                    print(
                        f"[lib_playwright_auth] {portal} login confirmed.",
                        file=sys.stderr,
                    )
                    return True
            except Exception:
                # Page may navigate during login (LinkedIn does); polling can
                # race with that. Just re-check on the next iteration.
                continue

    print(
        f"[lib_playwright_auth] {portal} login timed out — closing browser.",
        file=sys.stderr,
    )
    return False


def check_session(portal: Literal["linkedin", "indeed"]) -> bool:
    """Quick headless probe — used by the /sources page's Test button.
    Spawns a fresh browser, checks login state, exits. Doesn't touch any
    state beyond reading it."""
    if portal not in KNOWN_PORTALS:
        return False
    # user_data_dir creates the dir if missing; check whether it
    # contains a real session (cookies file is the canonical marker
    # set by Chromium on first persistent write).
    try:
        udd = user_data_dir(portal)
    except ValueError:
        return False
    cookies = udd / "Default" / "Cookies"
    if not cookies.exists():
        return False
    is_logged_in = is_logged_in_linkedin if portal == "linkedin" else is_logged_in_indeed
    with launch_persistent(portal, headed=False) as ctx:
        page = ctx.new_page()
        return is_logged_in(page)


# Allow running as a CLI for `--login` / `--check-session` (used by the
# /api/sources/[id]/{connect,test} endpoints + as a debugging helper).
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--portal", choices=["linkedin", "indeed"], required=True)
    grp = parser.add_mutually_exclusive_group(required=True)
    grp.add_argument(
        "--login",
        action="store_true",
        help="Open headed browser, wait for login, save session",
    )
    grp.add_argument(
        "--check-session",
        action="store_true",
        help="Headless probe — exits 0 if logged in, 1 otherwise",
    )
    args = parser.parse_args()

    if args.login:
        ok = login_interactive(args.portal)
        sys.exit(0 if ok else 1)
    if args.check_session:
        ok = check_session(args.portal)
        sys.exit(0 if ok else 1)
