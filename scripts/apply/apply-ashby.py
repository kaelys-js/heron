#!/usr/bin/env python3
"""
apply-ashby.py — Production Ashby autonomous-apply adapter.

Why Playwright (and not the posting-api submit endpoint): Ashby has a
public submit endpoint but it requires the company's secret API key.
Third-party candidates can only submit via the rendered form.

What's different from Greenhouse:

  1. Cloudflare edge filter — Ashby fronts every form with Cloudflare's
     bot management. Default headless Chromium gets a 403 on the first
     POST. We use launch_persistent_context() with a dedicated user-data
     dir so the cookies / TLS fingerprint warm up across runs.
  2. Single `name` field — unlike Greenhouse (first_name + last_name),
     Ashby has one full-name input.
  3. Cascading structured location — country → region → city as
     dependent react-selects, NOT a Google Places autocomplete.
  4. RichText vs file-upload cover letter — Ashby supports both; the
     posting-api schema says which mode is active for this job. Plain
     markdown gets pasted into the RichText editor as-is.
  5. Posting-api endpoint — https://api.ashbyhq.com/posting-api/job-board/{tenant}
     for the org's job list; /{tenant}/{jobId} for one job's schema.

Dispatcher protocol mirrors apply-greenhouse.py: APPLY_STEP per phase,
APPLY_RESULT on exit. Exit codes 0/1/2 per lib_apply.emit_result.
"""

from __future__ import annotations
import argparse
import json
import random
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
    fill_react_select,
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
USER_DATA_DIR = _resolve_user_data_dir("ashby")
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


def fetch_ashby_schema(company: Optional[str], job_id: Optional[str]) -> Optional[dict]:
    """Hit the Ashby posting-api for this job's question schema.

    Endpoint shape:
        GET https://api.ashbyhq.com/posting-api/job-board/{tenant}/{jobId}
    Returns the job description + structured application form definition.
    Fields include: applicationFormFieldsConfig with paths like
    'name', 'email', 'location.country', etc.
    """
    if not company or not job_id:
        return None
    url = f"https://api.ashbyhq.com/posting-api/job-board/{company}/{job_id}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "heron-apply/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 403:
            # Cloudflare blocked our API call too. The form will likely
            # block as well — but persistent context warms over time.
            print("  [ashby-api] Cloudflare 403 on schema fetch", file=sys.stderr)
        return None
    except Exception:
        return None
    return None


def plan_from_schema(schema: Optional[dict]) -> dict[str, Any]:
    """Build a fill plan from the Ashby form schema. Falls back to a
    permissive plan when schema fetch failed (Cloudflare or missing).

    Ashby form-field paths to watch:
        name, email, resume, coverLetter
        location.country, location.region, location.city
        educationHistory[].school / degree / yearAwarded (skipped — too varied)
        Plus any "applicationFormQuestions" the company configured.
    """
    plan: dict[str, Any] = {
        "name": True,
        "email": True,
        "phone": False,
        "resume": True,
        "cover_letter": {
            "mode": "auto",
            "present": False,
        },  # 'auto' | 'rich-text' | 'file'
        "location": False,
        "custom": [],
        "required_unknown": [],
    }
    if not schema:
        return plan
    form = schema.get("applicationFormFieldsConfig") or schema.get("applicationForm") or {}
    fields = form.get("fields") or schema.get("applicationFormQuestions") or []
    for f in fields:
        path = (f.get("path") or f.get("name") or "").lower()
        ftype = (f.get("type") or f.get("fieldType") or "").lower()
        required = bool(f.get("isRequired") or f.get("required"))
        if "phone" in path:
            plan["phone"] = True
        if "location" in path:
            plan["location"] = True
        if "coverletter" in path or "cover_letter" in path:
            plan["cover_letter"] = {
                "mode": "rich-text"
                if "richtext" in ftype
                else ("file" if "file" in ftype else "auto"),
                "present": True,
                "required": required,
            }
        if path not in (
            "name",
            "email",
            "phone",
            "resume",
            "coverletter",
            "cover_letter",
        ) and not path.startswith("location"):
            label = f.get("title") or f.get("label") or path
            plan["custom"].append(
                {"label": label, "required": required, "type": ftype, "path": path}
            )
    return plan


# ── Field fills ────────────────────────────────────────────────────


