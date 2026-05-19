"""
lib_apply.py — Shared Playwright helpers for the autonomous apply system.

Every per-portal adapter (apply-greenhouse.py, apply-ashby.py, apply-linkedin.py,
the future Lever/Workable/Personio/SmartRecruiters/Recruitee/Teamtailor/Indeed/
Workday adapters) imports from here:

  - human_type / human_click — anti-bot cadence so fills look human-paced
  - detect_captcha — text + DOM heuristics for reCAPTCHA / hCaptcha / Cloudflare
  - detect_already_applied — common "you've already applied" markers
  - upload_file — set_input_files with retry on transient errors
  - fill_react_select — click → type → Enter for react-select dropdowns
  - write_apply_state / append_step — JSON state file used by dashboard
  - screenshot_for_issue — saves PNG for failure-Issue attachments
  - detect_portal — URL → portal id (mirrors apply-dispatcher.ts)

The state file convention matches ui/src/lib/server/apply-state.ts —
data/apply-state/{jobId}.json with fields {jobId, url, portal, profileId,
startedAt, lastStep, stepHistory, screenshotPath?, capturedAt}.

The portal-detection regex set mirrors apply-dispatcher.ts:detectPortal —
if you change one, change the other.
"""

from __future__ import annotations
import json
import os
import random
import re
import sys
import time
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

ROOT = Path(__file__).parent
REPO_ROOT = ROOT.parent.parent  # scripts/<domain>/ → repo/
APPLY_STATE_DIR = REPO_ROOT / "data" / "apply-state"
PROFILES_DIR = REPO_ROOT / "data" / "profiles"


# ── Form-answers cache ─────────────────────────────────────────────
# Mirror of ui/src/lib/server/form-answers-cache.ts. The Python adapters
# READ from this cache when filling forms; the TS side writes to it when
# the user confirms answers via the inbox or /profile UI.
#
# File: data/profiles/{slug}/form-answers-cache.jsonl
# Each line: {"key", "label", "answer", "updatedAt", "useCount"}


def normalize_question(label: str) -> str:
    """Mirror TS-side normalizeQuestion(). Lowercase, strip punctuation,
    collapse whitespace, drop generic noise words. The cache lookup key."""
    if not label:
        return ""
    s = label.lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\b(a|an|the|please|kindly|do|you)\b", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def load_form_answers(profile_id: Optional[str]) -> dict[str, str]:
    """Return a dict mapping normalized question → answer for a profile.
    Empty when the cache file doesn't exist yet. Robust to corrupt lines —
    skips them silently so one bad row doesn't kill the whole lookup."""
    if not profile_id:
        return {}
    p = PROFILES_DIR / profile_id / "form-answers-cache.jsonl"
    if not p.exists():
        return {}
    out: dict[str, str] = {}
    try:
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
                key = row.get("key")
                ans = row.get("answer")
                if isinstance(key, str) and isinstance(ans, str):
                    # Later rows win on duplicate keys (append-only with
                    # last-write-wins).
                    out[key] = ans
            except Exception:
                continue
    except Exception:
        return {}
    return out


def lookup_answer(profile_id: Optional[str], label: str) -> Optional[str]:
    """Find a saved answer for a question label. Normalizes before lookup,
    so 'Why this role?' and 'Why this role' both hit the same cache slot."""
    if not label:
        return None
    cache = load_form_answers(profile_id)
    return cache.get(normalize_question(label))


# ── Human-cadence input helpers ────────────────────────────────────


def human_type(locator, text: str) -> None:
    """Type into a Playwright Locator with 50-150ms/char jitter so the
    timing pattern doesn't match a default headless fill. Pauses are
    randomized per-character — uniform timing is itself a tell."""
    for ch in text:
        locator.type(ch, delay=random.randint(50, 150))
    # Trailing 100-300ms pause before whatever the script does next.
    time.sleep(random.uniform(0.1, 0.3))


def human_click(page, locator) -> None:
    """Mouse-move + 200-600ms wait + click. Doesn't hover precisely on the
    center; offsets the target by ±5px to imitate the human imprecision
    LinkedIn / Cloudflare watch for."""
    try:
        box = locator.bounding_box()
        if box:
            cx = box["x"] + box["width"] / 2 + random.uniform(-5, 5)
            cy = box["y"] + box["height"] / 2 + random.uniform(-5, 5)
            # Mouse-move in 5 steps so it's not an instant teleport.
            page.mouse.move(cx, cy, steps=5)
            time.sleep(random.uniform(0.2, 0.6))
    except Exception:
        # bounding_box can fail on scrolled-out or detached elements;
        # falling through to a plain click is fine -- the timing is the
        # primary signal anti-bot watches for.
        pass
    locator.click()
    time.sleep(random.uniform(0.2, 0.5))


