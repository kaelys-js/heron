#!/usr/bin/env python3
"""
apply-indeed.py — Indeed autonomous-apply adapter.

The hardest of the 6 stub portals. Indeed has aggressive anti-bot:
  - Headless Chromium often gets a 403 or a "verify you're human"
    challenge. We use launch_persistent_context with .playwright-indeed/
    so the session warms up across runs (same pattern as Ashby).
  - Two application paths on Indeed: (1) "Easy Apply" in-app which we
    can attempt, (2) external redirect — links to a third-party ATS.
    For (2) we DON'T attempt the redirect (the user should requeue
    against the actual ATS URL); we exit manual-apply-needed.
  - Indeed forces login for most apply paths. First-time setup needs
    `--login` flow which we delegate to the user via Sources connect.
  - Some Indeed listings have "applied previously" badges — detect those.

Realistic expectation: succeeds on Easy-Apply-only Indeed listings when
the user has a warmed-up session. Falls back to ManualApplyNeeded on
external redirects and on anti-bot challenges.
"""

from pathlib import Path
import sys

ROOT = Path(__file__).parent
REPO_ROOT = ROOT.parent.parent  # scripts/<domain>/ → repo/
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))

from lib_portal import PortalConfig, adapter_main  # noqa: E402
from lib_playwright_auth import user_data_dir as _resolve_user_data_dir  # noqa: E402


def indeed_config() -> PortalConfig:
    return PortalConfig(
        portal_id="indeed",
        # Per-user Playwright session -- resolves to
        # data/users/{uid}/.playwright-indeed/ under multi-user.
        user_data_dir=_resolve_user_data_dir("indeed"),
        first_name_selectors=[
            'input[id*="firstName"]',
            'input[name="firstName"]',
            'input[autocomplete="given-name"]',
        ],
        last_name_selectors=[
            'input[id*="lastName"]',
            'input[name="lastName"]',
            'input[autocomplete="family-name"]',
        ],
        email_selectors=[
            'input[id*="email"]',
            'input[type="email"]',
            'input[autocomplete="email"]',
        ],
        phone_selectors=[
            'input[id*="phone"]',
            'input[type="tel"]',
            'input[autocomplete="tel"]',
        ],
        resume_selectors=[
            'input[type="file"][accept*="pdf"]',
            'input[type="file"]',
        ],
        submit_selectors=[
            'button:has-text("Submit your application")',
            'button:has-text("Submit application")',
            'button:has-text("Continue")',  # multi-page paths end on Submit, but Continue is the wizard step
            'button[type="submit"]',
        ],
        next_selectors=[
            'button:has-text("Continue")',
            'button:has-text("Next")',
        ],
        cookie_dismiss_selectors=[
            'button:has-text("Accept all cookies")',
            'button:has-text("Accept Cookies")',
            "#onetrust-accept-btn-handler",
        ],
        initial_apply_selectors=[
            'button:has-text("Apply now")',
            'a:has-text("Apply now")',
            'button[id*="applyButton"]',
            "#indeedApplyButton",
        ],
        already_applied_markers=[
            "applied to this job",
            "you previously applied",
            "application already sent",
        ],
        confirmation_markers=[
            "your application has been submitted",
            "thank you for applying",
            "application sent",
        ],
        # Indeed's Easy Apply is a multi-step wizard (résumé → questions
        # → review → submit). Walk it.
        multipage=True,
        max_pages=6,
    )


if __name__ == "__main__":
    sys.exit(adapter_main(indeed_config, "Indeed autonomous apply adapter (Easy Apply paths only)"))
