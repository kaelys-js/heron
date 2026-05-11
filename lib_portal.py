"""
lib_portal.py — Shared helpers for the 6 mid-leverage portal adapters
(Workable, Personio, SmartRecruiters, Recruitee, Teamtailor, Indeed).

The Greenhouse + Ashby + Lever + Workday adapters all have distinctive
schema-fetch + field-fill quirks that justified ~500 lines each. The 6
remaining portals share enough structure that factoring out the common
pieces keeps each adapter under ~250 lines and makes "selector drift"
fixes a single-file change.

What lives here:
  - PortalConfig — per-portal selector + behavior knobs (the only thing
    each adapter has to specify)
  - run_portal_apply() — the standard apply loop, parameterized by config
  - Shared field-fill helpers (the ones distinct from lib_apply because
    they're portal-shape-aware rather than browser-primitive)

What stays in each adapter:
  - The argparse + main() boilerplate (so each script is independently
    executable)
  - Portal-specific schema fetch (where the public API differs)
  - Portal-specific quirks that won't fit in PortalConfig (cookie banners,
    GDPR popups, captcha-prone form steps)
"""
from __future__ import annotations
import argparse
import random
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Callable

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

from lib_apply import (  # noqa: E402
    human_type, human_click, detect_captcha, detect_already_applied,
    upload_file, fill_react_select, append_step, emit_result,
    screenshot_for_issue, write_apply_state,
    load_form_answers, normalize_question,
    is_eeo_label, auto_decline_eeo,
)


@dataclass
class PortalConfig:
    """Per-portal knobs. Each adapter creates one of these + passes it
    to run_portal_apply()."""
    # Identity
    portal_id: str                              # 'workable' | 'personio' | etc
    user_data_dir: Path                         # .playwright-{portal}/

    # Basic-field selectors (CSS — listed in order of preference).
    # Each adapter overrides whichever the portal actually uses.
    name_selectors: list[str] = field(default_factory=list)
    first_name_selectors: list[str] = field(default_factory=list)
    last_name_selectors: list[str] = field(default_factory=list)
    email_selectors: list[str] = field(default_factory=list)
    phone_selectors: list[str] = field(default_factory=list)
    resume_selectors: list[str] = field(default_factory=lambda: ['input[type="file"]'])
    cover_letter_selectors: list[str] = field(default_factory=list)
    submit_selectors: list[str] = field(default_factory=lambda: [
        'button[type="submit"]', 'button:has-text("Submit")', 'button:has-text("Apply")',
    ])
    next_selectors: list[str] = field(default_factory=lambda: [
        'button:has-text("Next")', 'button:has-text("Continue")',
    ])

    # Optional initial-CTA — when the portal lands the user on a description
    # page first and a separate "Apply" button opens the form.
    initial_apply_selectors: list[str] = field(default_factory=list)

    # Cookie-banner / GDPR / consent CTA — clicked silently before form fill.
    cookie_dismiss_selectors: list[str] = field(default_factory=list)

    # Portal-specific "already applied" body markers (in addition to lib_apply.detect_already_applied).
    already_applied_markers: list[str] = field(default_factory=list)

    # Portal-specific confirmation body markers (in addition to the generic ones).
    confirmation_markers: list[str] = field(default_factory=list)

    # Optional URL fixer — some portals require /apply suffix.
    url_transform: Optional[Callable[[str], str]] = None

    # Optional schema fetcher — returns a list of custom-question dicts
    # the adapter walks. Each: {label, required, type, options?}.
    schema_fetcher: Optional[Callable[[Optional[str], Optional[str]], list[dict]]] = None

    # Whether the form is multi-page (uses next_selectors to advance).
    multipage: bool = False

    # Max pages to walk on a multipage form (safety cap).
    max_pages: int = 6


# ── Field helpers ──────────────────────────────────────────────────

def try_selectors(page, selectors: list[str], action: Callable[[object], bool]) -> bool:
    """Iterate a candidate selector list, apply `action` to the first
    visible match. Returns the action's return value."""
    for sel in selectors:
        try:
            el = page.locator(sel).first
            if el.is_visible(timeout=800):
                return action(el)
        except Exception:
            continue
    return False


def fill_text(page, selectors: list[str], value: str) -> bool:
    if not value:
        return False
    return try_selectors(page, selectors, lambda el: (human_type(el, value), True)[1])


def click_first_visible(page, selectors: list[str]) -> bool:
    return try_selectors(page, selectors, lambda el: (human_click(page, el), True)[1])