# ── Anti-bot / blocked-page detection ─────────────────────────────

CaptchaKind = Optional[
    str
]  # 'recaptcha' | 'hcaptcha' | 'turnstile' | 'cloudflare-block' | 'email-code' | None


def detect_captcha(page) -> CaptchaKind:
    """Quick DOM + text scan for the common CAPTCHA / anti-bot patterns
    each ATS uses. Returns the kind on hit, None when the page is clean.

    Strategy: look at iframe srcs first (cheapest + most reliable), then
    fall back to body text heuristics. Don't try to solve — return the
    kind so the adapter can fail soft and surface an Issue with context."""
    try:
        # Iframe sniffing -- each provider loads a distinct domain.
        frames = page.frames
        for f in frames:
            src = (f.url or "").lower()
            if "recaptcha" in src or "google.com/recaptcha" in src:
                return "recaptcha"
            if "hcaptcha.com" in src:
                return "hcaptcha"
            if "challenges.cloudflare.com" in src or "turnstile" in src:
                return "turnstile"
        # Body-text heuristics -- slower; only used when iframe sniffing missed.
        body = (page.content() or "").lower()
        if "cloudflare" in body and ("checking your browser" in body or "ray id" in body):
            return "cloudflare-block"
        if "are you a robot" in body or "verify you are human" in body:
            return "recaptcha"
        # Greenhouse 6-digit email-code fallback (post-reCAPTCHA path).
        if "we sent a code to" in body or "enter the 6-digit code" in body:
            return "email-code"
    except Exception:
        pass
    return None


def detect_already_applied(page) -> bool:
    """Text-heuristic for the common 'you've already applied' state across
    portals. False negatives are OK — the script just tries to apply again
    and the portal will reject the duplicate."""
    try:
        body = (page.content() or "").lower()
        for needle in (
            "you've already applied",
            "you have already applied",
            "application received",
            "thanks for applying",
            "already submitted",
        ):
            if needle in body:
                return True
    except Exception:
        pass
    return False


# ── File upload ─────────────────────────────────────────────────────


def upload_file(input_locator, path: str, retries: int = 2) -> bool:
    """Wraps set_input_files with retry on transient errors. Returns True
    on success. Logs reason on failure so the dispatcher's stdout-parser
    can correlate to a meaningful APPLY_RESULT:manual-apply-needed:upload-failed."""
    if not os.path.isfile(path):
        print(f"  [upload_file] missing source: {path}", file=sys.stderr)
        return False
    last_err = None
    for attempt in range(retries + 1):
        try:
            input_locator.set_input_files(path)
            return True
        except Exception as e:
            last_err = e
            if attempt < retries:
                time.sleep(0.8 + attempt * 0.7)
    print(
        f"  [upload_file] failed after {retries + 1} attempts: {last_err}",
        file=sys.stderr,
    )
    return False


# ── react-select handling ───────────────────────────────────────────


def fill_react_select(page, label_text: str, value: str) -> bool:
    """Greenhouse + Ashby + most modern ATS use react-select for ALL
    dropdowns. Playwright's selectOption() doesn't work — you have to
    click the control, type a filter, and press Enter to commit.

    Resilient order: try get_by_label first (preferred), fall back to
    role=combobox with name, finally a class-name selector last."""
    try:
        target = page.get_by_label(label_text, exact=False).first
        if not target.is_visible(timeout=2000):
            raise Exception("get_by_label not visible")
        target.click()
        page.keyboard.type(value, delay=random.randint(40, 100))
        time.sleep(random.uniform(0.3, 0.6))
        page.keyboard.press("Enter")
        time.sleep(random.uniform(0.2, 0.4))
        return True
    except Exception:
        # Fallback: role-based combobox lookup.
        try:
            cb = page.get_by_role("combobox", name=re.compile(label_text, re.I)).first
            cb.click()
            page.keyboard.type(value, delay=random.randint(40, 100))
            time.sleep(random.uniform(0.3, 0.6))
            page.keyboard.press("Enter")
            return True
        except Exception:
            return False


# ── State file (JSON) ───────────────────────────────────────────────


def _state_path(job_id: str) -> Path:
    safe = re.sub(r"[^a-zA-Z0-9_\-:]", "", job_id) or "unknown"
    APPLY_STATE_DIR.mkdir(parents=True, exist_ok=True)
    return APPLY_STATE_DIR / f"{safe}.json"


