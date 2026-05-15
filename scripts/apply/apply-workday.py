#!/usr/bin/env python3
"""
apply-workday.py — Workday autonomous-apply adapter (heuristic).

Workday is the hardest mainstream ATS to automate:

  - Every customer instance has a different DOM. Bank-of-America's
    Workday looks nothing like Google's. We use heuristic selectors
    (data-automation-id attributes are the closest thing to a standard)
    and graceful fail-soft on unknown form shapes.

  - Multi-page wizard: usually Personal Info → Work Experience →
    Voluntary Self-ID → Review → Submit. The "Next" button advances
    between pages; we walk all pages forward.

  - Account creation: most Workday instances FORCE candidate account
    creation (email + password) before applying. We DON'T create
    accounts automatically — that's a hard ethical line and breaks
    if the user has an existing account at the same instance.
    If the form asks "Sign in or create account", we exit
    manual-apply-needed:account-required.

  - "Apply with Resume" vs "Apply Manually": when both options appear,
    we prefer "Apply with Resume" because manual entry expands into
    50+ structured fields (work history per role per employer).

Production-quality realistic scope:
  - Handle the most common instance shape (data-automation-id-based)
  - Fail soft on account-required, custom Q&A we can't answer, and
    multi-page navigation getting stuck
  - Reuse persistent context for cookie warm-up (helps across-instance
    fingerprint consistency)

If/when this saturates, the path forward is per-customer-instance
overrides (e.g. a `workday-instances.yml` with selectors per known
Fortune-500 employer).
"""

from __future__ import annotations
import argparse
import random
import sys
import time
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
except ImportError:
    print("ERROR: playwright not installed.", file=sys.stderr)
    sys.exit(2)

try:
    import yaml
except ImportError:
    print("ERROR: pyyaml not installed.", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).parent
REPO_ROOT = ROOT.parent.parent  # scripts/<domain>/ → repo/
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))

from lib_apply import (  # noqa: E402
    human_type,
    human_click,
    detect_captcha,
    detect_already_applied,
    upload_file,
    append_step,
    emit_result,
    screenshot_for_issue,
    write_apply_state,
    load_form_answers,
    normalize_question,
    is_eeo_label,
    auto_decline_eeo,
)
from lib_profiles import resolve_profile_arg, profile_path  # noqa: E402

USER_DATA_DIR = REPO_ROOT / ".playwright-workday"
DISPATCHER_JOB_ID: str = ""

# Workday's most-stable selectors use data-automation-id. The IDs vary
# per instance but a few are consistent across the platform:
WORKDAY_SELECTORS = {
    "apply_button": '[data-automation-id*="applyButton"], button:has-text("Apply")',
    "apply_with_resume": 'button:has-text("Apply with Resume"), [data-automation-id*="resumeApply"]',
    "apply_manually": 'button:has-text("Apply Manually")',
    "account_signin": '[data-automation-id="signInButton"], a:has-text("Sign In")',
    "account_create": '[data-automation-id="createAccountLink"], a:has-text("Create Account")',
    "first_name": '[data-automation-id="legalNameSection_firstName"], input[name*="firstName"]',
    "last_name": '[data-automation-id="legalNameSection_lastName"], input[name*="lastName"]',
    "email": '[data-automation-id="email"], input[type="email"]',
    "phone": '[data-automation-id="phone-number"], input[type="tel"]',
    "country": '[data-automation-id="phone-device-type-country"]',
    "resume_upload": '[data-automation-id="file-upload-input-ref"], input[type="file"]',
    "next_button": '[data-automation-id="pageFooterNextButton"], [data-automation-id="bottom-navigation-next-button"], button:has-text("Next"), button:has-text("Continue")',
    "submit_button": '[data-automation-id="bottom-navigation-next-button"], button:has-text("Submit")',
    "review_button": 'button:has-text("Review")',
}

MAX_WIZARD_PAGES = 12  # safety stop — no Workday form is more than ~6 pages


def step(name: str) -> None:
    if DISPATCHER_JOB_ID:
        try:
            append_step(DISPATCHER_JOB_ID, name)
            return
        except Exception:
            pass
    print(f"  [step] {name}")