def dismiss_cookies(page, selectors: list[str]) -> None:
    """Best-effort: click the first cookie/GDPR dismiss button we find."""
    if not selectors:
        return
    try:
        click_first_visible(page, selectors)
    except Exception:
        pass


def detect_confirmation(page, markers: list[str]) -> bool:
    """Combined URL + body confirmation detection."""
    url_lc = (page.url or '').lower()
    if any(t in url_lc for t in ('/confirmation', '/thanks', '/submitted', '/success')):
        return True
    try:
        body = (page.content() or '').lower()
        generic = (
            'thanks for applying', 'application submitted',
            "we've received your application",
            'we have received your application',
            "you've successfully applied",
            'thank you for your application',
        )
        if any(n in body for n in generic):
            return True
        for m in markers:
            if m.lower() in body:
                return True
    except Exception:
        pass
    return False


def detect_already_applied_combined(page, markers: list[str]) -> bool:
    """Generic + portal-specific 'already applied' detection."""
    if detect_already_applied(page):
        return True
    try:
        body = (page.content() or '').lower()
        for m in markers:
            if m.lower() in body:
                return True
    except Exception:
        pass
    return False


# ── Question walker ────────────────────────────────────────────────

def walk_questions(page, questions: list[dict], answers_cache: dict, dispatcher_job_id: str) -> tuple[int, list[str]]:
    """Walk a schema-extracted question list. Auto-decline EEO, look up
    text answers from the form-answers cache, fill react-select dropdowns
    via lib_apply. Returns (filled_count, unknown_required_labels)."""
    filled = 0
    unknown: list[str] = []
    for q in questions:
        label = (q.get('label') or '').strip()
        required = bool(q.get('required'))
        qtype = (q.get('type') or 'input_text').lower()
        if not label:
            continue
        # EEO short-circuit.
        if is_eeo_label(label):
            if auto_decline_eeo(page, label):
                filled += 1
            elif required:
                unknown.append(label)
            continue
        # Cache lookup.
        key = normalize_question(label)
        answer = answers_cache.get(key)
        if not answer:
            if required:
                unknown.append(label)
            continue
        # Type-based fill.
        try:
            if 'select' in qtype or 'dropdown' in qtype or 'multiselect' in qtype:
                if fill_react_select(page, label, str(answer)):
                    filled += 1
                elif required:
                    unknown.append(label)
            elif 'checkbox' in qtype:
                cb = page.get_by_label(label, exact=False).first
                if str(answer).lower() in ('yes', 'true', '1'):
                    cb.check()
                filled += 1
            else:
                el = page.get_by_label(label, exact=False).first
                if el.is_visible(timeout=500):
                    human_type(el, str(answer))
                    filled += 1
                elif required:
                    unknown.append(label)
        except Exception:
            if required:
                unknown.append(label)
    return filled, unknown


# ── Heuristic field discovery ──────────────────────────────────────
# When schema_fetcher is None (most of the 6 stubs), we scan the page
# for required label-input pairs we don't already handle. Same pattern
# the Workday adapter uses.

def discover_required_questions(page, basic_label_hints: list[str]) -> list[dict]:
    """Walk visible labels on the page, surface required ones that aren't
    already covered by the basic field fills. Returns the same shape
    walk_questions() expects: list of {label, required, type}."""
    out: list[dict] = []
    try:
        labels = page.locator('label').all()
    except Exception:
        return out
    seen_labels: set[str] = set()
    for label_el in labels[:60]:
        try:
            if not label_el.is_visible(timeout=200):
                continue
            text = (label_el.text_content() or '').strip()
            if not text or len(text) < 3:
                continue
            lower = text.lower()
            if any(h in lower for h in basic_label_hints):
                continue
            if text in seen_labels:
                continue
            seen_labels.add(text)
            required = '*' in text or '(required)' in lower
            out.append({'label': text, 'required': required, 'type': 'input_text'})
        except Exception:
            continue
    return out


# ── The standard apply loop ────────────────────────────────────────