def write_apply_state(job_id: str, **fields) -> None:
    """Replace the state file with the given fields. Fields not provided
    are dropped; pass everything you want persisted in a single call."""
    p = _state_path(job_id)
    payload = {"jobId": job_id, "capturedAt": int(time.time() * 1000), **fields}
    p.write_text(json.dumps(payload, indent=2) + "\n")


def append_step(job_id: str, step: str) -> None:
    """Append `step` to the existing state file's stepHistory. No-op when
    the file doesn't exist — caller should write_apply_state first."""
    p = _state_path(job_id)
    if not p.exists():
        return
    try:
        data = json.loads(p.read_text())
        data["lastStep"] = step
        history = data.get("stepHistory") or []
        history.append(step)
        data["stepHistory"] = history
        data["capturedAt"] = int(time.time() * 1000)
        p.write_text(json.dumps(data, indent=2) + "\n")
        # Also print the canonical APPLY_STEP line so the dispatcher's
        # stdout parser sees it.
        print(f"APPLY_STEP: {step}")
    except Exception:
        pass


def clear_apply_state(job_id: str) -> None:
    p = _state_path(job_id)
    try:
        if p.exists():
            p.unlink()
    except Exception:
        pass


def screenshot_for_issue(page, job_id: str) -> Optional[str]:
    """Save a PNG next to the state file for Issue attachment. Returns the
    relative path (anchored at ROOT) so the TS-side Issue can render it."""
    try:
        APPLY_STATE_DIR.mkdir(parents=True, exist_ok=True)
        safe = re.sub(r"[^a-zA-Z0-9_\-:]", "", job_id) or "unknown"
        out = APPLY_STATE_DIR / f"{safe}.png"
        page.screenshot(path=str(out), full_page=False)
        return str(out.relative_to(REPO_ROOT))
    except Exception as e:
        print(f"  [screenshot_for_issue] failed: {e}", file=sys.stderr)
        return None


# ── EEO / voluntary self-ID detection + auto-decline ──────────────
#
# Every US-facing ATS (Greenhouse, Ashby, Lever, Workday) appends an EEO /
# voluntary self-identification step asking about race, gender, ethnicity,
# disability, and veteran status. These fields are LEGALLY voluntary --
# every form offers a "Decline to answer" / "I don't wish to self-identify"
# option, and many candidates exercise that right.
#
# Without this handler, the autonomous-apply pipeline collapses on every
# Greenhouse application that includes the EEO step (most do). We:
#   1. Detect EEO labels by keyword match
#   2. Pick the "decline" option for each field
#   3. Surface a single APPLY_STEP per field so the user can audit the run
#
# This is policy-conservative: we ALWAYS decline. If a user wants to
# disclose, they should fill that step by hand on the posting itself
# (the autonomous-apply path is opt-in per-profile anyway).

EEO_LABEL_PATTERNS = [
    # Race / ethnicity
    "race",
    "ethnicity",
    "ethnic",
    "hispanic",
    "latino",
    # Gender / sex
    "gender",
    "sex",
    "are you male",
    "male or female",
    # Disability
    "disability",
    "disabled",
    # Veteran status
    "veteran",
    "military",
    # Generic "voluntary self-identification"
    "voluntary self-id",
    "voluntary self id",
    "voluntary disclosure",
    "self-identification",
    "self identification",
    "demographic",
]

EEO_DECLINE_OPTIONS = [
    # Greenhouse react-select options
    "decline to self-identify",
    "i don't wish to answer",
    "i do not wish to answer",
    "decline to answer",
    "prefer not to say",
    "prefer not to answer",
    "i don't wish to self-identify",
    "i don't wish to disclose",
    # Disability-specific phrasing
    "i don't want to answer",
    "i do not want to answer",
    # Veteran-specific phrasing
    "i don't wish to identify my veteran status",
    "i don't wish to identify",
]


def is_eeo_label(label: str) -> bool:
    """True if this question label looks like an EEO / self-ID field."""
    if not label:
        return False
    lower = label.lower()
    return any(p in lower for p in EEO_LABEL_PATTERNS)


