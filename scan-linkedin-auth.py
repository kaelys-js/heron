#!/usr/bin/env python3
"""
scan-linkedin-auth.py — Authenticated LinkedIn Jobs scrape.

Uses the persistent Playwright session at .playwright-linkedin/ (shared
with linkedin-easy-apply.py via lib_playwright_auth.py). Headless. Hits
each search query in profile.yml + portals.yml, scrolls through results,
extracts job-card data, dedupes against scan-history.tsv + pipeline.md +
applications.md, and appends survivors to pipeline.md with source
`linkedin-authenticated`.

Why authenticated: public scrapers (JobSpy etc.) hit anti-bot walls and
miss "Easy Apply" private listings + the personalized recommendation
feed. Logged-in scraping sees what YOU see when scrolling LinkedIn —
~100% coverage of YOUR feed at $0 cost, no API needed.

USAGE
-----

  .venv/bin/python scan-linkedin-auth.py
  .venv/bin/python scan-linkedin-auth.py --dry-run            # don't write files
  .venv/bin/python scan-linkedin-auth.py --max-pages 10       # cap per query
  .venv/bin/python scan-linkedin-auth.py --query "AI Engineer"   # one-off query
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode

try:
    from playwright.sync_api import TimeoutError as PlaywrightTimeout
except ImportError:
    print("ERROR: playwright not installed. Run:\n  .venv/bin/pip install playwright && .venv/bin/python -m playwright install chromium", file=sys.stderr)
    sys.exit(1)

try:
    import yaml
except ImportError:
    print("ERROR: pyyaml not installed. Run:\n  .venv/bin/pip install pyyaml", file=sys.stderr)
    sys.exit(1)

from lib_playwright_auth import (
    launch_persistent, is_logged_in_linkedin, humanize, USER_DATA_DIRS,
)


ROOT = Path(__file__).resolve().parent
PROFILE_YML = ROOT / "config" / "profile.yml"
PORTALS_YML = ROOT / "portals.yml"
PIPELINE_MD = ROOT / "data" / "pipeline.md"
APPLICATIONS_MD = ROOT / "data" / "applications.md"
SCAN_HISTORY_TSV = ROOT / "data" / "scan-history.tsv"

# LinkedIn job search caps:
#   * 25 page-equivalents (~25 × 25 results = ~625 jobs) per query before
#     pagination starts repeating
#   * Across all queries we cap total scrolls to keep runs under ~5min
DEFAULT_MAX_PAGES = 25
SCROLL_PAUSE_S = 1.2

SOURCE_LABEL = "linkedin-authenticated"


def load_search_queries() -> list[dict[str, str]]:
    """Build LinkedIn search queries from profile.yml's target_roles +
    location. portals.yml may also specify `linkedin_searches:` for
    explicit overrides; we merge with profile-derived defaults.

    Each query is a dict { 'keywords': str, 'location': str }."""
    if not PROFILE_YML.exists():
        print(f"ERROR: {PROFILE_YML} missing — run /onboarding first.", file=sys.stderr)
        sys.exit(2)
    profile = yaml.safe_load(PROFILE_YML.read_text()) or {}

    target_roles = (profile.get("target_roles") or {}).get("primary") or []
    location_block = profile.get("location") or {}
    location = ", ".join(filter(None, [
        location_block.get("city"),
        location_block.get("country") or location_block.get("province"),
    ])) or "United States"

    queries: list[dict[str, str]] = []
    for role in target_roles:
        if not role:
            continue
        queries.append({"keywords": str(role), "location": location})

    # Optional override / addition from portals.yml
    if PORTALS_YML.exists():
        portals = yaml.safe_load(PORTALS_YML.read_text()) or {}
        extras = portals.get("linkedin_searches") or []
        for q in extras:
            if isinstance(q, str):
                queries.append({"keywords": q, "location": location})
            elif isinstance(q, dict) and q.get("keywords"):
                queries.append({
                    "keywords": str(q["keywords"]),
                    "location": str(q.get("location") or location),
                })

    if not queries:
        queries.append({"keywords": "Software Engineer", "location": location})
    return queries


def build_search_url(keywords: str, location: str) -> str:
    """https://www.linkedin.com/jobs/search/?keywords=…&location=…&f_TPR=r604800
       f_TPR=r604800 → past 7 days (3600 sec/hr × 24 × 7 = 604800)"""
    params = {
        "keywords": keywords,
        "location": location,
        "f_TPR": "r604800",
        "sortBy": "DD",  # date descending
    }
    return "https://www.linkedin.com/jobs/search/?" + urlencode(params)


def load_seen_urls() -> set[str]:
    """Dedup set: every URL we've ever recorded in scan-history.tsv,
    pipeline.md, or applications.md. Same shape as scan.mjs's loader."""
    seen: set[str] = set()
    if SCAN_HISTORY_TSV.exists():
        for line in SCAN_HISTORY_TSV.read_text().splitlines()[1:]:
            url = line.split("\t")[0] if "\t" in line else ""
            if url:
                seen.add(url)
    if PIPELINE_MD.exists():
        for m in re.finditer(r"- \[[ x]\] (https?://\S+)", PIPELINE_MD.read_text()):
            seen.add(m.group(1))
    if APPLICATIONS_MD.exists():
        for m in re.finditer(r"https?://[^\s|)]+", APPLICATIONS_MD.read_text()):
            seen.add(m.group(0))
    return seen