def run_portal_apply(
    cfg: PortalConfig,
    pw,                          # playwright instance (already entered context)
    args,                        # argparse Namespace
    profile_id: str,
    candidate: dict,
    autonomous: bool,
    pdf_path: Optional[Path],
    dispatcher_job_id: str,
) -> int:
    """Standard form-fill + submit loop, parameterized by PortalConfig.
    Returns the exit code (0 applied / 1 manual-apply-needed / 2 error).
    Each adapter calls this from its run() function after doing portal-
    specific setup (schema fetch, URL transform, etc.)."""
    cfg.user_data_dir.mkdir(parents=True, exist_ok=True)

    def step(name: str) -> None:
        try:
            append_step(dispatcher_job_id, name)
        except Exception:
            pass

    apply_url = cfg.url_transform(args.url) if cfg.url_transform else args.url

    ctx = pw.chromium.launch_persistent_context(
        user_data_dir=str(cfg.user_data_dir),
        headless=not bool(args.headed),
        viewport={'width': 1280, 'height': 900},
        user_agent=(
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
            '(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
        ),
    )
    try:
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        step('navigating')
        page.goto(apply_url, timeout=30_000, wait_until='domcontentloaded')
        try:
            page.wait_for_load_state('networkidle', timeout=10_000)
        except Exception:
            pass
        step('page_loaded')

        # Cookie banners first — they often steal click events.
        dismiss_cookies(page, cfg.cookie_dismiss_selectors)

        # Hard blockers.
        captcha = detect_captcha(page)
        if captcha:
            screenshot_for_issue(page, dispatcher_job_id)
            return emit_result('manual-apply-needed', f'captcha:{captcha}')
        if detect_already_applied_combined(page, cfg.already_applied_markers):
            return emit_result('manual-apply-needed', 'already-applied')

        # Initial Apply-CTA — when the portal lands you on the JD page first.
        if cfg.initial_apply_selectors:
            if click_first_visible(page, cfg.initial_apply_selectors):
                step('clicked_initial_apply')
                time.sleep(random.uniform(0.8, 1.4))
                try:
                    page.wait_for_load_state('networkidle', timeout=8_000)
                except Exception:
                    pass

        step('clear_to_fill')

        # Basic identity fills.
        full_name = (candidate.get('full_name') or '').strip()
        first = full_name.split()[0] if full_name else ''
        last = full_name.rsplit(' ', 1)[-1] if (' ' in full_name) else ''
        if cfg.name_selectors and full_name:
            fill_text(page, cfg.name_selectors, full_name)
            step('filled_name')
        else:
            if cfg.first_name_selectors and first:
                fill_text(page, cfg.first_name_selectors, first)
            if cfg.last_name_selectors and last:
                fill_text(page, cfg.last_name_selectors, last)
            if cfg.first_name_selectors or cfg.last_name_selectors:
                step('filled_name')

        if cfg.email_selectors:
            fill_text(page, cfg.email_selectors, candidate.get('email', ''))
            step('filled_email')

        if cfg.phone_selectors:
            fill_text(page, cfg.phone_selectors, candidate.get('phone', ''))
            step('filled_phone')

        # Resume upload.
        if pdf_path and pdf_path.exists() and cfg.resume_selectors:
            for sel in cfg.resume_selectors:
                try:
                    resume_input = page.locator(sel).first
                    if resume_input.count() > 0:
                        if upload_file(resume_input, str(pdf_path)):
                            step('uploaded_resume')
                            break
                except Exception:
                    continue

        # Custom Q&A — from schema if available, else heuristic discovery.
        answers_cache = load_form_answers(profile_id)
        questions: list[dict] = []
        if cfg.schema_fetcher:
            try:
                questions = cfg.schema_fetcher(None, None) or []
            except Exception:
                questions = []
        if not questions:
            # Discover required labels heuristically.
            basic_hints = ['first name', 'last name', 'full name', 'email', 'phone', 'resume', 'cv', 'upload']
            questions = discover_required_questions(page, basic_hints)

        filled, unknown = walk_questions(page, questions, answers_cache, dispatcher_job_id)
        step(f'custom_questions_done:{filled}/{filled + len(unknown)}')

        if unknown:
            screenshot_for_issue(page, dispatcher_job_id)
            return emit_result(
                'manual-apply-needed',
                'unknown-field:' + ','.join(unknown[:3]),
            )

        # Multi-page walk: click Next until we hit a Submit page.
        if cfg.multipage:
            for page_idx in range(cfg.max_pages):
                # If a submit button is visible, we're on the final page.
                submit_visible = False
                for sel in cfg.submit_selectors:
                    try:
                        if page.locator(sel).first.is_visible(timeout=400):
                            submit_visible = True
                            break
                    except Exception:
                        continue
                if submit_visible:
                    step('reached_submit_page')
                    break
                if click_first_visible(page, cfg.next_selectors):
                    step(f'advanced_page_{page_idx + 1}')
                    time.sleep(random.uniform(0.6, 1.0))
                    # Re-walk any new questions revealed on the new page.
                    questions = discover_required_questions(
                        page,
                        ['first name', 'last name', 'full name', 'email', 'phone', 'resume', 'cv', 'upload'],
                    )
                    _f, u = walk_questions(page, questions, answers_cache, dispatcher_job_id)
                    if u:
                        screenshot_for_issue(page, dispatcher_job_id)
                        return emit_result(
                            'manual-apply-needed',
                            'unknown-field:' + ','.join(u[:3]),
                        )
                else:
                    step('multipage_no_next_button')
                    break

        # Submit gate.
        if args.dry_run:
            step('dry_run_skip_submit')
            return emit_result('manual-apply-needed', 'dry-run')

        if not autonomous and not args.force_submit:
            return emit_result('manual-apply-needed', 'review-required:autonomous_apply off')

        # Final captcha recheck.
        captcha = detect_captcha(page)
        if captcha:
            screenshot_for_issue(page, dispatcher_job_id)
            return emit_result('manual-apply-needed', f'captcha:{captcha}')

        # Click submit.
        if not click_first_visible(page, cfg.submit_selectors):
            screenshot_for_issue(page, dispatcher_job_id)
            return emit_result('manual-apply-needed', 'submit-not-found')
        step('clicked_submit')

        # Wait for confirmation OR a validation error.
        for _ in range(15):
            time.sleep(1.0)
            if detect_confirmation(page, cfg.confirmation_markers):
                step('confirmed')
                return emit_result('applied')
            try:
                err = page.locator('.error, [role=alert], [data-error]').first
                if err.is_visible(timeout=400):
                    text = (err.text_content() or '').strip()[:120]
                    screenshot_for_issue(page, dispatcher_job_id)
                    return emit_result('manual-apply-needed', f'validation:{text}')
            except Exception:
                pass

        screenshot_for_issue(page, dispatcher_job_id)
        return emit_result('manual-apply-needed', 'no-confirmation')

    finally:
        ctx.close()


