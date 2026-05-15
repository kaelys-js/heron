#!/usr/bin/env python3
"""
apply-lever.py — Production Lever autonomous-apply adapter.

Lever's form is materially simpler than Greenhouse:
  - Single fields (no react-select for basic fields)
  - Phone is a plain <input type="tel"> (no intl-tel-input widget)
  - File upload is a single resume input
  - Custom questions are plain text/select inputs marked with name= attrs
  - URLs section asks for LinkedIn, GitHub, portfolio (optional)

Schema fetch via the public Lever postings API:
    GET https://api.lever.co/v0/postings/{company}/{jobId}?mode=json
The response includes `applicationQuestions` (an array of {required, text,
options}) which we use to plan the field walk.

Apply URL pattern:
    https://jobs.lever.co/{company}/{jobId}/apply  (the actual form)
    https://jobs.lever.co/{company}/{jobId}        (the description page)

The adapter accepts either — it auto-suffixes /apply when needed.

Reuses the same dispatcher protocol (APPLY_STEP, APPLY_RESULT) as the
Greenhouse + Ashby adapters.
"""

from __future__ import annotations
import argparse
import json
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional, Any

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
    detect_portal,
    load_form_answers,
    normalize_question,
    is_eeo_label,
    auto_decline_eeo,
)
from lib_profiles import resolve_profile_arg, resolve_user_arg, profile_path  # noqa: E402
from lib_playwright_auth import user_data_dir as _resolve_user_data_dir  # noqa: E402

# Per-user Playwright session dir — resolves per active CAREER_OPS_USER_ID.
USER_DATA_DIR = _resolve_user_data_dir("lever")
DISPATCHER_JOB_ID: str = ""


def step(name: str) -> None:
    if DISPATCHER_JOB_ID:
        try:
            append_step(DISPATCHER_JOB_ID, name)
            return
        except Exception:
            pass
    print(f"  [step] {name}")


# ── Schema fetch ───────────────────────────────────────────────────


def fetch_lever_schema(company: Optional[str], job_id: Optional[str]) -> Optional[dict]:
    """Hit the Lever postings API for this job. Returns the parsed JSON or None.

    The shape we care about (the rest is description / categorization):
        {
          "id": "uuid",
          "text": "Job title",
          "applicationQuestions": [
            {"required": true, "text": "Why us?", "options": null},
            {"required": false, "text": "Pronouns", "options": [...]}
          ]
        }
    """
    if not company or not job_id:
        return None
    url = f"https://api.lever.co/v0/postings/{company}/{job_id}?mode=json"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "career-ops-apply/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.HTTPError, urllib.error.URLError):
        return None
    except Exception:
        return None
    return None


def plan_from_schema(schema: Optional[dict]) -> dict[str, Any]:
    plan: dict[str, Any] = {
        "name": True,
        "email": True,
        "phone": True,
        "resume": True,
        "linkedin": False,
        "github": False,
        "portfolio": False,
        "custom": [],  # {label, required, options}
    }
    if not schema:
        return plan
    for q in schema.get("applicationQuestions") or []:
        label = (q.get("text") or "").strip()
        required = bool(q.get("required"))
        options = q.get("options") or []
        if not label:
            continue
        plan["custom"].append(
            {
                "label": label,
                "required": required,
                "options": options,
                "type": "select" if options else "text",
            }
        )
    return plan


# ── Form fills ─────────────────────────────────────────────────────


def fill_lever_basic(page, name: str, value: str) -> bool:
    """Fill a Lever input by name attribute or label."""
    if not value:
        return False
    selectors = [
        f'input[name="{name}"]',
        f'input[name="{name}[]"]',  # Lever uses array notation for URLs section
    ]
    for sel in selectors:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=1500):
                human_type(el, value)
                return True
        except Exception:
            continue
    try:
        el = page.get_by_label(re.compile(name, re.I)).first
        if el.is_visible(timeout=1500):
            human_type(el, value)
            return True
    except Exception:
        pass
    return False