def detect_account_gate(page) -> bool:
    """Workday usually forces account creation. If we land on a sign-in /
    create-account page, bail — we don't create accounts automatically."""
    try:
        # Most Workday account pages have one or both of these.
        for sel in (
            WORKDAY_SELECTORS["account_signin"],
            WORKDAY_SELECTORS["account_create"],
        ):
            if page.locator(sel).first.is_visible(timeout=500):
                return True
        # Body-text fallback.
        body = (page.content() or "").lower()
        if "create account" in body and "password" in body and "verify password" in body:
            return True
    except Exception:
        pass
    return False


def detect_workday_already_applied(page) -> bool:
    """Workday-specific 'you've already applied' phrasings."""
    try:
        body = (page.content() or "").lower()
        for n in (
            "you have already applied",
            "application withdrawn",
            "you've already submitted",
            "view application status",
        ):
            if n in body:
                return True
    except Exception:
        pass
    return detect_already_applied(page)


def fill_workday_field(page, selector: str, value: str) -> bool:
    """Fill a single Workday input using a candidate selector list. Many
    Workday inputs are not simple <input> — they're combobox widgets that
    intercept .fill() and require human_type."""
    if not value:
        return False
    try:
        el = page.locator(selector).first
        if el.is_visible(timeout=1500):
            try:
                el.click()
                # Workday's inputs sometimes have prefilled placeholder values
                # we need to clear first.
                page.keyboard.press("Control+A")
                page.keyboard.press("Delete")
            except Exception:
                pass
            human_type(el, value)
            return True
    except Exception:
        pass
    return False


def walk_page_questions(page, answers_cache: dict) -> tuple[int, list[str]]:
    """Walk every visible labeled input on the current wizard page that
    isn't already handled by the basic fields. Apply EEO auto-decline,
    look up form-answers, leave required-unknown ones for the caller.

    Returns (filled_count, unknown_required_labels)."""
    filled = 0
    unknown: list[str] = []
    try:
        # Find every label-input pair visible on this page.
        labels = page.locator("label").all()
        for label_el in labels[:40]:  # cap to avoid scanning 200 fields
            try:
                if not label_el.is_visible(timeout=200):
                    continue
                label_text = (label_el.text_content() or "").strip()
                if not label_text or len(label_text) < 2:
                    continue

                # EEO short-circuit.
                if is_eeo_label(label_text):
                    if auto_decline_eeo(page, label_text):
                        filled += 1
                    continue

                # Already-handled basic fields — skip.
                lower = label_text.lower()
                if any(
                    k in lower
                    for k in [
                        "first name",
                        "last name",
                        "email",
                        "phone",
                        "country",
                        "resume",
                        "upload",
                    ]
                ):
                    continue

                # Look up the answer.
                key = normalize_question(label_text)
                answer = answers_cache.get(key)
                if not answer:
                    # Mark as unknown ONLY if we can't quickly tell whether
                    # the field is required. Workday uses an asterisk in
                    # labels for required fields.
                    if "*" in label_text or "(required)" in lower:
                        unknown.append(label_text)
                    continue

                # Try to fill via get_by_label.
                try:
                    inp = page.get_by_label(label_text, exact=False).first
                    if inp.is_visible(timeout=500):
                        human_type(inp, str(answer))
                        filled += 1
                except Exception:
                    pass
            except Exception:
                continue
    except Exception:
        pass
    return filled, unknown


def click_next(page) -> bool:
    """Advance the wizard. Returns True if a Next/Continue/Review button
    was clicked. False when we're stuck (or on Submit page)."""
    for sel in WORKDAY_SELECTORS["next_button"].split(", "):
        try:
            btn = page.locator(sel).first
            if btn.is_visible(timeout=500):
                human_click(page, btn)
                time.sleep(random.uniform(1.0, 2.0))
                try:
                    page.wait_for_load_state("networkidle", timeout=8_000)
                except PlaywrightTimeout:
                    pass
                return True
        except Exception:
            continue
    return False


def detect_submit_page(page) -> bool:
    """Are we on the final review/submit page?"""
    try:
        for sel in (
            WORKDAY_SELECTORS["submit_button"],
            WORKDAY_SELECTORS["review_button"],
        ):
            if page.locator(sel).first.is_visible(timeout=500):
                # Disambiguate review-page submit from just-another-next-button
                body = (page.content() or "").lower()
                if "review" in body or "submit application" in body:
                    return True
    except Exception:
        pass
    return False