def title_filter() -> tuple[set[str], set[str]]:
    """Read positive/negative keywords from portals.yml. Empty positive
    means "match everything"; any negative match excludes."""
    if not PORTALS_YML.exists():
        return (set(), set())
    p = yaml.safe_load(PORTALS_YML.read_text()) or {}
    tf = p.get("title_filter") or {}
    pos = {str(s).lower() for s in (tf.get("positive") or [])}
    neg = {str(s).lower() for s in (tf.get("negative") or [])}
    return (pos, neg)


def passes_title_filter(title: str, pos: set[str], neg: set[str]) -> bool:
    t = title.lower()
    if neg and any(k in t for k in neg):
        return False
    if pos and not any(k in t for k in pos):
        return False
    return True


def scrape_one_query(page, keywords: str, location: str, max_pages: int) -> list[dict]:
    """Open the search URL, scroll through results, extract job cards."""
    url = build_search_url(keywords, location)
    try:
        page.goto(url, timeout=20_000, wait_until="domcontentloaded")
    except PlaywrightTimeout:
        print(f"  Timed out loading {url}", file=sys.stderr)
        return []

    # Captcha / verification check — same heuristic as linkedin-easy-apply.py
    body_text = (page.content() or "")[:5000].lower()
    if any(k in body_text for k in ("captcha", "are you a robot", "verify it's you", "let's do a quick check")):
        raise RuntimeError("LinkedIn served a captcha — session may need refresh")

    results: list[dict] = []
    seen_ids: set[str] = set()

    # Scroll the results pane to load more cards. LinkedIn infinite-scrolls
    # within `.jobs-search-results-list` (or similar selectors that change
    # over time). We try multiple known selectors.
    for page_num in range(max_pages):
        # Extract every card currently in the DOM.
        cards = page.query_selector_all('a[href*="/jobs/view/"]')
        for card in cards:
            href = card.get_attribute("href") or ""
            # Canonicalise to https://www.linkedin.com/jobs/view/{id}/
            m = re.search(r"/jobs/view/(\d+)", href)
            if not m:
                continue
            job_id = m.group(1)
            if job_id in seen_ids:
                continue
            seen_ids.add(job_id)
            # Title sits in the anchor's text or a child span
            title = (card.inner_text() or "").strip().split("\n")[0]
            # Company + location are on sibling elements; pull from the
            # closest job-card container if we can find one.
            container = card.evaluate_handle("el => el.closest('[data-occludable-job-id], li, .job-card-container')")
            company = ""
            location_text = ""
            if container:
                try:
                    el = container.as_element()
                    if el:
                        company_el = el.query_selector('.job-card-container__primary-description, .job-card-container__company-name, [data-test-job-card-list__company-name]')
                        if company_el:
                            company = (company_el.inner_text() or "").strip()
                        loc_el = el.query_selector('.job-card-container__metadata-item, [data-test-job-card-list__location]')
                        if loc_el:
                            location_text = (loc_el.inner_text() or "").strip()
                except Exception:
                    pass
            url_canon = f"https://www.linkedin.com/jobs/view/{job_id}/"
            results.append({
                "url": url_canon,
                "title": title,
                "company": company,
                "location": location_text,
                "job_id": job_id,
            })

        # Scroll to load more
        prev_height = page.evaluate("document.body.scrollHeight")
        page.mouse.wheel(0, 2000)
        time.sleep(SCROLL_PAUSE_S)
        new_height = page.evaluate("document.body.scrollHeight")
        if new_height == prev_height:
            # No more results to load.
            break
        humanize(0.4, 1.2)

    return results