def fill_lever_url(page, kind: str, value: str) -> bool:
    """Lever's URLs section uses name="urls[LinkedIn]" / "urls[GitHubURL]" /
    "urls[Other]". Try a few common variants."""
    if not value:
        return False
    candidates = [
        f'input[name="urls[{kind}]"]',
        f'input[name="urls[{kind}URL]"]',
        f'input[name*="{kind.lower()}"]',
    ]
    for sel in candidates:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=800):
                human_type(el, value)
                return True
        except Exception:
            continue
    return False


def fill_custom_question(page, question: dict, answers_cache: dict) -> str:
    label = question.get("label", "")
    required = bool(question.get("required"))
    if not label:
        return "skipped"
    # EEO short-circuit — Lever has fewer EEO fields than Greenhouse but
    # the same handling applies when present.
    if is_eeo_label(label):
        if auto_decline_eeo(page, label):
            return "filled"
        return "unknown" if required else "skipped"
    key = normalize_question(label)
    answer = answers_cache.get(key)
    if not answer:
        return "unknown" if required else "skipped"

    options = question.get("options") or []
    if options:
        # It's a select. Try clicking the matching option label.
        try:
            sel = page.get_by_label(label, exact=False).first
            if sel.is_visible(timeout=1000):
                try:
                    sel.select_option(label=str(answer))
                    return "filled"
                except Exception:
                    pass
        except Exception:
            pass
        # Fall through: maybe it's a radio group.
        try:
            radio = page.get_by_label(str(answer), exact=False).first
            if radio.is_visible(timeout=500):
                radio.click()
                return "filled"
        except Exception:
            pass
        return "unknown" if required else "skipped"

    # Plain text / textarea — type the answer.
    try:
        el = page.get_by_label(label, exact=False).first
        if el.is_visible(timeout=1500):
            human_type(el, str(answer))
            return "filled"
    except Exception:
        pass
    return "unknown" if required else "skipped"


def detect_confirmation(page) -> bool:
    if "thanks" in (page.url or "").lower() or "confirmation" in (page.url or "").lower():
        return True
    try:
        body = (page.content() or "").lower()
        for n in (
            "thanks for applying",
            "application submitted",
            "we'll be in touch",
            "we've received your application",
        ):
            if n in body:
                return True
    except Exception:
        pass
    return False


# ── Main flow ──────────────────────────────────────────────────────