def detect_confirmation(page) -> bool:
    if "thanks" in (page.url or "").lower() or "confirmation" in (page.url or "").lower():
        return True
    try:
        body = (page.content() or "").lower()
        for n in (
            "thanks for applying",
            "application submitted",
            "you have applied",
            "we've received your application",
            "successfully submitted",
        ):
            if n in body:
                return True
    except Exception:
        pass
    return False


def run(args) -> int:
    global DISPATCHER_JOB_ID
    DISPATCHER_JOB_ID = args.job_id or ""

    profile_id = resolve_profile_arg(args.profile)
    profile_yml = profile_path(profile_id, "profile-yml")
    if not profile_yml.exists():
        return emit_result("error", "profile-missing")
    with profile_yml.open() as f:
        profile = yaml.safe_load(f) or {}

    candidate = profile.get("candidate", {}) or {}
    auto = profile.get("automation", {}) or {}
    min_score = float(auto.get("min_score_to_apply", 4.0))
    autonomous = bool(auto.get("autonomous_apply", False))

    score = float(args.score) if args.score is not None else None
    if score is not None and autonomous and score < min_score:
        return emit_result("manual-apply-needed", f"score-gate:{score:.1f} below {min_score:.1f}")

    pdf_path = Path(args.pdf) if args.pdf else None
    if not pdf_path or not pdf_path.exists():
        out_dir = profile_path(profile_id, "output-dir")
        try:
            cands = sorted(
                [p for p in out_dir.glob("*.pdf") if "cv-general" not in p.name],
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            pdf_path = cands[0] if cands else None
        except Exception:
            pdf_path = None

    USER_DATA_DIR.mkdir(parents=True, exist_ok=True)
    headed = bool(args.headed)
    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(
            user_data_dir=str(USER_DATA_DIR),
            headless=not headed,
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
            ),
        )
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            step("navigating")
            page.goto(args.url, timeout=30_000, wait_until="domcontentloaded")
            try:
                page.wait_for_load_state("networkidle", timeout=12_000)
            except PlaywrightTimeout:
                pass
            step("page_loaded")

            if detect_captcha(page):
                screenshot_for_issue(page, DISPATCHER_JOB_ID)
                return emit_result("manual-apply-needed", "captcha")
            if detect_workday_already_applied(page):
                return emit_result("manual-apply-needed", "already-applied")

            # Click the initial "Apply" CTA if it exists (Workday description
            # pages need this before the form opens).
            try:
                apply_btn = page.locator(WORKDAY_SELECTORS["apply_button"]).first
                if apply_btn.is_visible(timeout=1500):
                    human_click(page, apply_btn)
                    time.sleep(random.uniform(1.2, 2.0))
            except Exception:
                pass

            # Prefer "Apply with Resume" over "Apply Manually" when both exist.
            try:
                resume_btn = page.locator(WORKDAY_SELECTORS["apply_with_resume"]).first
                if resume_btn.is_visible(timeout=1000):
                    human_click(page, resume_btn)
                    time.sleep(random.uniform(1.0, 1.5))
                    step("chose_apply_with_resume")
            except Exception:
                pass

            # Account gate — bail before doing anything else.
            if detect_account_gate(page):
                screenshot_for_issue(page, DISPATCHER_JOB_ID)
                return emit_result(
                    "manual-apply-needed",
                    "account-required:Workday requires account creation — sign in / create at the portal manually then re-queue",
                )

            step("clear_to_fill")

            # Basic identity.
            full_name = (candidate.get("full_name") or "").strip()
            parts = full_name.split()
            first = parts[0] if parts else ""
            last = parts[-1] if len(parts) > 1 else ""
            fill_workday_field(page, WORKDAY_SELECTORS["first_name"], first)
            fill_workday_field(page, WORKDAY_SELECTORS["last_name"], last)
            step("filled_name")

            fill_workday_field(page, WORKDAY_SELECTORS["email"], candidate.get("email", ""))
            step("filled_email")

            phone = candidate.get("phone", "")
            if phone:
                fill_workday_field(page, WORKDAY_SELECTORS["phone"], phone)
                step("filled_phone")

            # Resume upload (preferred path).
            if pdf_path and pdf_path.exists():
                try:
                    resume = page.locator(WORKDAY_SELECTORS["resume_upload"]).first
                    if resume.count() > 0 and upload_file(resume, str(pdf_path)):
                        step("uploaded_resume")
                        time.sleep(random.uniform(2.0, 4.0))
                except Exception:
                    pass

            # Walk the wizard pages. On each: scan for unknown labels,
            # auto-fill from cache, auto-decline EEO, then Next.
            answers_cache = load_form_answers(profile_id)
            for legacy_k, legacy_v in (profile.get("form_answers") or {}).items():
                if isinstance(legacy_k, str) and isinstance(legacy_v, str):
                    answers_cache.setdefault(normalize_question(legacy_k), legacy_v)

            unknown_required_all: list[str] = []
            for page_idx in range(MAX_WIZARD_PAGES):
                step(f"wizard_page_{page_idx + 1}")
                _filled, unknown = walk_page_questions(page, answers_cache)
                if unknown:
                    unknown_required_all.extend(unknown)

                # If we hit the final review/submit page, stop walking.
                if detect_submit_page(page):
                    step("on_review_page")
                    break

                # Otherwise advance.
                advanced = click_next(page)
                if not advanced:
                    step("wizard_no_next_button")
                    break

            if unknown_required_all:
                screenshot_for_issue(page, DISPATCHER_JOB_ID)
                return emit_result(
                    "manual-apply-needed",
                    "unknown-field:" + ",".join(unknown_required_all[:3]),
                )

            if args.dry_run:
                step("dry_run_skip_submit")
                return emit_result("manual-apply-needed", "dry-run")

            if not autonomous and not args.force_submit:
                return emit_result("manual-apply-needed", "review-required:autonomous_apply off")

            # Final captcha recheck.
            if detect_captcha(page):
                screenshot_for_issue(page, DISPATCHER_JOB_ID)
                return emit_result("manual-apply-needed", "captcha")

            try:
                submit = page.locator(WORKDAY_SELECTORS["submit_button"]).first
                step("clicking_submit")
                human_click(page, submit)
            except Exception as e:
                screenshot_for_issue(page, DISPATCHER_JOB_ID)
                return emit_result("manual-apply-needed", f"submit-not-found:{str(e)[:60]}")

            for _ in range(15):
                time.sleep(1.0)
                if detect_confirmation(page):
                    step("confirmed")
                    return emit_result("applied")
                try:
                    err = page.locator(".WACO, [data-error], [role=alert]").first
                    if err.is_visible(timeout=500):
                        text = (err.text_content() or "").strip()[:120]
                        screenshot_for_issue(page, DISPATCHER_JOB_ID)
                        return emit_result("manual-apply-needed", f"validation:{text}")
                except Exception:
                    pass

            screenshot_for_issue(page, DISPATCHER_JOB_ID)
            return emit_result("manual-apply-needed", "no-confirmation")

        finally:
            ctx.close()


def main() -> int:
    ap = argparse.ArgumentParser(description="Workday autonomous apply adapter (heuristic)")
    ap.add_argument("--url", required=True)
    ap.add_argument("--job-id", required=True, dest="job_id")
    ap.add_argument("--profile", default=None)
    ap.add_argument("--score", default=None, type=float)
    ap.add_argument("--pdf", default=None)
    ap.add_argument("--cover-letter", default=None, dest="cover_letter")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force-submit", action="store_true", dest="force_submit")
    args = ap.parse_args()

    try:
        write_apply_state(
            args.job_id,
            url=args.url,
            portal="workday",
            profileId=args.profile or "",
            startedAt=int(time.time() * 1000),
            lastStep="adapter_start",
            stepHistory=["queued", "dispatched", "adapter_start"],
        )
    except Exception:
        pass

    try:
        return run(args)
    except KeyboardInterrupt:
        return emit_result("error", "interrupted")
    except Exception as e:
        return emit_result("error", f"{type(e).__name__}:{str(e)[:120]}")


if __name__ == "__main__":
    sys.exit(main())
