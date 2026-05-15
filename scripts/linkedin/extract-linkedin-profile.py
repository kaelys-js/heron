#!/usr/bin/env python3
"""
extract-linkedin-profile.py — Pull a LinkedIn profile's text content using the
saved Playwright session (.playwright-linkedin/).

Used by the onboarding CV step's "Paste LinkedIn URL" path. Spits the
extracted plain text to stdout; the caller (the dashboard endpoint) then
hands that text to the same Claude transformer as the "Paste plain text"
path so it gets converted into canonical markdown CV sections.

Why authenticated: LinkedIn aggressively blocks public scraping (auth-walls
on profile pages, JS-only rendering, IP rate-limits). The user's saved
session bypasses every one of those — same view they'd see when visiting
the URL themselves.

USAGE
-----

  .venv/bin/python extract-linkedin-profile.py --url https://www.linkedin.com/in/jane

OUTPUT
------

stdout: the profile's visible text (Name, headline, About, Experience,
Education, Skills…). One section per heading. The /api/profile/cv-from-linkedin
endpoint forwards this to Claude for markdown structuring.

Exits 0 on success, non-zero on:
  2  — bad CLI args
  3  — session not connected (re-run linkedin-easy-apply.py --login)
  4  — auth-wall hit (URL was wrong, profile is private, or session expired)
  5  — playwright timeout fetching the page
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent  # scripts/linkedin/
REPO_ROOT = ROOT.parent.parent  # repo root
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))

try:
    from playwright.sync_api import TimeoutError as PlaywrightTimeout
except ImportError:
    print("ERROR: playwright not installed.", file=sys.stderr)
    sys.exit(2)

from lib_playwright_auth import (
    launch_persistent,
    is_logged_in_linkedin,
    USER_DATA_DIRS,
)


def normalise_url(raw: str) -> str:
    """Accept linkedin.com/in/jane, www.linkedin.com/in/jane, full https URL.
    Returns a canonical https://www.linkedin.com/in/{handle}/ form."""
    s = raw.strip()
    if not s:
        raise ValueError("empty url")
    # Strip protocol if present
    if s.startswith("http://") or s.startswith("https://"):
        s = s.split("://", 1)[1]
    # Drop any leading www.
    if s.startswith("www."):
        s = s[len("www.") :]
    if not s.startswith("linkedin.com/in/"):
        raise ValueError(f"not a LinkedIn /in/ profile URL: {raw!r}")
    # Drop query / fragment
    s = s.split("?")[0].split("#")[0]
    if not s.endswith("/"):
        s += "/"
    return "https://www." + s


def extract_profile_text(url: str) -> str:
    """Visit the URL using the saved LinkedIn session and pull the visible
    text content. Scrolls a few times to trigger lazy-loaded sections
    (Experience / Education / Skills are commonly below the fold)."""
    udd = USER_DATA_DIRS["linkedin"]
    if not udd.exists():
        print(
            "ERROR: LinkedIn session not connected. Run "
            "`python linkedin-easy-apply.py --login` or use the /sources page first.",
            file=sys.stderr,
        )
        sys.exit(3)

    with launch_persistent("linkedin", headed=False) as ctx:
        page = ctx.new_page()
        if not is_logged_in_linkedin(page):
            print(
                "ERROR: LinkedIn session expired. Re-connect from /sources.",
                file=sys.stderr,
            )
            sys.exit(3)

        try:
            page.goto(url, timeout=20_000, wait_until="domcontentloaded")
        except PlaywrightTimeout:
            print(f"ERROR: timeout fetching {url}", file=sys.stderr)
            sys.exit(5)

        # Scroll progressively so lazy-loaded sections render.
        for _ in range(8):
            try:
                page.mouse.wheel(0, 1500)
            except Exception:
                pass
            time.sleep(0.5)
        time.sleep(1.0)

        cur = (page.url or "").lower()
        if "authwall" in cur or "/login" in cur or "/signup" in cur:
            print(
                "ERROR: LinkedIn served an auth-wall — profile is private or session is stale.",
                file=sys.stderr,
            )
            sys.exit(4)

        # Pull the main profile container if available; fall back to body.
        # `main` covers the modern profile layout consistently.
        try:
            main = page.locator("main").first
            text = main.inner_text(timeout=5_000)
        except PlaywrightTimeout:
            text = page.inner_text("body")
        except Exception:
            text = page.inner_text("body")

        # Compress runs of blank lines so Claude doesn't waste tokens on
        # whitespace.
        lines = [ln.rstrip() for ln in text.split("\n")]
        out: list[str] = []
        prev_blank = False
        for ln in lines:
            blank = not ln.strip()
            if blank and prev_blank:
                continue
            out.append(ln)
            prev_blank = blank
        return "\n".join(out).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True, help="LinkedIn profile URL")
    args = parser.parse_args()

    try:
        url = normalise_url(args.url)
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(2)

    text = extract_profile_text(url)
    if not text or len(text) < 200:
        print(
            "ERROR: extracted text is suspiciously short — profile may be empty or restricted.",
            file=sys.stderr,
        )
        sys.exit(4)

    sys.stdout.write(text)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
