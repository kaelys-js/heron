#!/usr/bin/env python3
"""
apply-greenhouse.py — Production Greenhouse Easy-Apply automation.

Why Playwright (and not the boards-api submit endpoint): Greenhouse has a
public POST /applications endpoint, but it requires the company's secret
key. Third-party candidates (us) can only submit via the rendered form.

What this script handles:

  1. Domain migration: boards.greenhouse.io (legacy, deprecated Apr 2025)
     + job-boards.greenhouse.io (current) + job-boards.eu.greenhouse.io
     (EU shard). The dispatcher's detectPortal flags either form as
     'greenhouse'; we determine which API host to fetch the schema from.
  2. Schema-driven field discovery — fetches the question list from the
     boards API so we know which fields to fill BEFORE inspecting the DOM.
     Schema labels are the truth for "is this field required".
  3. Intl-tel-input phone widget — Greenhouse wraps phone in a Twilio-style
     country-selector. Plain .fill() drops the country code; we click the
     flag → search country → Enter → THEN type the number.
  4. react-select dropdowns — every Greenhouse dropdown is react-select.
     Playwright's selectOption() does NOT work; we click → type → Enter.
  5. Google Places location — the location field shows suggestion popups
     and only "commits" the lat/lng/country hidden inputs when you pick a
     suggestion. We type → wait for popup → ArrowDown → Enter.
  6. CAPTCHA + email-code fallback — Greenhouse's anti-bot pipe is
     invisible reCAPTCHA Enterprise that escalates to a 6-digit emailed
     code. We detect both states and fail soft (Issue + screenshot).
  7. Resume + cover-letter file upload — paths come from --pdf / --cover-letter
     args. For Greenhouse, the tailored per-job CV is correct (the recruiter
     sees just the form, not your profile side-by-side as on LinkedIn).
  8. Submit + confirmation. We look for /confirmation URL change OR for
     text "Application submitted" / "Thank you" / "Thanks for applying".

Dispatcher protocol (matches lib_apply.emit_result):
    APPLY_STEP: <step>           — one per major phase
    APPLY_RESULT: <status>[:<detail>]
                                 — applied | manual-apply-needed:<mode> | error:<detail>

Exit codes:
    0 — applied
    1 — manual-apply-needed
    2 — error
"""
from __future__ import annotations
import argparse
import json
import os
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
    print("ERROR: playwright not installed. Run:\n  .venv/bin/pip install playwright && .venv/bin/python -m playwright install chromium",
          file=sys.stderr)
    sys.exit(2)

try:
    import yaml
except ImportError:
    print("ERROR: pyyaml not installed.", file=sys.stderr)
    sys.exit(2)

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

from lib_apply import (  # noqa: E402
    human_type, human_click, detect_captcha, detect_already_applied,
    upload_file, fill_react_select, append_step, emit_result,
    screenshot_for_issue, write_apply_state, detect_portal,
)
from lib_profiles import resolve_profile_arg, profile_path  # noqa: E402

USER_DATA_DIR = ROOT / ".playwright-greenhouse"
DISPATCHER_JOB_ID: str = ""


# ── Logging shim ───────────────────────────────────────────────────

def step(name: str) -> None:
    """Emit APPLY_STEP through lib_apply.append_step so the state file
    + activity feed both see it. Falls back to plain print if the state
    file wasn't seeded (standalone debug runs)."""
    if DISPATCHER_JOB_ID:
        try:
            append_step(DISPATCHER_JOB_ID, name)
            return
        except Exception:
            pass
    print(f"  [step] {name}")


# ── Schema fetch ───────────────────────────────────────────────────

def schema_api_hosts(url: str) -> list[str]:
    """Return the list of API base URLs to try, ordered by likelihood.
    The form may live on either the legacy or new domain — fetch from
    the API host that matches."""
    if "job-boards.eu.greenhouse.io" in url:
        return ["https://job-boards-api.eu.greenhouse.io/v1/boards"]
    if "job-boards.greenhouse.io" in url:
        return ["https://job-boards-api.greenhouse.io/v1/boards"]
    if "boards.greenhouse.io" in url:
        return ["https://boards-api.greenhouse.io/v1/boards"]
    # Embedded iframe on careers.{company}.com — try both, prefer new.
    return [
        "https://job-boards-api.greenhouse.io/v1/boards",
        "https://boards-api.greenhouse.io/v1/boards",
    ]


