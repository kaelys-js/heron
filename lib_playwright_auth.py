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
      login_interactive, humanize, USER_DATA_DIRS,
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

import os
import sys
import time
import random
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Literal

try:
    from playwright.sync_api import sync_playwright, BrowserContext, Page, TimeoutError as PlaywrightTimeout
except ImportError:
    print("ERROR: playwright not installed. Run:\n  .venv/bin/pip install playwright && .venv/bin/python -m playwright install chromium", file=sys.stderr)
    sys.exit(1)


ROOT = Path(__file__).resolve().parent

# One persistent Chromium profile per portal. State (cookies, localStorage,
# cache) lives inside these dirs — wiping the dir disconnects the user.
USER_DATA_DIRS: dict[str, Path] = {
    "linkedin": ROOT / ".playwright-linkedin",
    "indeed": ROOT / ".playwright-indeed",
}

# Public so callers can reuse for `--check-session` etc.
LOGIN_TIMEOUT_S = 5 * 60       # 5 min for the user to complete the headed login
PROBE_TIMEOUT_MS = 15_000      # navigation timeouts during is_logged_in_* probes


def _user_data_dir(portal: str) -> Path:
    if portal not in USER_DATA_DIRS:
        raise ValueError(f"Unknown portal: {portal!r}. Known: {list(USER_DATA_DIRS)}")
    USER_DATA_DIRS[portal].mkdir(parents=True, exist_ok=True)
    return USER_DATA_DIRS[portal]


@contextmanager
def launch_persistent(portal: Literal["linkedin", "indeed"], headed: bool = False) -> Iterator[BrowserContext]:
    """
    Launch a Chromium persistent context for `portal`. Yields a
    BrowserContext that the caller uses to open pages. Cleans up on exit.

    `headed=True` is for the one-time login flow; the user has to see the
    browser to type credentials. `headed=False` is the headless scrape mode.
    """
    udd = _user_data_dir(portal)
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
    /signup; logged-in users stay on /feed."""
    try:
        page.goto("https://www.linkedin.com/feed/", timeout=PROBE_TIMEOUT_MS, wait_until="domcontentloaded")
    except PlaywrightTimeout:
        return False
    url = page.url.lower()
    if "login" in url or "signup" in url or "authwall" in url or "checkpoint" in url:
        return False
    return "/feed" in url or "linkedin.com" in url


def is_logged_in_indeed(page: Page) -> bool:
    """Navigate to /account and infer login state. Indeed redirects
    unauthenticated users to secure.indeed.com/auth or /account/login."""
    try:
        page.goto("https://www.indeed.com/account", timeout=PROBE_TIMEOUT_MS, wait_until="domcontentloaded")
    except PlaywrightTimeout:
        return False
    url = page.url.lower()
    if "/auth" in url or "/login" in url or "secure.indeed.com" in url and "auth" in url:
        return False
    return "indeed.com" in url


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

    print(f"[lib_playwright_auth] Opening browser for {portal} login… complete it on screen.", file=sys.stderr)
    with launch_persistent(portal, headed=True) as ctx:
        page = ctx.new_page()
        try:
            page.goto(landing, timeout=PROBE_TIMEOUT_MS, wait_until="domcontentloaded")
        except PlaywrightTimeout:
            print(f"[lib_playwright_auth] Timed out loading {landing}", file=sys.stderr)
            # Continue — the user may have manually navigated to a different URL.

        # Poll for login completion.
        deadline = time.time() + LOGIN_TIMEOUT_S
        while time.time() < deadline:
            time.sleep(2)
            try:
                if is_logged_in(page):
                    # Give cookies an extra moment to settle before context close.
                    time.sleep(2)
                    print(f"[lib_playwright_auth] {portal} login confirmed.", file=sys.stderr)
                    return True
            except Exception:
                # Page may navigate during login (LinkedIn does); polling can
                # race with that. Just re-check on the next iteration.
                continue

    print(f"[lib_playwright_auth] {portal} login timed out — closing browser.", file=sys.stderr)
    return False


def check_session(portal: Literal["linkedin", "indeed"]) -> bool:
    """Quick headless probe — used by the /sources page's Test button.
    Spawns a fresh browser, checks login state, exits. Doesn't touch any
    state beyond reading it."""
    udd = USER_DATA_DIRS.get(portal)
    if udd is None or not udd.exists():
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
    grp.add_argument("--login", action="store_true", help="Open headed browser, wait for login, save session")
    grp.add_argument("--check-session", action="store_true", help="Headless probe — exits 0 if logged in, 1 otherwise")
    args = parser.parse_args()

    if args.login:
        ok = login_interactive(args.portal)
        sys.exit(0 if ok else 1)
    if args.check_session:
        ok = check_session(args.portal)
        sys.exit(0 if ok else 1)