def auto_decline_eeo(page, label: str) -> bool:
    """Try to select the "Decline to answer" option for an EEO field.

    Strategy in order of preference:
      1. If the field is a react-select dropdown, try each decline option
         text via fill_react_select.
      2. If it's a radio group, click the matching label.
      3. If it's a plain <select>, attempt selectOption with the decline
         option's exact text.

    Returns True when we successfully selected a decline option.
    Returns False when the field looked like EEO but we couldn't decline —
    caller should treat that as a soft failure (manual-apply-needed) so
    the user can finish by hand."""
    for decline_text in EEO_DECLINE_OPTIONS:
        # 1. react-select.
        if fill_react_select(page, label, decline_text):
            return True
    # 2. Radio group -- look for any label-element that contains a decline phrase.
    try:
        for decline_text in EEO_DECLINE_OPTIONS:
            radio = page.get_by_label(decline_text, exact=False).first
            if radio.is_visible(timeout=500):
                radio.click()
                return True
    except Exception:
        pass
    # 3. Plain <select>.
    try:
        sel = page.get_by_label(label, exact=False).first
        if sel.is_visible(timeout=500):
            for decline_text in EEO_DECLINE_OPTIONS:
                try:
                    sel.select_option(label=decline_text)
                    return True
                except Exception:
                    continue
    except Exception:
        pass
    return False


# ── URL → portal detection ─────────────────────────────────────────
# Mirrors ui/src/lib/server/apply-dispatcher.ts:detectPortal. Keep in sync.


def detect_portal(url: str) -> dict:
    """Return {'portal': <id>, 'meta': {company?, jobId?}}. Unknown URL
    returns {'portal': 'unknown'}."""
    if not url:
        return {"portal": "unknown"}
    try:
        u = urlparse(url)
    except Exception:
        return {"portal": "unknown"}
    h = (u.hostname or "").lower()
    p = u.path or ""

    # LinkedIn
    if re.search(r"(^|\.)linkedin\.com$", h):
        m = re.search(r"/jobs/view/(\d+)", p)
        return {"portal": "linkedin", "meta": {"jobId": m.group(1) if m else None}}

    # Greenhouse -- boards / job-boards / .eu shard
    m = re.match(r"^((?:job-)?boards)(?:\.eu)?\.greenhouse\.io$", h)
    if m:
        parts = [x for x in p.split("/") if x]
        company = parts[0] if parts else None
        job_id = None
        if "jobs" in parts:
            idx = parts.index("jobs")
            if idx + 1 < len(parts):
                job_id = parts[idx + 1]
        return {"portal": "greenhouse", "meta": {"company": company, "jobId": job_id}}

    # Ashby
    if h == "jobs.ashbyhq.com" or re.search(r"(^|\.)ashbyhq\.com$", h):
        parts = [x for x in p.split("/") if x]
        return {
            "portal": "ashby",
            "meta": {
                "company": parts[0] if parts else None,
                "jobId": parts[1] if len(parts) > 1 else None,
            },
        }

    # Lever
    if h == "jobs.lever.co" or re.search(r"(^|\.)lever\.co$", h):
        parts = [x for x in p.split("/") if x]
        return {
            "portal": "lever",
            "meta": {
                "company": parts[0] if parts else None,
                "jobId": parts[1] if len(parts) > 1 else None,
            },
        }

    # Workable
    if re.search(r"(^|\.)workable\.com$", h):
        parts = [x for x in p.split("/") if x]
        return {"portal": "workable", "meta": {"company": parts[0] if parts else None}}

    # Personio
    if re.search(r"(^|\.)jobs\.personio\.(com|de|eu)$", h) or re.search(
        r"(^|\.)personio\.(com|de|eu)$", h
    ):
        return {"portal": "personio"}

    # SmartRecruiters
    if re.search(r"(^|\.)smartrecruiters\.com$", h):
        parts = [x for x in p.split("/") if x]
        return {
            "portal": "smartrecruiters",
            "meta": {"company": parts[0] if parts else None},
        }

    # Recruitee -- {company}.recruitee.com
    if re.search(r"(^|\.)recruitee\.com$", h):
        return {"portal": "recruitee", "meta": {"company": h.split(".")[0]}}

    # Teamtailor
    if re.search(r"(^|\.)teamtailor\.com$", h):
        return {"portal": "teamtailor", "meta": {"company": h.split(".")[0]}}

    # Workday
    if re.search(r"(^|\.)myworkdayjobs\.com$", h):
        return {"portal": "workday"}

    # Indeed
    if re.search(r"(^|\.)indeed\.com$", h):
        return {"portal": "indeed"}

    return {"portal": "unknown"}


# ── Convenience: print the canonical RESULT line ───────────────────


def emit_result(status: str, reason: Optional[str] = None) -> int:
    """Print the canonical APPLY_RESULT line + return the right exit code.

    status ∈ {'applied', 'manual-apply-needed', 'error'}

    Exit code contract:
        0 — applied
        1 — manual-apply-needed
        2 — error
    """
    line = f"APPLY_RESULT: {status}"
    if reason:
        line += f":{reason}"
    print(line)
    return {"applied": 0, "manual-apply-needed": 1, "error": 2}.get(status, 2)
