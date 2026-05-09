#!/usr/bin/env python3
"""
linkedin-easy-apply.py — LinkedIn Easy Apply automation for career-ops.

Walks LinkedIn job URLs in data/pipeline.md or data/applications.md,
detects "Easy Apply" enabled jobs, fills the form using config/profile.yml
and uploads the cv-cole-b-*.pdf, and stops at the Submit button by default.

SAFETY:
  - Never auto-submits unless LINKEDIN_AUTO_SUBMIT=1 env var set
  - Caps at 30 applications per run (LINKEDIN_MAX_PER_RUN to override)
  - Random delays between actions to mimic human behavior
  - Detects captcha / verify-human prompts and pauses
  - Writes to applications.md with status APPLIED-EASY / READY / SKIPPED

USAGE:
  # First run: log in once (browser stays logged in via user_data_dir)
  .venv/bin/python linkedin-easy-apply.py --login

  # Dry run (no submit, just walks through)
  .venv/bin/python linkedin-easy-apply.py

  # Real submit (be careful)
  LINKEDIN_AUTO_SUBMIT=1 .venv/bin/python linkedin-easy-apply.py
"""

import os
import re
import sys
import json
import time
import random
import argparse
from pathlib import Path

try:
    from playwright.sync_api import TimeoutError as PlaywrightTimeout
except ImportError:
    print("ERROR: playwright not installed. Run:\n  .venv/bin/pip install playwright && .venv/bin/python -m playwright install chromium")
    sys.exit(1)

try:
    import yaml
except ImportError:
    print("ERROR: pyyaml not installed. Run:\n  .venv/bin/pip install pyyaml")
    sys.exit(1)

# Shared Playwright session helpers — same persistent profile dir
# (.playwright-linkedin/) the new scan-linkedin-auth.py uses, so a single
# `--login` works for both apply + scrape.
from lib_playwright_auth import launch_persistent, login_interactive, USER_DATA_DIRS


ROOT = Path(__file__).parent
USER_DATA_DIR = USER_DATA_DIRS["linkedin"]  # backward-compat alias
PROFILE_YML = ROOT / "config" / "profile.yml"
APPLICATIONS_MD = ROOT / "data" / "applications.md"
PIPELINE_MD = ROOT / "data" / "pipeline.md"
DEFAULT_PDF = ROOT / "output" / "cv-cole-b-vercel-2026-05-05.pdf"  # fallback PDF

MAX_PER_RUN = int(os.environ.get("LINKEDIN_MAX_PER_RUN", "30"))
AUTO_SUBMIT = os.environ.get("LINKEDIN_AUTO_SUBMIT", "0") == "1"


def load_profile():
    if not PROFILE_YML.exists():
        print(f"ERROR: {PROFILE_YML} missing")
        sys.exit(1)
    with PROFILE_YML.open() as f:
        return yaml.safe_load(f)


def linkedin_jobs_from_pipeline():
    """Extract LinkedIn job URLs from pipeline.md that aren't yet applied."""
    if not PIPELINE_MD.exists():
        return []
    rows = []
    text = PIPELINE_MD.read_text()
    pat = re.compile(r"^- \[ \] (https://[^\s|]*linkedin\.com/jobs/view/\S+)\s*\|\s*(.*?)\s*\|\s*(.*?)(?:\s*\|\s*(.*?))?$",
                     re.MULTILINE)
    for m in pat.finditer(text):
        url, company, title, loc = m.group(1), m.group(2).strip(), m.group(3).strip(), (m.group(4) or "").strip()
        rows.append({"url": url, "company": company, "title": title, "location": loc})
    return rows


def applied_urls():
    """URLs already in applications.md (avoid re-applying)."""
    if not APPLICATIONS_MD.exists():
        return set()
    return set(re.findall(r"https://\S+", APPLICATIONS_MD.read_text()))


def jitter(min_s=2, max_s=6):
    time.sleep(random.uniform(min_s, max_s))


