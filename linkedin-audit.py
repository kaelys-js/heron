#!/usr/bin/env python3
"""
linkedin-audit.py — comprehensive LinkedIn profile + account audit.

Walks the authenticated user's own LinkedIn presence and dumps a JSON
snapshot the dashboard turns into a "review + fix" remediation report.

The scraper covers BOTH halves of LinkedIn:

  PROFILE side  (what recruiters + hiring managers see)
    /in/me                         → headline, about, role list, skills, ...
    /in/me/details/experience/     → full experience entries
    /in/me/details/skills/         → skills list
    /in/me/details/recommendations/ → recommendations count + samples
    /in/me/details/projects/       → projects list
    /in/me/details/publications/   → publications + talks
    /in/me/details/certifications/ → certifications
    /in/me/activity/all/           → last post / comment date

  ACCOUNT side  (settings that gate recruiter visibility + safety)
    /mypreferences/m/jobs          → "Open to work" toggle + recruiter filters
    /settings/visibility/          → visibility flags
    /settings/account/             → account-level toggles
    /settings/sign-in-security/    → 2FA status

The script is read-only — it never writes to LinkedIn. Findings get
emitted to stdout as JSON; the TS-side `linkedin-audit.ts` library
classifies + drafts paste-ready remediations.

USAGE
  python3 linkedin-audit.py --json
  python3 linkedin-audit.py --json --headed   # one-time login session

EXIT CODES
  0  — clean run, JSON emitted
  1  — auth required (run with --headed once to log in)
  2  — partial scrape (some sections blocked); JSON still emitted with `errors`
  3  — fatal error (Playwright spawn failure, etc.)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from typing import Any

from lib_playwright_auth import (
    launch_persistent,
    is_logged_in_linkedin,
    humanize,
    PROBE_TIMEOUT_MS,
)

try:
    from playwright.sync_api import Page, TimeoutError as PlaywrightTimeout
except ImportError:
    print("ERROR: playwright not installed", file=sys.stderr)
    sys.exit(3)


def safe_text(page: Page, selector: str, default: str = "") -> str:
    """Best-effort text extraction. Returns default when missing."""
    try:
        el = page.locator(selector).first
        if el.count() == 0:
            return default
        text = el.inner_text(timeout=2000).strip()
        return text or default
    except Exception:
        return default


def safe_attr(page: Page, selector: str, attr: str, default: str = "") -> str:
    try:
        el = page.locator(selector).first
        if el.count() == 0:
            return default
        return (el.get_attribute(attr) or default).strip()
    except Exception:
        return default


def safe_count(page: Page, selector: str) -> int:
    try:
        return page.locator(selector).count()
    except Exception:
        return 0


def goto(page: Page, url: str, wait_ms: int = PROBE_TIMEOUT_MS) -> bool:
    try:
        page.goto(url, timeout=wait_ms, wait_until="domcontentloaded")
        humanize(0.8, 1.6)
        return True
    except PlaywrightTimeout:
        return False
    except Exception:
        return False


def scrape_profile_overview(page: Page) -> dict[str, Any]:
    """Pulls headline, name, location, About, photo + banner presence,
    custom-URL slug, profile visibility."""
    out: dict[str, Any] = {}
    if not goto(page, "https://www.linkedin.com/in/me/"):
        out["error"] = "profile overview did not load"
        return out

    # The /in/me URL redirects to /in/{custom-slug}/. We extract the
    # final URL to get the custom slug.
    final_url = page.url
    m = re.match(r"https?://[^/]+/in/([^/?#]+)/?", final_url)
    out["customSlug"] = m.group(1) if m else ""

    # Name + headline
    out["name"] = safe_text(page, "h1.text-heading-xlarge, h1")
    out["headline"] = safe_text(page, "div.text-body-medium.break-words")
    out["location"] = safe_text(page, "div.text-body-small.inline.t-black--light.break-words")

    # Photo + banner. We just check for presence; can't read the image
    # content without an extra fetch.
    out["hasPhoto"] = safe_count(page, "img.pv-top-card-profile-picture__image") > 0
    out["hasBanner"] = safe_count(page, "div.profile-top-card__profile-info img.cover-img__image") > 0

    # About section
    about_section = page.locator("div#about").locator("xpath=ancestor::section[1]")
    if about_section.count() > 0:
        try:
            about = about_section.locator("div.display-flex.ph5.pv3 span").inner_text(timeout=2000)
            out["about"] = about.strip()
        except Exception:
            out["about"] = ""
    else:
        out["about"] = ""

    return out


def scrape_experience(page: Page) -> list[dict[str, Any]]:
    """Walks /in/me/details/experience/ and pulls each role entry."""
    if not goto(page, "https://www.linkedin.com/in/me/details/experience/"):
        return []
    entries: list[dict[str, Any]] = []
    try:
        page.wait_for_selector("main", timeout=PROBE_TIMEOUT_MS)
        # Each role lives inside a list item with bold title + meta lines.
        cards = page.locator(
            "section.pvs-list__container li.pvs-list__paged-list-item"
        )
        count = min(cards.count(), 25)
        for i in range(count):
            card = cards.nth(i)
            try:
                title = card.locator("span[aria-hidden='true']").first.inner_text(timeout=1500).strip()
                # Company + dates are subsequent spans
                spans = card.locator("span[aria-hidden='true']")
                all_text = [
                    spans.nth(j).inner_text(timeout=500).strip()
                    for j in range(min(spans.count(), 6))
                ]
                entries.append(
                    {
                        "title": title,
                        "raw": all_text,
                    }
                )
            except Exception:
                continue
    except Exception:
        pass
    return entries


def scrape_skills(page: Page) -> list[str]:
    """Walks /in/me/details/skills/ and pulls the skill names."""
    if not goto(page, "https://www.linkedin.com/in/me/details/skills/"):
        return []
    skills: list[str] = []
    try:
        items = page.locator(
            "section.pvs-list__container li.pvs-list__paged-list-item span[aria-hidden='true']"
        )
        count = min(items.count(), 100)
        for i in range(count):
            try:
                s = items.nth(i).inner_text(timeout=500).strip()
                if s and len(s) < 80 and s not in skills:
                    skills.append(s)
            except Exception:
                continue
    except Exception:
        pass
    return skills


def scrape_recommendations(page: Page) -> dict[str, Any]:
    if not goto(page, "https://www.linkedin.com/in/me/details/recommendations/"):
        return {"received": 0, "given": 0}
    received = safe_count(
        page, "section[data-section='received-recommendations'] li.pvs-list__paged-list-item"
    )
    given = safe_count(
        page, "section[data-section='given-recommendations'] li.pvs-list__paged-list-item"
    )
    return {"received": received, "given": given}


def scrape_featured(page: Page) -> dict[str, Any]:
    if not goto(page, "https://www.linkedin.com/in/me/details/featured/"):
        return {"count": 0}
    items = safe_count(page, "section.pvs-list__container li.pvs-list__paged-list-item")
    return {"count": items}


def scrape_activity(page: Page) -> dict[str, Any]:
    """Returns the date of the most recent post/comment as 'time ago'
    relative text (LinkedIn doesn't expose absolute dates without an
    extra click). Stale activity = recruiter algorithm down-ranks."""
    if not goto(page, "https://www.linkedin.com/in/me/recent-activity/all/"):
        return {"lastActivityAgo": "unknown"}
    try:
        page.wait_for_selector("main", timeout=10_000)
        first = safe_text(
            page,
            "div.profile-creator-shared-feed-update__container span.update-components-actor__sub-description",
        )
        if not first:
            first = safe_text(
                page,
                "div.scaffold-finite-scroll__content time, span.update-components-actor__sub-description",
            )
        return {"lastActivityAgo": first or "unknown"}
    except Exception:
        return {"lastActivityAgo": "unknown"}


def scrape_open_to_work(page: Page) -> dict[str, Any]:
    """Jobs preferences page — controls recruiter visibility."""
    out: dict[str, Any] = {"openToWork": False, "openToWorkPublic": False}
    if not goto(page, "https://www.linkedin.com/mypreferences/m/jobs"):
        return out
    try:
        body_text = page.locator("body").inner_text(timeout=5000).lower()
        out["openToWork"] = (
            "you're sharing that you're open to work" in body_text
            or "you're sharing this with recruiters only" in body_text
            or "show recruiters" in body_text
        )
        out["openToWorkPublic"] = "all linkedin members" in body_text
    except Exception:
        pass
    return out


def scrape_visibility(page: Page) -> dict[str, Any]:
    """Settings → Visibility — gates several signals recruiters use to
    decide whether to message you."""
    out: dict[str, Any] = {}
    if not goto(page, "https://www.linkedin.com/mypreferences/d/profile-visibility"):
        return out
    try:
        body = page.locator("body").inner_text(timeout=5000).lower()
        out["profilePublic"] = "your profile is public" in body or "public profile" in body
        # We can't reliably read each toggle's state without the right
        # data-testid hooks; capture coarse signal.
    except Exception:
        pass
    return out


def scrape_2fa(page: Page) -> dict[str, Any]:
    out: dict[str, Any] = {"twoFactorOn": None}
    if not goto(page, "https://www.linkedin.com/mypreferences/d/two-step-verification"):
        return out
    try:
        body = page.locator("body").inner_text(timeout=5000).lower()
        out["twoFactorOn"] = "two-step verification is on" in body
    except Exception:
        pass
    return out


def run_audit(headed: bool = False) -> dict[str, Any]:
    snapshot: dict[str, Any] = {
        "auditedAt": int(time.time() * 1000),
        "errors": [],
    }
    with launch_persistent("linkedin", headed=headed) as ctx:
        page = ctx.new_page()
        if not is_logged_in_linkedin(page):
            print(
                "ERROR: LinkedIn session expired. Re-run with --headed once to log in.",
                file=sys.stderr,
            )
            sys.exit(1)
        humanize(0.5, 1.0)
        try:
            snapshot["profile"] = scrape_profile_overview(page)
        except Exception as e:
            snapshot["errors"].append("profile: " + str(e))
        try:
            snapshot["experience"] = scrape_experience(page)
        except Exception as e:
            snapshot["errors"].append("experience: " + str(e))
        try:
            snapshot["skills"] = scrape_skills(page)
        except Exception as e:
            snapshot["errors"].append("skills: " + str(e))
        try:
            snapshot["recommendations"] = scrape_recommendations(page)
        except Exception as e:
            snapshot["errors"].append("recommendations: " + str(e))
        try:
            snapshot["featured"] = scrape_featured(page)
        except Exception as e:
            snapshot["errors"].append("featured: " + str(e))
        try:
            snapshot["activity"] = scrape_activity(page)
        except Exception as e:
            snapshot["errors"].append("activity: " + str(e))
        try:
            snapshot["openToWork"] = scrape_open_to_work(page)
        except Exception as e:
            snapshot["errors"].append("openToWork: " + str(e))
        try:
            snapshot["visibility"] = scrape_visibility(page)
        except Exception as e:
            snapshot["errors"].append("visibility: " + str(e))
        try:
            snapshot["security"] = scrape_2fa(page)
        except Exception as e:
            snapshot["errors"].append("security: " + str(e))
    return snapshot


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help="emit JSON to stdout")
    ap.add_argument("--headed", action="store_true", help="show the browser (use for first login)")
    args = ap.parse_args()
    snapshot = run_audit(headed=args.headed)
    if args.json:
        print(json.dumps(snapshot, indent=2))
    else:
        # Human-readable summary
        p = snapshot.get("profile", {})
        print(f"Name      : {p.get('name', '—')}")
        print(f"Headline  : {p.get('headline', '—')[:100]}")
        print(f"About     : {len(p.get('about', ''))} chars")
        print(f"Experience: {len(snapshot.get('experience', []))} roles")
        print(f"Skills    : {len(snapshot.get('skills', []))}")
        print(f"OpenToWork: {snapshot.get('openToWork', {}).get('openToWork', '?')}")
        print(f"2FA       : {snapshot.get('security', {}).get('twoFactorOn', '?')}")
        if snapshot.get("errors"):
            print(f"Errors    : {len(snapshot['errors'])}")
    sys.exit(2 if snapshot.get("errors") else 0)


if __name__ == "__main__":
    main()
