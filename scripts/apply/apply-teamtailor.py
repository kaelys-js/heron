#!/usr/bin/env python3
"""
apply-teamtailor.py — Teamtailor autonomous-apply adapter.

Quirks:
  - Form is React-based, similar shape to Ashby. Field selectors rely
    on aria-label rather than name= (Teamtailor randomizes name= attrs
    between versions).
  - URL pattern: {company}.teamtailor.com/jobs/{id} → Apply button on
    the page opens an in-page form (some tenants use a separate
    /jobs/{id}/applications/new route — both handled).
  - Standard fields: First name, Last name, Email, Phone, Resume.
  - Submit text: "Send application" or "Submit application".
"""

from pathlib import Path
import sys

ROOT = Path(__file__).parent
REPO_ROOT = ROOT.parent.parent  # scripts/<domain>/ → repo/
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))

from lib_portal import PortalConfig, adapter_main  # noqa: E402
from lib_playwright_auth import user_data_dir as _resolve_user_data_dir  # noqa: E402


def teamtailor_config() -> PortalConfig:
    return PortalConfig(
        portal_id="teamtailor",
        # Per-user Playwright session — resolves to data/users/{uid}/.playwright-teamtailor/
        # under multi-user, or data/profiles/_shared/.playwright-teamtailor/ for legacy.
        user_data_dir=_resolve_user_data_dir("teamtailor"),
        first_name_selectors=[
            'input[aria-label*="First name" i]',
            'input[name*="first" i]',
            'input[autocomplete="given-name"]',
        ],
        last_name_selectors=[
            'input[aria-label*="Last name" i]',
            'input[name*="last" i]',
            'input[autocomplete="family-name"]',
        ],
        email_selectors=[
            'input[type="email"]',
            'input[aria-label*="Email" i]',
            'input[autocomplete="email"]',
        ],
        phone_selectors=[
            'input[type="tel"]',
            'input[aria-label*="Phone" i]',
            'input[autocomplete="tel"]',
        ],
        resume_selectors=[
            'input[type="file"][accept*="pdf"]',
            'input[type="file"]',
        ],
        submit_selectors=[
            'button[type="submit"]:has-text("Send application")',
            'button[type="submit"]:has-text("Submit application")',
            'button[type="submit"]:has-text("Send")',
            'button[type="submit"]:has-text("Submit")',
            'button[type="submit"]',
        ],
        cookie_dismiss_selectors=[
            'button:has-text("Accept all")',
            'button:has-text("Allow all")',
            "#cookie-consent-button",
        ],
        initial_apply_selectors=[
            'a:has-text("Apply for this job")',
            'a:has-text("Apply now")',
            'button:has-text("Apply for this job")',
            'button:has-text("Apply now")',
        ],
        already_applied_markers=[
            "you've already applied",
            "application received",
        ],
        confirmation_markers=[
            "thanks for applying",
            "application sent",
            "application submitted",
        ],
        multipage=False,
    )


if __name__ == "__main__":
    sys.exit(adapter_main(teamtailor_config, "Teamtailor autonomous apply adapter"))