def append_to_pipeline(rows: list[dict]) -> None:
    if not rows:
        return
    PIPELINE_MD.parent.mkdir(parents=True, exist_ok=True)
    text = PIPELINE_MD.read_text() if PIPELINE_MD.exists() else ""
    block_lines = [
        f"- [ ] {r['url']} | {r['company'] or '(unknown)'} | {r['title'] or '(see LinkedIn)'}"
        for r in rows
    ]
    if "## Pendientes" in text:
        # Insert after the marker, before the next ## section.
        idx = text.index("## Pendientes") + len("## Pendientes")
        next_section = text.find("\n## ", idx)
        insert_at = next_section if next_section != -1 else len(text)
        text = text[:insert_at] + "\n" + "\n".join(block_lines) + "\n" + text[insert_at:]
    else:
        text += "\n## Pendientes\n\n" + "\n".join(block_lines) + "\n\n"
    PIPELINE_MD.write_text(text)


def append_to_scan_history(rows: list[dict]) -> None:
    if not rows:
        return
    SCAN_HISTORY_TSV.parent.mkdir(parents=True, exist_ok=True)
    new_file = not SCAN_HISTORY_TSV.exists()
    today = datetime.now().strftime("%Y-%m-%d")
    with SCAN_HISTORY_TSV.open("a") as f:
        if new_file:
            f.write("url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n")
        for r in rows:
            f.write(f"{r['url']}\t{today}\t{SOURCE_LABEL}\t{r['title']}\t{r['company']}\tadded\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-pages", type=int, default=DEFAULT_MAX_PAGES)
    parser.add_argument("--query", help="Override profile-derived queries with a single keyword string")
    args = parser.parse_args()

    udd = USER_DATA_DIRS["linkedin"]
    if not udd.exists():
        print(f"ERROR: {udd} not found. Run `.venv/bin/python lib_playwright_auth.py --portal linkedin --login` first.", file=sys.stderr)
        sys.exit(2)

    queries = (
        [{"keywords": args.query, "location": ""}]
        if args.query else load_search_queries()
    )
    pos, neg = title_filter()
    seen = load_seen_urls()
    new_rows: list[dict] = []
    total_found = 0
    total_filtered = 0
    total_dupes = 0

    print(f"LinkedIn auth-scrape — {len(queries)} querie(s) × up to {args.max_pages} pages each", file=sys.stderr)

    with launch_persistent("linkedin", headed=False) as ctx:
        page = ctx.new_page()

        # Bail early if session expired — surfaces a clear error to /sources.
        if not is_logged_in_linkedin(page):
            print("ERROR: LinkedIn session expired. Click Reconnect on /sources.", file=sys.stderr)
            sys.exit(3)

        for q in queries:
            print(f"  → '{q['keywords']}' in '{q['location']}'", file=sys.stderr)
            try:
                hits = scrape_one_query(page, q["keywords"], q["location"], args.max_pages)
            except RuntimeError as e:
                print(f"  ! {e}", file=sys.stderr)
                # Captcha: stop the whole run rather than churn through the
                # remaining queries and burn the session further.
                break
            total_found += len(hits)
            for r in hits:
                if not passes_title_filter(r["title"], pos, neg):
                    total_filtered += 1
                    continue
                if r["url"] in seen:
                    total_dupes += 1
                    continue
                seen.add(r["url"])
                new_rows.append(r)
            humanize(2.0, 5.0)

    print("", file=sys.stderr)
    print(f"Found:    {total_found}", file=sys.stderr)
    print(f"Filtered: {total_filtered}", file=sys.stderr)
    print(f"Duplicates: {total_dupes}", file=sys.stderr)
    print(f"New offers: {len(new_rows)}", file=sys.stderr)
    # Stdout summary line — orchestrator parses this.
    print(f"Total jobs found: {len(new_rows)}")

    if not args.dry_run and new_rows:
        append_to_pipeline(new_rows)
        append_to_scan_history(new_rows)
        print(f"Wrote {len(new_rows)} rows to pipeline.md + scan-history.tsv", file=sys.stderr)


if __name__ == "__main__":
    main()