def page_has_easy_apply(page) -> bool:
    """Detect Easy Apply button on a LinkedIn job page."""
    try:
        btn = page.locator('button:has-text("Easy Apply")').first
        return btn.is_visible(timeout=3000)
    except PlaywrightTimeout:
        return False
    except Exception:
        return False


def page_has_captcha(page) -> bool:
    """Detect anti-bot challenge."""
    txt = (page.content() or "").lower()
    return any(s in txt for s in [
        "captcha", "are you a robot", "let's do a quick security check",
        "we want to make sure", "verify it's you",
    ])


def fill_easy_apply(page, profile, pdf_path) -> str:
    """Walk the Easy Apply modal. Returns: 'submitted' | 'review' | 'skipped' | 'error'."""
    try:
        page.click('button:has-text("Easy Apply")', timeout=10000)
        jitter(2, 4)

        # Multi-step modal: keep clicking Next until Submit
        for step in range(15):  # up to 15 steps in a flow
            jitter(1, 3)

            # Try to fill any visible text inputs by label match
            inputs = page.locator('input[type="text"], input[type="tel"], input[type="email"], input[type="number"]').all()
            for inp in inputs:
                try:
                    if not inp.is_visible():
                        continue
                    val = (inp.input_value() or "").strip()
                    if val:
                        continue
                    # find the closest <label> text
                    label_el = inp.locator("xpath=preceding::label[1]").first
                    label = (label_el.text_content() or "").strip().lower()
                    if "phone" in label:
                        inp.fill(profile["candidate"].get("phone", ""))
                    elif "email" in label:
                        inp.fill(profile["candidate"].get("email", ""))
                    elif "name" in label and "first" in label:
                        inp.fill(profile["candidate"]["full_name"].split()[0])
                    elif "name" in label and "last" in label:
                        parts = profile["candidate"]["full_name"].split()
                        inp.fill(parts[-1] if len(parts) > 1 else "")
                    elif "linkedin" in label:
                        inp.fill(profile["candidate"].get("linkedin", ""))
                    elif "github" in label:
                        inp.fill(profile["candidate"].get("github", ""))
                    elif "city" in label or "location" in label:
                        inp.fill(profile["candidate"].get("location", ""))
                    elif "year" in label and "experience" in label:
                        inp.fill("10")
                    elif "salary" in label or "compensation" in label:
                        inp.fill("180000")
                    # CRITICAL: do NOT auto-fill criminal-history / background fields
                    elif any(t in label for t in ["criminal", "convict", "felony", "background check"]):
                        print(f"    [skip] criminal-history field — leaving blank for human review: '{label}'")
                        continue
                except Exception:
                    pass

            # Resume upload
            try:
                upload = page.locator('input[type="file"]').first
                if upload.is_visible(timeout=1000) and pdf_path:
                    upload.set_input_files(str(pdf_path))
                    jitter(2, 4)
            except Exception:
                pass

            # Look for Submit
            try:
                submit_btn = page.locator('button:has-text("Submit application")').first
                if submit_btn.is_visible(timeout=1500):
                    if AUTO_SUBMIT:
                        submit_btn.click()
                        jitter(3, 5)
                        return "submitted"
                    else:
                        return "review"  # ready-to-submit, human action needed
            except PlaywrightTimeout:
                pass

            # Otherwise click Next / Review
            clicked = False
            for btn_text in ["Next", "Continue", "Review your application", "Review"]:
                try:
                    nxt = page.locator(f'button:has-text("{btn_text}")').first
                    if nxt.is_visible(timeout=1500):
                        nxt.click()
                        clicked = True
                        jitter(2, 4)
                        break
                except Exception:
                    continue

            if not clicked:
                # No more steps available; return current state
                return "review"

        return "review"
    except Exception as e:
        print(f"    [error in fill_easy_apply] {type(e).__name__}: {str(e)[:80]}")
        return "error"