def fetch_form_schema(url: str, company: Optional[str], job_id: Optional[str]) -> Optional[dict]:
    """Hit the boards-api endpoint that lists this job's questions.
    Returns the parsed JSON or None if every attempt fails. Schema fields:
        { "id": int, "title": str, "questions": [
            { "label": str, "required": bool, "fields": [
                { "name": str, "type": "input_text"|"input_file"|"multi_value_single_select"|... }
            ] }, ...
        ] }
    """
    if not company or not job_id:
        return None
    for base in schema_api_hosts(url):
        api_url = f"{base}/{company}/jobs/{job_id}?questions=true"
        try:
            req = urllib.request.Request(api_url, headers={"User-Agent": "career-ops-apply/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status == 200:
                    return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (404, 403):
                continue
        except Exception:
            continue
    return None


# ── Field plan from schema ─────────────────────────────────────────

def plan_from_schema(schema: Optional[dict]) -> dict[str, Any]:
    """Build a structured plan from the schema so we know exactly which
    fields exist + which are required. Falls back to a permissive plan
    (try everything) when schema fetch failed."""
    plan = {
        "first_name": True, "last_name": True, "email": True, "phone": True,
        "resume": True, "cover_letter": False,
        "location": False, "custom": [],  # list of (label, required, type)
        "required_unknown": [],  # required fields we don't know how to fill
    }
    if not schema:
        return plan
    questions = schema.get("questions") or []
    handled_names = set()
    for q in questions:
        label = q.get("label", "").strip()
        required = bool(q.get("required"))
        fields = q.get("fields") or []
        for f in fields:
            name = (f.get("name") or "").lower()
            ftype = (f.get("type") or "").lower()
            handled_names.add(name)
            if name in plan and isinstance(plan[name], bool):
                plan[name] = True
            if "location" in name or "location" in label.lower():
                plan["location"] = True
        # If none of this question's fields matched a known slot, it's custom.
        if not any(((f.get("name") or "").lower() in plan) for f in fields):
            ftype = (fields[0].get("type") if fields else "input_text") or "input_text"
            plan["custom"].append({"label": label, "required": required, "type": ftype})
    return plan


# ── Phone widget (intl-tel-input) ──────────────────────────────────

def fill_intl_phone(page, country: str, phone: str) -> bool:
    """Greenhouse phone uses intl-tel-input. The plain <input> only stores
    the local digits — we must:
      1. Click the country-flag chooser to open the dropdown
      2. Type the country name (or code) to filter
      3. Press Enter to pick the top match
      4. Then type the phone number into the actual <input>

    Falls back to plain fill() if any step fails — the recruiter will see
    a missing country code, but the form still goes through."""
    try:
        # Open the country chooser. Greenhouse uses .iti__flag-container
        # or a button with role=combobox near the phone input.
        flag = page.locator(".iti__flag-container, .iti__selected-flag").first
        if flag.is_visible(timeout=2000):
            human_click(page, flag)
            time.sleep(random.uniform(0.3, 0.6))
            search = page.locator(".iti__country-list-search input, .iti__search-input").first
            if search.is_visible(timeout=1500):
                human_type(search, country)
            else:
                # No search input — country list auto-filters via keyboard.
                page.keyboard.type(country, delay=random.randint(40, 100))
            time.sleep(random.uniform(0.2, 0.4))
            page.keyboard.press("Enter")
            time.sleep(random.uniform(0.2, 0.4))
    except Exception:
        pass

    # Now the actual phone input. Match by type=tel OR name=phone.
    try:
        phone_input = page.locator('input[type="tel"], input[name="phone"]').first
        if phone_input.is_visible(timeout=2000):
            # Strip the country code if we set the flag — intl-tel-input
            # adds it automatically. Heuristic: drop a leading "+NN-" prefix.
            local = re.sub(r"^\+\d{1,3}[-\s]?", "", phone or "")
            human_type(phone_input, local or phone)
            return True
    except Exception:
        pass
    return False


# ── Google Places location ─────────────────────────────────────────

def fill_google_places(page, location_text: str) -> bool:
    """The location field on Greenhouse uses Google Places autocomplete.
    Plain fill() leaves the hidden lat/lng/country inputs blank, which
    makes the submission fail validation. The required ritual:
      1. Type the location text into the visible input
      2. Wait for the suggestion popup to appear
      3. ArrowDown to select the first suggestion
      4. Enter to commit (this triggers the JS that sets hidden inputs)
    """
    try:
        loc = page.locator('input[name="job_application[location]"], input[id*="location"]').first
        if not loc.is_visible(timeout=2000):
            return False
        loc.click()
        human_type(loc, location_text)
        # Wait for suggestion dropdown — Google's .pac-container appears as a body-level div.
        time.sleep(random.uniform(0.8, 1.4))
        page.keyboard.press("ArrowDown")
        time.sleep(random.uniform(0.2, 0.4))
        page.keyboard.press("Enter")
        time.sleep(random.uniform(0.4, 0.7))
        return True
    except Exception:
        return False


# ── Basic field fills via name= selector ───────────────────────────

def fill_basic_text(page, name: str, value: str) -> bool:
    """Find an input by name= or by following-label-text and fill it
    with human cadence. Returns True on success."""
    if not value:
        return False
    try:
        el = page.locator(f'input[name="{name}"], input[id="{name}"]').first
        if el.is_visible(timeout=1500):
            human_type(el, value)
            return True
    except Exception:
        pass
    # Fallback: label-based lookup (case-insensitive).
    try:
        el = page.get_by_label(re.compile(name.replace("_", " "), re.I)).first
        if el.is_visible(timeout=1500):
            human_type(el, value)
            return True
    except Exception:
        pass
    return False


# ── Custom Q&A walking ─────────────────────────────────────────────

def fill_custom_question(page, question: dict, answers_cache: dict) -> str:
    """Fill one custom question. Returns:
        'filled'           — answered from cache or schema default
        'skipped-empty'    — optional + no answer, left blank
        'unknown'          — required + no answer source
    """
    label = question.get("label", "")
    required = bool(question.get("required"))
    qtype = (question.get("type") or "input_text").lower()
    if not label:
        return "skipped-empty"

    # Look up the answer. Cache key is the lowercased label trimmed of punctuation.
    key = re.sub(r"[^a-z0-9 ]", "", label.lower()).strip()
    answer = answers_cache.get(key)

    if not answer:
        return "unknown" if required else "skipped-empty"

    # Type-based dispatch.
    if "select" in qtype or "dropdown" in qtype:
        if fill_react_select(page, label, str(answer)):
            return "filled"
        return "unknown" if required else "skipped-empty"
    elif "checkbox" in qtype:
        try:
            cb = page.get_by_label(label, exact=False).first
            if str(answer).lower() in ("yes", "true", "1"):
                cb.check()
            return "filled"
        except Exception:
            return "unknown" if required else "skipped-empty"
    elif "textarea" in qtype or "long" in qtype:
        try:
            ta = page.get_by_label(label, exact=False).first
            human_type(ta, str(answer))
            return "filled"
        except Exception:
            return "unknown" if required else "skipped-empty"
    else:
        try:
            inp = page.get_by_label(label, exact=False).first
            human_type(inp, str(answer))
            return "filled"
        except Exception:
            return "unknown" if required else "skipped-empty"


# ── Confirmation detection ─────────────────────────────────────────

def detect_confirmation(page) -> bool:
    """Check for the usual confirmation signals after Submit clicks.
    Returns True when we're confident the application went through."""
    # URL signal — Greenhouse redirects to /jobs/{id}/confirmation
    if "/confirmation" in (page.url or ""):
        return True
    try:
        body = (page.content() or "").lower()
        for needle in (
            "application submitted",
            "thanks for applying",
            "thank you for applying",
            "we've received your application",
            "we have received your application",
        ):
            if needle in body:
                return True
    except Exception:
        pass
    return False


# ── Main flow ──────────────────────────────────────────────────────

def run(args) -> int:
    global DISPATCHER_JOB_ID
    DISPATCHER_JOB_ID = args.job_id or ""

    profile_id = resolve_profile_arg(args.profile)
    profile_yml = profile_path(profile_id, "profile-yml")
    if not profile_yml.exists():
        print(f"ERROR: profile.yml missing at {profile_yml}", file=sys.stderr)
        return emit_result("error", "profile-missing")
    with profile_yml.open() as f:
        profile = yaml.safe_load(f) or {}

    candidate = profile.get("candidate", {}) or {}
    auto = profile.get("automation", {}) or {}
    min_score = float(auto.get("min_score_to_apply", 4.0))
    autonomous = bool(auto.get("autonomous_apply", False))

    # Score gate (defensive — apply-queue.job.ts preflight already checked).
    score = float(args.score) if args.score is not None else None
    if score is not None and autonomous and score < min_score:
        return emit_result("manual-apply-needed", f"score-gate:{score:.1f} below {min_score:.1f}")

    # Resume / cover letter paths.
    pdf_path = Path(args.pdf) if args.pdf else None
    if not pdf_path or not pdf_path.exists():
        # Fall back to most-recent per-job PDF in profile's output dir.
        out_dir = profile_path(profile_id, "output-dir")
        try:
            cands = sorted([p for p in out_dir.glob("*.pdf") if "cv-general" not in p.name],
                           key=lambda p: p.stat().st_mtime, reverse=True)
            pdf_path = cands[0] if cands else None
        except Exception:
            pdf_path = None
    cover_path = Path(args.cover_letter) if args.cover_letter else None
    if cover_path and not cover_path.exists():
        cover_path = None

    # Portal meta from URL — we need company + jobId for the schema fetch.
    det = detect_portal(args.url)
    meta = det.get("meta") or {}
    company = meta.get("company")
    job_id = meta.get("jobId")

    step("schema_fetch_start")
    schema = fetch_form_schema(args.url, company, job_id)
    step(f"schema_fetch_done:{'ok' if schema else 'no'}")
    plan = plan_from_schema(schema)

    # Persistent context — Greenhouse Cloudflare watches header fingerprints.
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
            page.wait_for_load_state("networkidle", timeout=15000)
            step("page_loaded")

            # Anti-bot / blocked checks.
            captcha = detect_captcha(page)
            if captcha:
                screenshot_for_issue(page, DISPATCHER_JOB_ID)
                return emit_result("manual-apply-needed", f"captcha:{captcha}")

            if detect_already_applied(page):
                step("already_applied_detected")
                return emit_result("manual-apply-needed", "already-applied")

            step("clear_to_fill")

            # ── Basic identity fields ──
            full_name = (candidate.get("full_name") or "").strip()
            parts = full_name.split()
            first = parts[0] if parts else ""
            last = parts[-1] if len(parts) > 1 else ""
            fill_basic_text(page, "first_name", first)
            fill_basic_text(page, "last_name", last)
            step("filled_name")

            fill_basic_text(page, "email", candidate.get("email", ""))
            step("filled_email")

            # Phone (intl-tel-input).
            phone = candidate.get("phone", "")
            country = (profile.get("location") or {}).get("country") or "Canada"
            if phone:
                fill_intl_phone(page, country, phone)
                step("filled_phone")

            # Location (Google Places).
            if plan["location"]:
                loc_text = candidate.get("location") or f"{(profile.get('location') or {}).get('city', '')}, {country}"
                if loc_text.strip(", "):
                    fill_google_places(page, loc_text)
                    step("filled_location")

            # Resume upload.
            if pdf_path and pdf_path.exists():
                try:
                    resume_input = page.locator(
                        'input[name="job_application[resume]"], input[type="file"]'
                    ).first
                    if resume_input.count() > 0:
                        if upload_file(resume_input, str(pdf_path)):
                            step("uploaded_resume")
                        else:
                            screenshot_for_issue(page, DISPATCHER_JOB_ID)
                            return emit_result("manual-apply-needed", "upload-failed:resume")
                except Exception:
                    pass

            # Cover letter upload (optional).
            if cover_path and cover_path.exists():
                try:
                    # The cover letter file input is usually the second
                    # input[type=file] — but try the named selector first.
                    cl_input = page.locator('input[name="job_application[cover_letter]"]').first
                    if cl_input.count() == 0:
                        cl_input = page.locator('input[type="file"]').nth(1)
                    if cl_input.count() > 0:
                        if upload_file(cl_input, str(cover_path)):
                            step("uploaded_cover_letter")
                except Exception:
                    pass

            # ── Custom Q&A ──
            answers_cache = (profile.get("form_answers") or {})
            unknown_required: list[str] = []
            for q in plan["custom"]:
                outcome = fill_custom_question(page, q, answers_cache)
                if outcome == "unknown":
                    unknown_required.append(q["label"])
            step(f"custom_questions_done:{len(plan['custom']) - len(unknown_required)}/{len(plan['custom'])}")

            if unknown_required:
                screenshot_for_issue(page, DISPATCHER_JOB_ID)
                return emit_result(
                    "manual-apply-needed",
                    "unknown-field:" + ",".join(unknown_required[:3]),
                )

            # ── Submit ──
            if args.dry_run:
                step("dry_run_skip_submit")
                return emit_result("manual-apply-needed", "dry-run")

            if not autonomous and not args.force_submit:
                step("autonomous_off_review_only")
                return emit_result("manual-apply-needed", "review-required:autonomous_apply off")

            # Captcha recheck just before submit — Greenhouse sometimes
            # lazy-injects reCAPTCHA Enterprise on the final step.
            captcha = detect_captcha(page)
            if captcha:
                screenshot_for_issue(page, DISPATCHER_JOB_ID)
                return emit_result("manual-apply-needed", f"captcha:{captcha}")

            try:
                submit = page.get_by_role(
                    "button", name=re.compile(r"submit|apply", re.I)
                ).last
                if not submit.is_visible(timeout=3000):
                    # Some embedded boards use <input type=submit>.
                    submit = page.locator('input[type="submit"]').first
                step("clicking_submit")
                human_click(page, submit)
            except Exception as e:
                screenshot_for_issue(page, DISPATCHER_JOB_ID)
                return emit_result("manual-apply-needed", f"submit-not-found:{str(e)[:60]}")

            # Wait for either /confirmation or a validation error to surface.
            for _ in range(12):  # up to ~12 seconds
                time.sleep(1.0)
                if detect_confirmation(page):
                    step("confirmed")
                    return emit_result("applied")
                # If the URL didn't change AND there's an error toast,
                # treat as validation failure.
                try:
                    err_box = page.locator(".error, [role=alert]").first
                    if err_box.is_visible(timeout=500):
                        text = (err_box.text_content() or "").strip()[:120]
                        screenshot_for_issue(page, DISPATCHER_JOB_ID)
                        return emit_result("manual-apply-needed", f"validation:{text}")
                except Exception:
                    pass

            # No confirmation, no validation error — flag as ambiguous so
            # the user can verify by hand.
            screenshot_for_issue(page, DISPATCHER_JOB_ID)
            return emit_result("manual-apply-needed", "no-confirmation")

        finally:
            ctx.close()


def main() -> int:
    ap = argparse.ArgumentParser(description="Greenhouse autonomous apply adapter")
    ap.add_argument("--url", required=True)
    ap.add_argument("--job-id", required=True, dest="job_id")
    ap.add_argument("--profile", default=None)
    ap.add_argument("--score", default=None, type=float)
    ap.add_argument("--pdf", default=None, help="Tailored CV PDF path. Defaults to most-recent in profile output dir.")
    ap.add_argument("--cover-letter", default=None, dest="cover_letter",
                    help="Cover-letter PDF path (optional).")
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--dry-run", action="store_true",
                    help="Fill the form but stop before Submit.")
    ap.add_argument("--force-submit", action="store_true", dest="force_submit",
                    help="Submit even when profile.autonomous_apply is off (manual override).")
    args = ap.parse_args()

    # Defensive: write the initial state so the dashboard sees the
    # adapter is running before any step events arrive.
    try:
        write_apply_state(
            args.job_id,
            url=args.url,
            portal="greenhouse",
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