def fill_ashby_text(page, path: str, value: str) -> bool:
    """Ashby inputs use data-path or aria-label. Try the most-specific
    selector first, fall back to label-based."""
    if not value:
        return False
    selectors = [
        f'input[name="{path}"]',
        f'input[data-path="{path}"]',
        f'input[id="{path}"]',
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
        el = page.get_by_label(re.compile(path, re.I)).first
        if el.is_visible(timeout=1500):
            human_type(el, value)
            return True
    except Exception:
        pass
    return False


def fill_ashby_location(page, country: str, region: str, city: str) -> bool:
    """Ashby uses three cascading react-selects for location. Each
    selection enables the next dropdown. We use fill_react_select for
    each level — Ashby's combobox follows the standard react-select pattern."""
    ok_country = fill_react_select(page, "Country", country) if country else True
    if ok_country:
        time.sleep(random.uniform(0.4, 0.7))
    ok_region = fill_react_select(page, "Region", region) if region else True
    if ok_region:
        time.sleep(random.uniform(0.4, 0.7))
    ok_city = fill_react_select(page, "City", city) if city else True
    return ok_country and ok_region and ok_city


def fill_richtext_cover_letter(page, markdown_text: str) -> bool:
    """Ashby's cover-letter RichText editor is a contenteditable div.
    We type plain markdown — the editor renders it as plain text, which
    is generally what recruiters want anyway."""
    try:
        editor = page.locator('[contenteditable="true"], div[role="textbox"]').last
        if editor.is_visible(timeout=2000):
            editor.click()
            time.sleep(random.uniform(0.2, 0.4))
            # Type in chunks so the editor's internal state debounces correctly.
            chunk_size = 200
            for i in range(0, len(markdown_text), chunk_size):
                chunk = markdown_text[i : i + chunk_size]
                page.keyboard.type(chunk, delay=random.randint(5, 20))
            return True
    except Exception:
        pass
    return False


def detect_cloudflare_block(page) -> bool:
    """Cloudflare's edge filter returns a challenge page with distinctive
    text and a #cf-challenge-running iframe. detect_captcha covers part
    of this but not the bare "Just a moment..." holding page."""
    try:
        title = (page.title() or "").lower()
        if "just a moment" in title or "checking your browser" in title:
            return True
        body = (page.content() or "").lower()
        if "cloudflare" in body and ("checking" in body or "challenge" in body):
            return True
    except Exception:
        pass
    return False


def detect_confirmation(page) -> bool:
    if (
        "/confirmation" in (page.url or "")
        or "/submitted" in (page.url or "")
        or "/thanks" in (page.url or "")
    ):
        return True
    try:
        body = (page.content() or "").lower()
        for n in (
            "thanks for applying",
            "application submitted",
            "we've received your application",
            "you've successfully applied",
            "you have successfully applied",
        ):
            if n in body:
                return True
    except Exception:
        pass
    return False


def fill_custom(page, question: dict, answers_cache: dict) -> str:
    label = question.get("label", "")
    required = bool(question.get("required"))
    qtype = (question.get("type") or "input_text").lower()
    # EEO short-circuit — Ashby's voluntary self-ID step uses the same
    # decline-to-answer escape hatch as Greenhouse. Default: decline.
    if is_eeo_label(label):
        if auto_decline_eeo(page, label):
            return "filled"
        return "unknown" if required else "skipped"
    # Use the shared normalize_question() so the lookup key matches what
    # form-answers-cache.ts writes.
    key = normalize_question(label)
    answer = answers_cache.get(key)
    if not answer:
        return "unknown" if required else "skipped"
    if "select" in qtype or "dropdown" in qtype or "multiselect" in qtype:
        if fill_react_select(page, label, str(answer)):
            return "filled"
        return "unknown" if required else "skipped"
    try:
        el = page.get_by_label(label, exact=False).first
        human_type(el, str(answer))
        return "filled"
    except Exception:
        return "unknown" if required else "skipped"


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
    loc_block = profile.get("location", {}) or {}
    auto = profile.get("automation", {}) or {}
    min_score = float(auto.get("min_score_to_apply", 4.0))
    autonomous = bool(auto.get("autonomous_apply", False))

    score = float(args.score) if args.score is not None else None
    if score is not None and autonomous and score < min_score:
        return emit_result("manual-apply-needed", f"score-gate:{score:.1f} below {min_score:.1f}")

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
    cover_path = Path(args.cover_letter) if args.cover_letter else None
    cover_md = ""
    if args.cover_letter_md and Path(args.cover_letter_md).exists():
        try:
            cover_md = Path(args.cover_letter_md).read_text()
        except Exception:
            cover_md = ""

    det = detect_portal(args.url)
    meta = det.get("meta") or {}
    company = meta.get("company")
    job_id = meta.get("jobId")

    step("schema_fetch_start")
    schema = fetch_ashby_schema(company, job_id)
    step(f"schema_fetch_done:{'ok' if schema else 'no'}")
    plan = plan_from_schema(schema)

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
            page.goto(args.url, timeout=30000, wait_until="domcontentloaded")
            try:
                page.wait_for_load_state("networkidle", timeout=15000)
            except PlaywrightTimeout:
                pass
            step("page_loaded")

            if detect_cloudflare_block(page):
                screenshot_for_issue(page, DISPATCHER_JOB_ID)
                return emit_result("manual-apply-needed", "anti-bot:cloudflare")
            captcha = detect_captcha(page)
            if captcha:
                screenshot_for_issue(page, DISPATCHER_JOB_ID)
                return emit_result("manual-apply-needed", f"captcha:{captcha}")
            if detect_already_applied(page):
                return emit_result("manual-apply-needed", "already-applied")

            step("clear_to_fill")

            # Click into the "Apply" CTA if there is one (some Ashby pages
            # show a description page first).
            try:
                apply_btn = page.get_by_role("button", name=re.compile(r"apply", re.I)).first
                if apply_btn.is_visible(timeout=1500):
                    human_click(page, apply_btn)
                    time.sleep(random.uniform(0.8, 1.4))
                    step("entered_application_form")
            except Exception:
                pass

            # Name (single field on Ashby).
            full_name = (candidate.get("full_name") or "").strip()
            if full_name:
                fill_ashby_text(page, "name", full_name)
                step("filled_name")

            fill_ashby_text(page, "email", candidate.get("email", ""))
            step("filled_email")

            if plan["phone"] and candidate.get("phone"):
                # Ashby's phone is plain text on most forms (no intl-tel-input).
                fill_ashby_text(page, "phone", candidate["phone"])
                step("filled_phone")

            # Cascading structured location.
            if plan["location"]:
                country = loc_block.get("country", "")
                region = (
                    loc_block.get("province")
                    or loc_block.get("region")
                    or loc_block.get("state")
                    or ""
                )
                city = loc_block.get("city", "")
                if any([country, region, city]):
                    fill_ashby_location(page, country, region, city)
                    step("filled_location")

            # Resume upload.
            if pdf_path and pdf_path.exists():
                try:
                    resume = page.locator('input[type="file"]').first
                    if resume.count() > 0:
                        if upload_file(resume, str(pdf_path)):
                            step("uploaded_resume")
                        else:
                            return emit_result("manual-apply-needed", "upload-failed:resume")
                except Exception:
                    pass

            # Cover letter — RichText OR file upload depending on schema.
            cl_plan = plan["cover_letter"]
            if isinstance(cl_plan, dict) and cl_plan.get("present"):
                mode = cl_plan.get("mode", "auto")
                if mode in ("rich-text", "auto") and cover_md:
                    if fill_richtext_cover_letter(page, cover_md):
                        step("filled_cover_letter_rich_text")
                elif mode in ("file", "auto") and cover_path and cover_path.exists():
                    try:
                        cl_input = page.locator('input[type="file"]').nth(1)
                        if cl_input.count() > 0 and upload_file(cl_input, str(cover_path)):
                            step("uploaded_cover_letter")
                    except Exception:
                        pass

            # Custom Q&A — pull from the persistent JSONL cache (the TS-side
            # UI writes here when the user confirms an answer). Legacy
            # profile.yml.form_answers entries are merged in for back-compat.
            answers_cache = load_form_answers(profile_id)
            for legacy_k, legacy_v in (profile.get("form_answers") or {}).items():
                if isinstance(legacy_k, str) and isinstance(legacy_v, str):
                    answers_cache.setdefault(normalize_question(legacy_k), legacy_v)
            unknown_required: list[str] = []
            for q in plan["custom"]:
                result = fill_custom(page, q, answers_cache)
                if result == "unknown":
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

            # Final captcha recheck before submit (Cloudflare can re-inject).
            if detect_cloudflare_block(page):
                screenshot_for_issue(page, DISPATCHER_JOB_ID)
                return emit_result("manual-apply-needed", "anti-bot:cloudflare")
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
                    err = page.locator(".error, [role=alert], [data-error]").first
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
    ap = argparse.ArgumentParser(description="Ashby autonomous apply adapter")
    ap.add_argument("--url", required=True)
    ap.add_argument("--job-id", required=True, dest="job_id")
    ap.add_argument("--profile", default=None)
    ap.add_argument("--score", default=None, type=float)
    ap.add_argument("--pdf", default=None)
    ap.add_argument("--cover-letter", default=None, dest="cover_letter")
    ap.add_argument(
        "--cover-letter-md",
        default=None,
        dest="cover_letter_md",
        help="Markdown source for RichText cover-letter mode.",
    )
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force-submit", action="store_true", dest="force_submit")
    args = ap.parse_args()

    try:
        write_apply_state(
            args.job_id,
            url=args.url,
            portal="ashby",
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
