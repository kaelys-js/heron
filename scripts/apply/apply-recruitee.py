#!/usr/bin/env python3
"""
apply-recruitee.py — Recruitee autonomous-apply adapter.

Quirks:
  - URL pattern: {company}.recruitee.com/o/{job-slug}/c/{candidate-id}
    Apply button on the description page opens an in-page form (no
    separate /apply URL needed for most tenants).
  - Public API: `https://{company}.recruitee.com/api/offers/{id}`
    Returns the job + custom questions when present.
  - Form fields use standard names: name, email, phone, cover_letter.
  - Resume input: `input[type=file]` (single, no specific name attr).
"""

from pathlib import Path
import sys

ROOT = Path(__file__).parent
REPO_ROOT = ROOT.parent.parent  # scripts/<domain>/ → repo/
sys.path.insert(0, str(ROOT))

from lib_portal import PortalConfig, adapter_main  # noqa: E402


def recruitee_config() -> PortalConfig:
    return PortalConfig(
        portal_id="recruitee",
        user_data_dir=REPO_ROOT / ".playwright-recruitee",
        name_selectors=[
            'input[name="name"]',
            'input[autocomplete="name"]',
        ],
        email_selectors=[
            'input[name="email"]',
            'input[type="email"]',
        ],
        phone_selectors=[
            'input[name="phone"]',
            'input[type="tel"]',
        ],
        resume_selectors=[
            'input[type="file"]',
        ],
        cover_letter_selectors=[
            'textarea[name="cover_letter"]',
            'textarea[name="motivation"]',
        ],
        submit_selectors=[
            'button[type="submit"]:has-text("Apply")',
            'button[type="submit"]:has-text("Submit")',
            'button[type="submit"]',
        ],
        cookie_dismiss_selectors=[
            'button:has-text("Accept all")',
            'button:has-text("Accept")',
            ".cookie-consent button",
        ],
        initial_apply_selectors=[
            'button:has-text("Apply for this job")',
            'a:has-text("Apply for this job")',
            'button:has-text("Apply")',
        ],
        already_applied_markers=[
            "you've already applied",
            "application already submitted",
        ],
        confirmation_markers=[
            "application submitted",
            "thanks for applying",
        ],
        multipage=False,
    )


if __name__ == "__main__":
    sys.exit(adapter_main(recruitee_config, "Recruitee autonomous apply adapter"))
