#!/usr/bin/env python3
"""
apply-personio.py — Personio autonomous-apply adapter (DACH market).

Quirks:
  - DACH-focused: German labels are common (Vorname / Nachname / E-Mail-
    Adresse / Telefon). We match BOTH English and German via label-based
    fallbacks in lib_portal.discover_required_questions.
  - GDPR consent checkbox is MANDATORY and required for submit. Personio
    surfaces it as a checkbox near the bottom labeled "Einverständnis" /
    "I agree to the privacy policy". We auto-check the privacy-policy
    checkbox specifically (NOT marketing-consent ones — those stay off).
  - Public job postings are at {tenant}.jobs.personio.com/job/{id}.
    The /apply form is on the same domain.
  - Resume upload accepts PDF only.
"""

from pathlib import Path
import sys

ROOT = Path(__file__).parent
REPO_ROOT = ROOT.parent.parent  # scripts/<domain>/ → repo/
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))

from lib_portal import PortalConfig, adapter_main  # noqa: E402
from lib_playwright_auth import user_data_dir as _resolve_user_data_dir  # noqa: E402


def personio_config() -> PortalConfig:
    return PortalConfig(
        portal_id="personio",
        # Per-user Playwright session — resolves to data/users/{uid}/.playwright-personio/
        # under multi-user, or data/profiles/_shared/.playwright-personio/ for legacy.
        user_data_dir=_resolve_user_data_dir("personio"),
        first_name_selectors=[
            'input[name*="first_name"]',
            'input[name*="firstName"]',
            'input[name*="vorname" i]',
        ],
        last_name_selectors=[
            'input[name*="last_name"]',
            'input[name*="lastName"]',
            'input[name*="nachname" i]',
        ],
        email_selectors=[
            'input[type="email"]',
            'input[name*="email" i]',
            'input[name*="e_mail" i]',
        ],
        phone_selectors=[
            'input[type="tel"]',
            'input[name*="phone" i]',
            'input[name*="telefon" i]',
        ],
        resume_selectors=[
            'input[type="file"]',
        ],
        submit_selectors=[
            'button[type="submit"]:has-text("Submit")',
            'button[type="submit"]:has-text("Apply")',
            'button:has-text("Bewerbung absenden")',
            'button:has-text("Senden")',
            'button[type="submit"]',
        ],
        cookie_dismiss_selectors=[
            'button:has-text("Accept all")',
            'button:has-text("Alle akzeptieren")',
            'button:has-text("Alle ablehnen")',  # safer: reject all non-essentials
            'button:has-text("Akzeptieren")',
            '[data-testid="uc-accept-all-button"]',
        ],
        already_applied_markers=[
            "bewerbung wurde bereits eingereicht",
            "application already submitted",
        ],
        confirmation_markers=[
            "vielen dank",
            "bewerbung erfolgreich",
            "application submitted",
        ],
        multipage=False,
    )


if __name__ == "__main__":
    sys.exit(adapter_main(personio_config, "Personio autonomous apply adapter (DACH)"))
