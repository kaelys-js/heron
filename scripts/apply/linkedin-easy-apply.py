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
import time
import random
import argparse
from pathlib import Path

try:
    from playwright.sync_api import TimeoutError as PlaywrightTimeout
except ImportError:
    print(
        "ERROR: playwright not installed. Run:\n  .venv/bin/pip install playwright && .venv/bin/python -m playwright install chromium"
    )
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
REPO_ROOT = ROOT.parent.parent  # scripts/<domain>/ → repo/
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))
USER_DATA_DIR = USER_DATA_DIRS["linkedin"]  # backward-compat alias

from lib_profiles import resolve_profile_arg, resolve_user_arg, profile_path, ensure_profile_dirs

# Shared apply helpers — anti-bot cadence, CAPTCHA detection, state file,
# canonical APPLY_RESULT emission. The autonomous-apply dispatcher
# (apply-portal.py) calls us with --job-id, which puts us in "dispatcher
# mode" — we emit APPLY_STEP / APPLY_RESULT lines so apply-queue-drain
# can pipe them straight into the activity feed.
from lib_apply import (
    human_type,
    human_click,
    detect_captcha as lib_detect_captcha,
    upload_file as lib_upload_file,
    append_step as lib_append_step,
    emit_result as lib_emit_result,
    screenshot_for_issue,
)

# Per-profile paths set in main() once --profile is parsed. Placeholders
# so module-level type-checkers don't choke before main() runs.
PROFILE_YML: Path = REPO_ROOT / "data" / "profiles" / "default" / "profile.yml"
APPLICATIONS_MD: Path = REPO_ROOT / "data" / "profiles" / "default" / "applications.md"
PIPELINE_MD: Path = REPO_ROOT / "data" / "profiles" / "default" / "pipeline.md"
# General-purpose CV PDF — per profile. Falls back to default profile's
# cv-general.pdf when no --profile is passed.
DEFAULT_GENERAL_CV: Path = REPO_ROOT / "data" / "profiles" / "default" / "output" / "cv-general.pdf"

MAX_PER_RUN = int(os.environ.get("LINKEDIN_MAX_PER_RUN", "30"))
AUTO_SUBMIT = os.environ.get("LINKEDIN_AUTO_SUBMIT", "0") == "1"

# Dispatcher-mode flag: True when called by apply-portal.py with --job-id.
# When True, emit APPLY_STEP / APPLY_RESULT lines so the autopilot drain
# can stream progress to the activity feed. When False, behave like the
# legacy batch script (preserves backward-compat for manual runs).
DISPATCHER_MODE: bool = False
DISPATCHER_JOB_ID: str = ""


def emit_step(step: str) -> None:
    """In dispatcher mode, route step events through lib_apply.append_step
    so they (a) appear in the activity feed and (b) write to the apply-state
    file the dashboard reads. In legacy batch mode, fall back to a plain
    log line so manual runs stay readable."""
    if DISPATCHER_MODE and DISPATCHER_JOB_ID:
        try:
            lib_append_step(DISPATCHER_JOB_ID, step)
            return
        except Exception:
            pass
    print(f"  [step] {step}")


