#!/usr/bin/env python3
"""
apply-smartrecruiters.py — SmartRecruiters autonomous-apply adapter.

Quirks:
  - Public API: `https://api.smartrecruiters.com/v1/companies/{company}/postings/{id}`
    returns job details including the applicationQuestions list. We use
    it when available (it's free + auth-free).
  - Form URL pattern: jobs.smartrecruiters.com/{tenant}/{job-id}
    Apply button opens the form on the same page (single-page React).
  - SmartRecruiters uses its own field names: firstName / lastName / email
    / phoneNumber. No intl-tel-input on phone (plain text input).
  - Resume upload: `input[type=file][name="resume"]` reliably.
  - Submit: button text "Submit application".
"""

from pathlib import Path
import sys

ROOT = Path(__file__).parent
REPO_ROOT = ROOT.parent.parent  # scripts/<domain>/ → repo/
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))

from lib_portal import PortalConfig, adapter_main  # noqa: E402
from lib_playwright_auth import user_data_dir as _resolve_user_data_dir  # noqa: E402


def smartrecruiters_config() -> PortalConfig:
    return PortalConfig(
        portal_id="smartrecruiters",
        # Per-user Playwright session — resolves to data/users/{uid}/.playwright-smartrecruiters/
        # under multi-user, or data/profiles/_shared/.playwright-smartrecruiters/ for legacy.
        user_data_dir=_resolve_user_data_dir("smartrecruiters"),
        first_name_selectors=[
            'input[name="firstName"]',
            'input[name="first_name"]',
        ],
        last_name_selectors=[
            'input[name="lastName"]',
            'input[name="last_name"]',
        ],
        email_selectors=[
            'input[name="email"]',
            'input[type="email"]',
        ],
        phone_selectors=[
            'input[name="phoneNumber"]',
            'input[name="phone"]',
            'input[type="tel"]',
        ],
        resume_selectors=[
            'input[type="file"][name="resume"]',
            'input[type="file"]',
        ],
        submit_selectors=[
            'button:has-text("Submit application")',
            'button:has-text("Submit")',
            'button[type="submit"]',
        ],
        cookie_dismiss_selectors=[
            'button:has-text("Accept all")',
            'button:has-text("Accept Cookies")',
            "#onetrust-accept-btn-handler",
        ],
        initial_apply_selectors=[
            'button:has-text("I\'m interested")',
            'button:has-text("Apply")',
            'a:has-text("Apply")',
        ],
        already_applied_markers=[
            "you have already applied",
            "application received",
        ],
        confirmation_markers=[
            "application submitted",
            "thank you for applying",
        ],
        multipage=False,
    )


if __name__ == "__main__":
    sys.exit(adapter_main(smartrecruiters_config, "SmartRecruiters autonomous apply adapter"))
