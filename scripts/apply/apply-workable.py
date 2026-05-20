#!/usr/bin/env python3
"""
apply-workable.py — Workable autonomous-apply adapter.

Apply URL pattern: https://apply.workable.com/{tenant}/j/{shortcode}/apply/
(falls back to / form if the user passed the description URL)

Workable's quirks:
  - Phone uses intl-tel-input similar to Greenhouse (but the wrapper
    selectors differ — Workable uses .iti class but the country search
    is inside a different popup).
  - Custom Q&A is rendered as a sequence of <div data-ui="question"> blocks
    with label + input pairs. No public schema API for non-premium tenants.
  - Resume input is a hidden <input type="file"> behind a styled wrapper.
  - Submit is plain <button type="submit"> with text "Submit application".
"""

from pathlib import Path
import sys

ROOT = Path(__file__).parent
REPO_ROOT = ROOT.parent.parent  # scripts/<domain>/ → repo/
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))

from lib_portal import PortalConfig, adapter_main  # noqa: E402
from lib_playwright_auth import user_data_dir as _resolve_user_data_dir  # noqa: E402


def _url_transform(url: str) -> str:
    """Workable description page → apply page. Append /apply/ if missing."""
    url = url.rstrip("/")
    if url.endswith("/apply"):
        return url + "/"
    if url.endswith("/apply/"):
        return url
    # Description URLs look like .../j/{shortcode}
    return url + "/apply/"


def workable_config() -> PortalConfig:
    return PortalConfig(
        portal_id="workable",
        # Per-user Playwright session -- resolves to data/users/{uid}/.playwright-workable/
        # under multi-user, or data/profiles/_shared/.playwright-workable/ for legacy.
        user_data_dir=_resolve_user_data_dir("workable"),
        first_name_selectors=[
            'input[name="firstname"]',
            'input[name="first_name"]',
            'input[autocomplete="given-name"]',
        ],
        last_name_selectors=[
            'input[name="lastname"]',
            'input[name="last_name"]',
            'input[autocomplete="family-name"]',
        ],
        email_selectors=[
            'input[name="email"]',
            'input[type="email"]',
            'input[autocomplete="email"]',
        ],
        phone_selectors=[
            'input[name="phone"]',
            'input[type="tel"]',
        ],
        resume_selectors=[
            'input[type="file"][name="resume"]',
            'input[type="file"][accept*="pdf"]',
            'input[type="file"]',
        ],
        submit_selectors=[
            'button[type="submit"]:has-text("Submit")',
            'button:has-text("Submit application")',
            'button[type="submit"]',
        ],
        cookie_dismiss_selectors=[
            'button:has-text("Accept all")',
            'button:has-text("Accept cookies")',
            '[data-ui="cookie-banner"] button',
        ],
        initial_apply_selectors=[
            'a:has-text("Apply for this Job")',
            'a:has-text("Apply now")',
            'button:has-text("Apply now")',
        ],
        already_applied_markers=[
            "you've already applied",
            "application already submitted",
        ],
        confirmation_markers=[
            "application received",
            "thanks for applying",
        ],
        url_transform=_url_transform,
        multipage=False,
    )


if __name__ == "__main__":
    sys.exit(adapter_main(workable_config, "Workable autonomous apply adapter"))