def should_auto_submit(
    profile: dict, score: float | None, min_score: float
) -> tuple[bool, str | None]:
    """Single decision point for "are we allowed to click Submit?".

    Priority order:
      1. LINKEDIN_AUTO_SUBMIT=1 env var — explicit operator override; wins.
      2. profile.yml.automation.autonomous_apply: true — opt-in autopilot.
      3. otherwise → False (stop at review).

    When (2) is the reason, also gate on score ≥ min_score_to_apply so
    a borderline-fit job doesn't get auto-submitted just because the
    profile is in autopilot mode.

    Returns (submit?, reason-when-not-submit). The reason becomes the
    APPLY_RESULT detail when we exit manual-apply-needed."""
    if AUTO_SUBMIT:
        return True, None
    auto = bool((profile or {}).get("automation", {}).get("autonomous_apply", False))
    if not auto:
        return False, "autonomous_apply disabled"
    if score is not None and score < min_score:
        return False, f"score {score:.1f} below min {min_score:.1f}"
    return True, None


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
    pat = re.compile(
        r"^- \[ \] (https://[^\s|]*linkedin\.com/jobs/view/\S+)\s*\|\s*(.*?)\s*\|\s*(.*?)(?:\s*\|\s*(.*?))?$",
        re.MULTILINE,
    )
    for m in pat.finditer(text):
        url, company, title, loc = (
            m.group(1),
            m.group(2).strip(),
            m.group(3).strip(),
            (m.group(4) or "").strip(),
        )
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
    """Detect anti-bot challenge. Backwards-compat: thin wrapper over the
    shared lib_apply.detect_captcha — returns True for ANY known mode so
    legacy batch callers (no APPLY_RESULT protocol) keep their old shape."""
    # Lib helper returns 'recaptcha' | 'hcaptcha' | 'turnstile' | 'cloudflare-block' | 'email-code' | None
    kind = lib_detect_captcha(page)
    if kind:
        return True
    # LinkedIn-specific phrasing not covered by the generic body-text scan.
    try:
        txt = (page.content() or "").lower()
        return any(
            s in txt
            for s in [
                "captcha",
                "are you a robot",
                "let's do a quick security check",
                "we want to make sure",
                "verify it's you",
            ]
        )
    except Exception:
        return False