# ── Standard adapter scaffold ──────────────────────────────────────

def adapter_main(cfg_factory: Callable[[], PortalConfig], description: str) -> int:
    """Standard argparse + profile load + run_portal_apply orchestration.
    Each portal adapter's main() is a one-liner calling this with its
    PortalConfig factory."""
    from lib_profiles import resolve_profile_arg, profile_path  # local import
    import yaml
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('ERROR: playwright not installed.', file=sys.stderr)
        return 2

    ap = argparse.ArgumentParser(description=description)
    ap.add_argument('--url', required=True)
    ap.add_argument('--job-id', required=True, dest='job_id')
    ap.add_argument('--profile', default=None)
    ap.add_argument('--score', default=None, type=float)
    ap.add_argument('--pdf', default=None)
    ap.add_argument('--cover-letter', default=None, dest='cover_letter')
    ap.add_argument('--headed', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--force-submit', action='store_true', dest='force_submit')
    args = ap.parse_args()

    cfg = cfg_factory()

    try:
        write_apply_state(
            args.job_id,
            url=args.url, portal=cfg.portal_id, profileId=args.profile or '',
            startedAt=int(time.time() * 1000),
            lastStep='adapter_start',
            stepHistory=['queued', 'dispatched', 'adapter_start'],
        )
    except Exception:
        pass

    profile_id = resolve_profile_arg(args.profile)
    profile_yml = profile_path(profile_id, 'profile-yml')
    if not profile_yml.exists():
        return emit_result('error', 'profile-missing')
    with profile_yml.open() as f:
        profile = yaml.safe_load(f) or {}
    candidate = profile.get('candidate', {}) or {}
    auto = profile.get('automation', {}) or {}
    min_score = float(auto.get('min_score_to_apply', 4.0))
    autonomous = bool(auto.get('autonomous_apply', False))

    score = float(args.score) if args.score is not None else None
    if score is not None and autonomous and score < min_score:
        return emit_result('manual-apply-needed', f'score-gate:{score:.1f} below {min_score:.1f}')

    pdf_path = Path(args.pdf) if args.pdf else None
    if not pdf_path or not pdf_path.exists():
        out_dir = profile_path(profile_id, 'output-dir')
        try:
            cands = sorted([p for p in out_dir.glob('*.pdf') if 'cv-general' not in p.name],
                           key=lambda p: p.stat().st_mtime, reverse=True)
            pdf_path = cands[0] if cands else None
        except Exception:
            pdf_path = None

    try:
        with sync_playwright() as pw:
            return run_portal_apply(
                cfg, pw, args, profile_id, candidate, autonomous, pdf_path, args.job_id,
            )
    except KeyboardInterrupt:
        return emit_result('error', 'interrupted')
    except Exception as e:
        return emit_result('error', f'{type(e).__name__}:{str(e)[:120]}')
