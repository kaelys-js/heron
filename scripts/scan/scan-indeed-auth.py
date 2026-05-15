#!/usr/bin/env python3
"""
scan-indeed-auth.py — Authenticated Indeed Jobs scrape.

Mirror of scan-linkedin-auth.py for Indeed. Uses the persistent
Playwright session at .playwright-indeed/.

Indeed-specific tweaks:
  - URL pattern: /jobs?q=…&l=…&start=N
  - Pagination via &start=10,20,30,… up to 100 page-equivalents (~1000 jobs)
  - Heavier captcha frequency than LinkedIn — script bails on first
    captcha and surfaces it as a clean error so /sources can prompt the
    user to refresh the session

USAGE
-----

  .venv/bin/python scan-indeed-auth.py
  .venv/bin/python scan-indeed-auth.py --dry-run
  .venv/bin/python scan-indeed-auth.py --max-pages 5
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode

try:
    from playwright.sync_api import TimeoutError as PlaywrightTimeout
except ImportError:
    print("ERROR: playwright not installed.", file=sys.stderr)
    sys.exit(1)

try:
    import yaml
except ImportError:
    print("ERROR: pyyaml not installed.", file=sys.stderr)
    sys.exit(1)

from lib_playwright_auth import (
    launch_persistent,
    is_logged_in_indeed,
    humanize,
    USER_DATA_DIRS,
)

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent.parent  # scripts/<domain>/ → repo/
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))
from lib_profiles import resolve_profile_arg, profile_path, ensure_profile_dirs

# Placeholders — set in main() once --profile is resolved.
PROFILE_YML: Path = REPO_ROOT / "data" / "profiles" / "default" / "profile.yml"
PORTALS_YML: Path = REPO_ROOT / "data" / "profiles" / "default" / "portals.yml"
PIPELINE_MD: Path = REPO_ROOT / "data" / "profiles" / "default" / "pipeline.md"
APPLICATIONS_MD: Path = REPO_ROOT / "data" / "profiles" / "default" / "applications.md"
SCAN_HISTORY_TSV: Path = REPO_ROOT / "data" / "profiles" / "default" / "scan-history.tsv"

DEFAULT_MAX_PAGES = 10  # 10 pages × 15 jobs/page ≈ 150 jobs per query
SCROLL_PAUSE_S = 1.0
SOURCE_LABEL = "indeed-authenticated"


def load_search_queries() -> list[dict[str, str]]:
    if not PROFILE_YML.exists():
        print(f"ERROR: {PROFILE_YML} missing.", file=sys.stderr)
        sys.exit(2)
    profile = yaml.safe_load(PROFILE_YML.read_text()) or {}
    target_roles = (profile.get("target_roles") or {}).get("primary") or []
    location_block = profile.get("location") or {}
    location = (
        ", ".join(
            filter(
                None,
                [
                    location_block.get("city"),
                    location_block.get("country") or location_block.get("province"),
                ],
            )
        )
        or "United States"
    )

    queries: list[dict[str, str]] = []
    for role in target_roles:
        if not role:
            continue
        queries.append({"q": str(role), "l": location})

    if PORTALS_YML.exists():
        portals = yaml.safe_load(PORTALS_YML.read_text()) or {}
        extras = portals.get("indeed_searches") or []
        for q in extras:
            if isinstance(q, str):
                queries.append({"q": q, "l": location})
            elif isinstance(q, dict) and q.get("q"):
                queries.append(
                    {
                        "q": str(q["q"]),
                        "l": str(q.get("l") or location),
                    }
                )

    if not queries:
        queries.append({"q": "Software Engineer", "l": location})
    return queries


def build_search_url(q: str, l: str, start: int = 0) -> str:
    params = {"q": q, "l": l, "fromage": 7, "sort": "date"}
    if start > 0:
        params["start"] = start
    return "https://www.indeed.com/jobs?" + urlencode(params)


def load_seen_urls() -> set[str]:
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


def scrape_one_query(page, q: str, l: str, max_pages: int) -> list[dict]:
    """Indeed paginates via &start=N (10 jobs/page)."""
    results: list[dict] = []
    seen_jks: set[str] = set()

    for page_num in range(max_pages):
        start = page_num * 10
        url = build_search_url(q, l, start)
        try:
            page.goto(url, timeout=20_000, wait_until="domcontentloaded")
        except PlaywrightTimeout:
            print(f"  Timed out on page {page_num + 1}", file=sys.stderr)
            break

        # Captcha check — Indeed shows interstitials with these phrases.
        body = (page.content() or "")[:5000].lower()
        if any(
            k in body
            for k in (
                "additional verification required",
                "let's confirm you're a human",
                "press & hold",  # Indeed's classic press-and-hold captcha
                "are you a robot",
                "captcha",
            )
        ):
            raise RuntimeError("Indeed served a captcha — session may need refresh")

        # Each result card has a unique data-jk attribute = job key.
        cards = page.query_selector_all('a[data-jk], [data-testid="jobTitle"]')
        new_on_page = 0
        for card in cards:
            jk = card.get_attribute("data-jk")
            if not jk:
                # Fallback: walk up looking for a parent with data-jk
                handle = card.evaluate_handle("el => el.closest('[data-jk]')")
                el = handle.as_element() if handle else None
                if el:
                    jk = el.get_attribute("data-jk")
            if not jk or jk in seen_jks:
                continue
            seen_jks.add(jk)
            new_on_page += 1
            title = (card.inner_text() or "").strip().split("\n")[0]
            url_canon = f"https://www.indeed.com/viewjob?jk={jk}"
            # Company + location on adjacent elements
            company = ""
            location_text = ""
            try:
                container = card.evaluate_handle("el => el.closest('[data-jk]')")
                el = container.as_element() if container else None
                if el:
                    c = el.query_selector('[data-testid="company-name"], .companyName')
                    if c:
                        company = (c.inner_text() or "").strip()
                    loc = el.query_selector('[data-testid="text-location"], .companyLocation')
                    if loc:
                        location_text = (loc.inner_text() or "").strip()
            except Exception:
                pass
            results.append(
                {
                    "url": url_canon,
                    "title": title,
                    "company": company,
                    "location": location_text,
                    "jk": jk,
                }
            )

        if new_on_page == 0:
            # No new cards on this page — we've exhausted results.
            break

        humanize(0.8, 2.0)

    return results


def append_to_pipeline(rows: list[dict]) -> None:
    if not rows:
        return
    PIPELINE_MD.parent.mkdir(parents=True, exist_ok=True)
    text = PIPELINE_MD.read_text() if PIPELINE_MD.exists() else ""
    block_lines = [
        f"- [ ] {r['url']} | {r['company'] or '(unknown)'} | {r['title'] or '(see Indeed)'}"
        for r in rows
    ]
    if "## Pendientes" in text:
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
    global PROFILE_YML, PORTALS_YML, PIPELINE_MD, APPLICATIONS_MD, SCAN_HISTORY_TSV
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-pages", type=int, default=DEFAULT_MAX_PAGES)
    parser.add_argument("--query", help="Single keyword override")
    parser.add_argument(
        "--profile",
        default=None,
        help="Profile slug (defaults to active profile in data/profiles.json).",
    )
    args = parser.parse_args()

    profile_id = resolve_profile_arg(args.profile)
    ensure_profile_dirs(profile_id)
    PROFILE_YML = profile_path(profile_id, "profile-yml")
    PORTALS_YML = profile_path(profile_id, "portals-yml")
    PIPELINE_MD = profile_path(profile_id, "pipeline")
    APPLICATIONS_MD = profile_path(profile_id, "applications")
    SCAN_HISTORY_TSV = profile_path(profile_id, "scan-history")

    udd = USER_DATA_DIRS["indeed"]
    if not udd.exists():
        print(
            f"ERROR: {udd} not found. Run `.venv/bin/python lib_playwright_auth.py --portal indeed --login` first.",
            file=sys.stderr,
        )
        sys.exit(2)

    queries = [{"q": args.query, "l": ""}] if args.query else load_search_queries()
    pos, neg = title_filter()
    seen = load_seen_urls()
    new_rows: list[dict] = []
    total_found = 0
    total_filtered = 0
    total_dupes = 0

    print(
        f"Indeed auth-scrape — {len(queries)} querie(s) × up to {args.max_pages} pages each",
        file=sys.stderr,
    )

    with launch_persistent("indeed", headed=False) as ctx:
        page = ctx.new_page()
        if not is_logged_in_indeed(page):
            print(
                "ERROR: Indeed session expired. Click Reconnect on /sources.",
                file=sys.stderr,
            )
            sys.exit(3)

        for q in queries:
            print(f"  → '{q['q']}' in '{q['l']}'", file=sys.stderr)
            try:
                hits = scrape_one_query(page, q["q"], q["l"], args.max_pages)
            except RuntimeError as e:
                print(f"  ! {e}", file=sys.stderr)
                # Captcha → bail on the rest of the queries; tomorrow's run
                # will retry (and the user can manually refresh on /sources).
                sys.exit(4)
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
    print(f"Total jobs found: {len(new_rows)}")  # parsed by orchestrator

    if not args.dry_run and new_rows:
        append_to_pipeline(new_rows)
        append_to_scan_history(new_rows)
        print(
            f"Wrote {len(new_rows)} rows to pipeline.md + scan-history.tsv",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