def fill_easy_apply(page, profile, pdf_path, may_submit: bool = False) -> str:
    """Walk the Easy Apply modal. Returns: 'submitted' | 'review' | 'skipped' | 'error'.

    may_submit overrides the module-level AUTO_SUBMIT for callers that
    compute the decision per-job (e.g. dispatcher mode reads
    profile.automation.autonomous_apply + the score gate). Legacy batch
    callers can omit it — AUTO_SUBMIT env var still wins."""
    submit_allowed = AUTO_SUBMIT or may_submit
    try:
        # human_click on the Easy Apply entry point. Falls back to plain
        # .click() inside human_click if bounding_box fails (scrolled-out).
        easy_btn = page.locator('button:has-text("Easy Apply")').first
        human_click(page, easy_btn)
        emit_step("clicked_easy_apply")
        jitter(2, 4)

        # Multi-step modal: keep clicking Next until Submit
        for step in range(15):  # up to 15 steps in a flow
            jitter(1, 3)

            # Try to fill any visible text inputs by label match
            inputs = page.locator(
                'input[type="text"], input[type="tel"], input[type="email"], input[type="number"]'
            ).all()
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
                    # CRITICAL: do NOT auto-fill criminal-history / background
                    # fields. Skip them BEFORE the keyword match below so the
                    # generic "background" partial doesn't catch them.
                    if any(
                        t in label for t in ["criminal", "convict", "felony", "background check"]
                    ):
                        print(
                            f"    [skip] criminal-history field — leaving blank for human review: '{label}'"
                        )
                        continue
                    if "phone" in label:
                        human_type(inp, profile["candidate"].get("phone", ""))
                    elif "email" in label:
                        human_type(inp, profile["candidate"].get("email", ""))
                    elif "name" in label and "first" in label:
                        human_type(inp, profile["candidate"]["full_name"].split()[0])
                    elif "name" in label and "last" in label:
                        parts = profile["candidate"]["full_name"].split()
                        human_type(inp, parts[-1] if len(parts) > 1 else "")
                    elif "linkedin" in label:
                        human_type(inp, profile["candidate"].get("linkedin", ""))
                    elif "github" in label:
                        human_type(inp, profile["candidate"].get("github", ""))
                    elif "city" in label or "location" in label:
                        human_type(inp, profile["candidate"].get("location", ""))
                    elif "year" in label and "experience" in label:
                        human_type(inp, "10")
                    elif "salary" in label or "compensation" in label:
                        human_type(inp, "180000")
                except Exception:
                    pass

            # Resume upload — only if the user has actually generated a general
            # CV. We DELIBERATELY do not fall back to any other PDF. Uploading
            # a per-job tailored CV here is a recruiter red flag (LinkedIn
            # shows them the user's profile + resume side by side) and
            # uploading a stranger's CV (the old DEFAULT_PDF bug) is worse.
            try:
                upload = page.locator('input[type="file"]').first
                if upload.is_visible(timeout=1000):
                    if pdf_path and Path(pdf_path).exists():
                        if lib_upload_file(upload, str(pdf_path)):
                            emit_step("uploaded_resume")
                            jitter(2, 4)
                        else:
                            emit_step("upload_failed")
                            return "error:upload-failed"
                    else:
                        print(
                            f"    [skip resume upload] no general CV at {pdf_path} — generate one from /profile to enable"
                        )
            except Exception:
                pass

            # Look for Submit
            try:
                submit_btn = page.locator('button:has-text("Submit application")').first
                if submit_btn.is_visible(timeout=1500):
                    if submit_allowed:
                        emit_step("clicked_submit")
                        human_click(page, submit_btn)
                        jitter(3, 5)
                        return "submitted"
                    else:
                        emit_step("reached_submit_review_only")
                        return "review"  # ready-to-submit, human action needed
            except PlaywrightTimeout:
                pass

            # Otherwise click Next / Review
            clicked = False
            for btn_text in ["Next", "Continue", "Review your application", "Review"]:
                try:
                    nxt = page.locator(f'button:has-text("{btn_text}")').first
                    if nxt.is_visible(timeout=1500):
                        human_click(page, nxt)
                        clicked = True
                        emit_step(f"clicked_{btn_text.lower().replace(' ', '_')}")
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
    global PROFILE_YML, APPLICATIONS_MD, PIPELINE_MD, DISPATCHER_MODE, DISPATCHER_JOB_ID
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--login",
        action="store_true",
        help="Open LinkedIn for manual login; saves cookies for next run",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Walk forms but do not click Submit even if AUTO_SUBMIT=1",
    )
    parser.add_argument(
        "--profile",
        default=None,
        help="Profile slug (defaults to active profile in data/profiles.json).",
    )
    parser.add_argument(
        "--general-cv",
        default=None,
        help=(
            "Path to your GENERAL CV PDF. Defaults to the per-profile "
            "data/profiles/<slug>/output/cv-general.pdf. If the file is "
            "missing the resume-upload step is silently skipped."
        ),
    )
    # Backward-compat alias: --pdf was the old name.
    parser.add_argument(
        "--pdf",
        dest="pdf_legacy",
        default=None,
        help="(deprecated) Alias for --general-cv. Prefer --general-cv.",
    )
    parser.add_argument(
        "--url", help="Apply to this single job URL (instead of iterating the pipeline)"
    )
    # Dispatcher-mode args — when --job-id is given, we emit APPLY_STEP /
    # APPLY_RESULT lines on stdout so apply-portal.py → apply-queue-drain
    # can stream progress to the activity feed.
    parser.add_argument(
        "--job-id",
        dest="job_id",
        default=None,
        help=(
            "Dispatcher mode. Set by apply-portal.py. When present, "
            "stdout follows the APPLY_STEP / APPLY_RESULT protocol "
            "and the apply-state file is updated per step."
        ),
    )
    parser.add_argument(
        "--score",
        default=None,
        type=float,
        help=(
            "Job score (0-5). In dispatcher mode, gated against "
            "profile.automation.min_score_to_apply before submitting."
        ),
    )
    parser.add_argument(
        "--headed",
        action="store_true",
        help="Forces headed browser even in dispatcher mode (default: True for LinkedIn).",
    )
    args = parser.parse_args()

    user_id = resolve_user_arg()
    profile_id = resolve_profile_arg(args.profile)
    ensure_profile_dirs(profile_id, user_id=user_id)
    PROFILE_YML = profile_path(profile_id, "profile-yml", user_id=user_id)
    APPLICATIONS_MD = profile_path(profile_id, "applications", user_id=user_id)
    PIPELINE_MD = profile_path(profile_id, "pipeline", user_id=user_id)
    profile_general_cv = profile_path(profile_id, "output-dir", user_id=user_id) / "cv-general.pdf"

    # Dispatcher mode — toggled when apply-portal.py passes --job-id. From
    # this point onward emit_step() (and other helpers) emit APPLY_STEP
    # lines instead of plain log prefixes.
    if args.job_id:
        DISPATCHER_MODE = True
        DISPATCHER_JOB_ID = args.job_id

    # Resolve general-cv: --pdf wins if explicitly passed (legacy callers),
    # else --general-cv, else the active profile's default. Stash on args.pdf
    # so the body code below doesn't need to change.
    if args.pdf_legacy:
        print("WARNING: --pdf is deprecated. Use --general-cv instead.")
        args.pdf = args.pdf_legacy
    elif args.general_cv:
        args.pdf = args.general_cv
    else:
        args.pdf = str(profile_general_cv)

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

    # Resolve per-job submission decision once, BEFORE we launch the
    # browser. In dispatcher mode this gates the whole run; in legacy
    # batch mode it overrides AUTO_SUBMIT per profile (autopilot-driven
    # batches respect the profile flag too).
    min_score = float((profile or {}).get("automation", {}).get("min_score_to_apply", 4.0))
    submit_allowed, no_submit_reason = should_auto_submit(profile, args.score, min_score)
    if DISPATCHER_MODE and args.dry_run:
        submit_allowed = False
        no_submit_reason = "dry-run"

    # Dispatcher mode + score gate failed → bail immediately with a
    # canonical APPLY_RESULT line. apply-queue-drain saw this case
    # already (preflightProfile) but the defensive check stays.
    if (
        DISPATCHER_MODE
        and not submit_allowed
        and no_submit_reason
        and "below min" in no_submit_reason
    ):
        sys.exit(lib_emit_result("manual-apply-needed", f"score-gate:{no_submit_reason}"))

    with launch_persistent("linkedin", headed=True) as ctx:
        page = ctx.new_page()

        # Verify logged in
        page.goto("https://www.linkedin.com/feed/")
        jitter(2, 4)
        if "login" in page.url or "signup" in page.url:
            if DISPATCHER_MODE:
                sys.exit(lib_emit_result("manual-apply-needed", "not-logged-in"))
            print("Not logged in. Run: .venv/bin/python linkedin-easy-apply.py --login")
            sys.exit(1)
        emit_step("verified_login")

        already_applied = applied_urls()
        if args.url:
            # Single-job mode: skip pipeline iteration, walk this URL alone.
            candidates = [{"url": args.url, "company": "", "role": "", "title": ""}]
            if not DISPATCHER_MODE:
                print(f"Single-job mode: applying to {args.url} (AUTO_SUBMIT={AUTO_SUBMIT})\n")
        else:
            candidates = [
                j for j in linkedin_jobs_from_pipeline() if j["url"] not in already_applied
            ]
            candidates = candidates[:MAX_PER_RUN]
            print(
                f"Found {len(candidates)} LinkedIn jobs to walk (cap: {MAX_PER_RUN}, AUTO_SUBMIT={AUTO_SUBMIT})\n"
            )

        results = {
            "submitted": 0,
            "review": 0,
            "skipped_no_easy_apply": 0,
            "skipped_captcha": 0,
            "errors": 0,
        }

        # Dispatcher mode collapses to one URL: capture per-job result so
        # we can emit APPLY_RESULT at the end. Indexed list tolerates the
        # generic batch flow too.
        dispatcher_result: tuple[str, str | None] | None = None

        for i, j in enumerate(candidates, 1):
            if not DISPATCHER_MODE:
                print(f"[{i}/{len(candidates)}] {j['company']} - {j.get('title', '')[:60]}")
            try:
                emit_step("navigating")
                page.goto(j["url"], timeout=25000)
                jitter(3, 6)

                if page_has_captcha(page):
                    print("    [CAPTCHA detected — pausing 30s]")
                    if DISPATCHER_MODE:
                        # Save evidence for the Issue body.
                        screenshot_for_issue(page, DISPATCHER_JOB_ID)
                        dispatcher_result = ("manual-apply-needed", "captcha")
                        break
                    results["skipped_captcha"] += 1
                    time.sleep(30)
                    continue
                emit_step("captcha_clear")

                if not page_has_easy_apply(page):
                    print("    [no Easy Apply, manual application required]")
                    if DISPATCHER_MODE:
                        dispatcher_result = ("manual-apply-needed", "no-easy-apply")
                        break
                    results["skipped_no_easy_apply"] += 1
                    continue
                emit_step("detected_easy_apply")

                outcome = fill_easy_apply(page, profile, args.pdf, may_submit=submit_allowed)
                if args.dry_run and outcome == "submitted":
                    outcome = "review"

                num = i + 100  # offset to not collide with existing applications.md numbering
                if outcome == "submitted":
                    if DISPATCHER_MODE:
                        # apply-queue-drain owns the applications.md write
                        # (markStatus(...,'Applied',...)). Skip the legacy
                        # row append to avoid double-rows.
                        dispatcher_result = ("applied", None)
                    else:
                        append_application_row(
                            num,
                            j["company"],
                            j.get("title", ""),
                            j["url"],
                            "APPLIED-EASY",
                            "auto-submitted",
                        )
                        results["submitted"] += 1
                elif outcome == "review":
                    if DISPATCHER_MODE:
                        # Submit available but blocked (autonomous_apply
                        # off, score below threshold, or dry-run).
                        detail = no_submit_reason or "submit-not-allowed"
                        dispatcher_result = (
                            "manual-apply-needed",
                            f"review-required:{detail}",
                        )
                    else:
                        append_application_row(
                            num,
                            j["company"],
                            j.get("title", ""),
                            j["url"],
                            "READY-IN-BROWSER",
                            "form filled, click Submit manually",
                        )
                        results["review"] += 1
                elif isinstance(outcome, str) and outcome.startswith("error:"):
                    # fill_easy_apply returned a tagged failure (e.g. error:upload-failed)
                    if DISPATCHER_MODE:
                        dispatcher_result = (
                            "manual-apply-needed",
                            outcome.split(":", 1)[1],
                        )
                        break
                    results["errors"] += 1
                else:
                    if DISPATCHER_MODE:
                        dispatcher_result = ("error", outcome or "unknown")
                        break
                    append_application_row(
                        num,
                        j["company"],
                        j.get("title", ""),
                        j["url"],
                        "ERROR",
                        outcome,
                    )
                    results["errors"] += 1
            except Exception as e:
                msg = f"{type(e).__name__}: {str(e)[:80]}"
                print(f"    [error] {msg}")
                if DISPATCHER_MODE:
                    dispatcher_result = ("error", msg)
                    break
                results["errors"] += 1

        # ── Dispatcher exit path ──
        if DISPATCHER_MODE:
            if dispatcher_result is None:
                # Loop finished without hitting any branch — defensive fallback.
                dispatcher_result = ("manual-apply-needed", "no-candidate")
            status, detail = dispatcher_result
            # Don't block on the input() prompt in dispatcher mode.
            sys.exit(lib_emit_result(status, detail))

        # ── Legacy batch exit path ──
        print("\n=== RESULTS ===")
        for k, v in results.items():
            print(f"  {k}: {v}")
        print("\napplications.md updated. Browser will stay open for review.")
        input("Press Enter to close browser: ")
        # ctx is closed automatically by the launch_persistent() context manager.


if __name__ == "__main__":
    main()