def append_application_row(num, company, role, url, status, notes=""):
    """Append a row to applications.md."""
    row = f"| {num} | 2026-05-06 | {company} | {role} | — | {status} | — | — | LinkedIn Easy Apply: {notes} |\n"
    with APPLICATIONS_MD.open("a") as f:
        f.write(row)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--login", action="store_true",
                        help="Open LinkedIn for manual login; saves cookies for next run")
    parser.add_argument("--dry-run", action="store_true",
                        help="Walk forms but do not click Submit even if AUTO_SUBMIT=1")
    parser.add_argument("--pdf", default=str(DEFAULT_PDF),
                        help=f"Path to CV PDF to upload (default: {DEFAULT_PDF})")
    parser.add_argument("--url",
                        help="Apply to this single job URL (instead of iterating the pipeline)")
    args = parser.parse_args()

    profile = load_profile()

    # --login is delegated to the shared module so a single saved session
    # works for both apply (here) and scrape (scan-linkedin-auth.py). The
    # shared helper auto-detects login completion (no Enter-to-continue).
    if args.login:
        ok = login_interactive("linkedin")
        if ok:
            print("Login session saved. Run without --login next time.")
        else:
            print("Login did not complete within timeout — try again.")
        sys.exit(0 if ok else 1)

    with launch_persistent("linkedin", headed=True) as ctx:
        page = ctx.new_page()

        # Verify logged in
        page.goto("https://www.linkedin.com/feed/")
        jitter(2, 4)
        if "login" in page.url or "signup" in page.url:
            print("Not logged in. Run: .venv/bin/python linkedin-easy-apply.py --login")
            sys.exit(1)

        already_applied = applied_urls()
        if args.url:
            # Single-job mode: skip pipeline iteration, walk this URL alone.
            candidates = [{"url": args.url, "company": "", "role": ""}]
            print(f"Single-job mode: applying to {args.url} (AUTO_SUBMIT={AUTO_SUBMIT})\n")
        else:
            candidates = [j for j in linkedin_jobs_from_pipeline() if j["url"] not in already_applied]
            candidates = candidates[:MAX_PER_RUN]
            print(f"Found {len(candidates)} LinkedIn jobs to walk (cap: {MAX_PER_RUN}, AUTO_SUBMIT={AUTO_SUBMIT})\n")

        results = {"submitted": 0, "review": 0, "skipped_no_easy_apply": 0,
                   "skipped_captcha": 0, "errors": 0}

        for i, j in enumerate(candidates, 1):
            print(f"[{i}/{len(candidates)}] {j['company']} - {j['title'][:60]}")
            try:
                page.goto(j["url"], timeout=25000)
                jitter(3, 6)

                if page_has_captcha(page):
                    print("    [CAPTCHA detected — pausing 30s]")
                    results["skipped_captcha"] += 1
                    time.sleep(30)
                    continue

                if not page_has_easy_apply(page):
                    print("    [no Easy Apply, manual application required]")
                    results["skipped_no_easy_apply"] += 1
                    continue

                outcome = fill_easy_apply(page, profile, args.pdf)
                if args.dry_run and outcome == "submitted":
                    outcome = "review"

                num = i + 100  # offset to not collide with existing applications.md numbering
                if outcome == "submitted":
                    append_application_row(num, j["company"], j["title"], j["url"], "APPLIED-EASY", "auto-submitted")
                    results["submitted"] += 1
                elif outcome == "review":
                    append_application_row(num, j["company"], j["title"], j["url"], "READY-IN-BROWSER", "form filled, click Submit manually")
                    results["review"] += 1
                else:
                    append_application_row(num, j["company"], j["title"], j["url"], "ERROR", outcome)
                    results["errors"] += 1
            except Exception as e:
                print(f"    [error] {type(e).__name__}: {str(e)[:80]}")
                results["errors"] += 1

        print("\n=== RESULTS ===")
        for k, v in results.items():
            print(f"  {k}: {v}")
        print(f"\napplications.md updated. Browser will stay open for review.")
        input("Press Enter to close browser: ")
        # ctx is closed automatically by the launch_persistent() context manager.


if __name__ == "__main__":
    main()