def run(args) -> int:
    global DISPATCHER_JOB_ID
    DISPATCHER_JOB_ID = args.job_id or ""

    user_id = resolve_user_arg()
    profile_id = resolve_profile_arg(args.profile)
    profile_yml = profile_path(profile_id, "profile-yml", user_id=user_id)
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

    # Resume path.
    pdf_path = Path(args.pdf) if args.pdf else None
    if not pdf_path or not pdf_path.exists():
        out_dir = profile_path(profile_id, "output-dir", user_id=user_id)
        try:
            cands = sorted(
                [p for p in out_dir.glob("*.pdf") if "cv-general" not in p.name],
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            pdf_path = cands[0] if cands else None
        except Exception:
            pdf_path = None

    det = detect_portal(args.url)
    meta = det.get("meta") or {}
    company = meta.get("company")
    job_id = meta.get("jobId")

    step("schema_fetch_start")
    schema = fetch_lever_schema(company, job_id)
    step(f"schema_fetch_done:{'ok' if schema else 'no'}")
    plan = plan_from_schema(schema)

    # Ensure URL points at the /apply page, not the description page.
    apply_url = args.url
    if not apply_url.rstrip("/").endswith("/apply"):
        apply_url = apply_url.rstrip("/") + "/apply"

    USER_DATA_DIR.mkdir(parents=True, exist_ok=True)
    headed = bool(args.headed)
    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(
            user_data_dir=str(USER_DATA_DIR),
            headless=not headed,
            viewport={"width": 1280, "height": 900},
        )
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            step("navigating")
            page.goto(apply_url, timeout=30000, wait_until="domcontentloaded")
            try:
                page.wait_for_load_state("networkidle", timeout=10000)
            except PlaywrightTimeout:
                pass
            step("page_loaded")

            captcha = detect_captcha(page)
            if captcha:
                screenshot_for_issue(page, DISPATCHER_JOB_ID)
                return emit_result("manual-apply-needed", f"captcha:{captcha}")
            if detect_already_applied(page):
                return emit_result("manual-apply-needed", "already-applied")

            step("clear_to_fill")

            # Full name (Lever uses ONE name field).
            full_name = (candidate.get("full_name") or "").strip()
            if full_name:
                fill_lever_basic(page, "name", full_name)
                step("filled_name")

            fill_lever_basic(page, "email", candidate.get("email", ""))
            step("filled_email")

            phone = candidate.get("phone", "")
            if phone:
                fill_lever_basic(page, "phone", phone)
                step("filled_phone")

            # URLs section — LinkedIn / GitHub / Portfolio. Lever's
            # name attrs are inconsistent across instances; we try
            # common ones.
            if candidate.get("linkedin"):
                fill_lever_url(page, "LinkedIn", candidate["linkedin"])
            if candidate.get("github"):
                fill_lever_url(page, "GitHub", candidate["github"])
            if candidate.get("portfolio_url"):
                fill_lever_url(page, "Portfolio", candidate["portfolio_url"])
            step("filled_urls")

            # Resume upload.
            if pdf_path and pdf_path.exists():
                try:
                    resume = page.locator(
                        'input[type="file"][name*="resume"], input[type="file"]'
                    ).first
                    if resume.count() > 0 and upload_file(resume, str(pdf_path)):
                        step("uploaded_resume")
                    elif resume.count() > 0:
                        screenshot_for_issue(page, DISPATCHER_JOB_ID)
                        return emit_result("manual-apply-needed", "upload-failed:resume")
                except Exception:
                    pass

            # Custom Q&A — pulled from persistent cache.
            answers_cache = load_form_answers(profile_id)
            for legacy_k, legacy_v in (profile.get("form_answers") or {}).items():
                if isinstance(legacy_k, str) and isinstance(legacy_v, str):
                    answers_cache.setdefault(normalize_question(legacy_k), legacy_v)
            unknown_required: list[str] = []
            for q in plan["custom"]:
                outcome = fill_custom_question(page, q, answers_cache)
                if outcome == "unknown":
                    unknown_required.append(q["label"])
            step(
                f"custom_questions_done:{len(plan['custom']) - len(unknown_required)}/{len(plan['custom'])}"
            )

            if unknown_required:
                screenshot_for_issue(page, DISPATCHER_JOB_ID)
                return emit_result(
                    "manual-apply-needed",
                    "unknown-field:" + ",".join(unknown_required[:3]),
                )

            if args.dry_run:
                step("dry_run_skip_submit")
                return emit_result("manual-apply-needed", "dry-run")

            if not autonomous and not args.force_submit:
                return emit_result("manual-apply-needed", "review-required:autonomous_apply off")

            captcha = detect_captcha(page)
            if captcha:
                screenshot_for_issue(page, DISPATCHER_JOB_ID)
                return emit_result("manual-apply-needed", f"captcha:{captcha}")

            try:
                submit = page.get_by_role("button", name=re.compile(r"submit|apply", re.I)).last
                step("clicking_submit")
                human_click(page, submit)
            except Exception as e:
                screenshot_for_issue(page, DISPATCHER_JOB_ID)
                return emit_result("manual-apply-needed", f"submit-not-found:{str(e)[:60]}")

            for _ in range(12):
                time.sleep(1.0)
                if detect_confirmation(page):
                    step("confirmed")
                    return emit_result("applied")
                try:
                    err = page.locator(".error, [role=alert]").first
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
    ap = argparse.ArgumentParser(description="Lever autonomous apply adapter")
    ap.add_argument("--url", required=True)
    ap.add_argument("--job-id", required=True, dest="job_id")
    ap.add_argument("--profile", default=None)
    ap.add_argument("--score", default=None, type=float)
    ap.add_argument("--pdf", default=None)
    ap.add_argument(
        "--cover-letter", default=None, dest="cover_letter"
    )  # Lever doesn't really use these
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force-submit", action="store_true", dest="force_submit")
    args = ap.parse_args()

    try:
        write_apply_state(
            args.job_id,
            url=args.url,
            portal="lever",
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
