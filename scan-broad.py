#!/usr/bin/env python3
"""
scan-broad.py — broad multi-source job scanner for career-ops.

Sources (all configurable, env-gated where credentials are needed):
  1. JobSpy → LinkedIn, Indeed, Glassdoor, ZipRecruiter, Google Jobs
  2. The Muse              (free, no key)
  3. Adzuna                (env-gated: ADZUNA_APP_ID + ADZUNA_APP_KEY)
  4. HN "Who's Hiring"     (free RSS via hnrss.org)
  5. RemoteOK              (free, public JSON API)
  6. We Work Remotely      (free, RSS feeds)
  7. YC Work at a Startup  (free, Algolia public-search keys)

Output: appends new (deduped) jobs to data/pipeline.md in the same format as
scan.mjs, and records URLs in data/scan-history.tsv to prevent re-finds.

Run from the career-ops root via:
    .venv/bin/python scan-broad.py
    .venv/bin/python scan-broad.py --only remoteok,wwr     # subset of sources
    .venv/bin/python scan-broad.py --skip jobspy           # skip the slow one
"""

import os
import sys
import json
import argparse
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode, quote
from xml.etree import ElementTree as ET

try:
    from jobspy import scrape_jobs  # type: ignore
    JOBSPY_OK = True
except ImportError:
    scrape_jobs = None  # type: ignore
    JOBSPY_OK = False

ROOT = Path(__file__).parent

# PIPELINE and HISTORY are now per-profile — set inside main() once we
# know which profile this run targets (parse_args resolves --profile).
PIPELINE: Path = ROOT / "data" / "pipeline.md"  # placeholder; overridden in main()
HISTORY: Path = ROOT / "data" / "scan-history.tsv"

from lib_profiles import resolve_profile_arg, profile_path, ensure_profile_dirs

# ----- Cole's search profiles -----
# results_wanted is per (search, source) combination — JobSpy fans out to
# LinkedIn / Indeed / Glassdoor / ZipRecruiter / Google Jobs internally.
# Higher numbers fetch more from each source but trip rate limits on
# LinkedIn/Indeed sooner. 200 per source × 5 sources × 10 searches =
# 10K listings ceiling per run; the title-drop filter discards >80% so
# the actual writes to pipeline.md are an order of magnitude smaller.
RESULTS_WANTED_DEFAULT = 200
SEARCHES = [
    {"term": "Senior Software Engineer TypeScript", "location": "Vancouver, BC, Canada",
     "is_remote": False, "results_wanted": RESULTS_WANTED_DEFAULT, "country_indeed": "Canada"},
    {"term": "Senior Full-Stack Engineer", "location": "Vancouver, BC, Canada",
     "is_remote": False, "results_wanted": RESULTS_WANTED_DEFAULT, "country_indeed": "Canada"},
    {"term": "Senior Software Engineer TypeScript Remote", "location": "Canada",
     "is_remote": True, "results_wanted": RESULTS_WANTED_DEFAULT, "country_indeed": "Canada"},
    {"term": "Senior Software Engineer TypeScript", "location": "United States",
     "is_remote": True, "results_wanted": RESULTS_WANTED_DEFAULT, "country_indeed": "USA"},
    {"term": "Senior Full-Stack Engineer Node React", "location": "United States",
     "is_remote": True, "results_wanted": RESULTS_WANTED_DEFAULT, "country_indeed": "USA"},
    {"term": "Senior Backend Engineer Node.js", "location": "United States",
     "is_remote": True, "results_wanted": RESULTS_WANTED_DEFAULT, "country_indeed": "USA"},
    {"term": "Senior Frontend Engineer React TypeScript", "location": "United States",
     "is_remote": True, "results_wanted": RESULTS_WANTED_DEFAULT, "country_indeed": "USA"},
    {"term": "Senior Platform Engineer", "location": "United States",
     "is_remote": True, "results_wanted": RESULTS_WANTED_DEFAULT, "country_indeed": "USA"},
    {"term": "Cloudflare Workers Engineer", "location": "United States",
     "is_remote": True, "results_wanted": RESULTS_WANTED_DEFAULT, "country_indeed": "USA"},
    {"term": "Founding Engineer TypeScript", "location": "United States",
     "is_remote": True, "results_wanted": RESULTS_WANTED_DEFAULT, "country_indeed": "USA"},
]

# ----- Title filtering (mirrors portals.yml) -----
TITLE_DROP = [
    # Management (Cole is Senior IC)
    "engineering manager", "director of engineering", "head of engineering",
    "vp engineering", "vp of engineering", "chief engineering",
    # Sales-adjacent / non-IC
    "solutions architect", "solutions engineer", "forward deployed",
    "customer engineer", "field engineer", "field cto", "field architect",
    "account executive", "account manager", "sales engineer",
    "customer success", "support engineer", "recruiter", "talent",
    "marketing", "growth marketing",
    # Off-stack
    "machine learning engineer", "ml engineer", "research engineer",
    "applied scientist", "data scientist", "research scientist",
    "ios engineer", "android engineer", "ios developer", "android developer",
    "mobile engineer", "kotlin", "swift engineer",
    "embedded", "firmware", "fpga", "asic", "hardware",
    "blockchain", "web3", "crypto", "solana", "solidity",
    "game developer", "game engineer", "unity", "unreal",
    ".net", "c# ", "java engineer", "java developer",
    "salesforce", "sap ", "oracle", "mainframe", "cobol",
    "php developer", "ruby on rails", "rails developer",
    # BG/clearance hard-stops
    "security clearance", "ts/sci", "top secret", "polygraph",
    "background investigation", "clean background", "vulnerable sector",
    "dod ", "federal contractor", "defense contractor", "intelligence community",
    # Wrong seniority
    "junior", "intern", "internship", "apprentice",
    "graduate", "entry level", "entry-level", "associate engineer",
]


def title_ok(title: str) -> bool:
    t = (title or "").lower()
    return not any(pat in t for pat in TITLE_DROP)


def load_history() -> set:
    if HISTORY.exists():
        urls = set()
        for line in HISTORY.read_text().splitlines():
            if "\t" in line:
                urls.add(line.split("\t", 1)[0].strip())
        return urls
    return set()


def append_history(rows):
    HISTORY.parent.mkdir(parents=True, exist_ok=True)
    with HISTORY.open("a") as f:
        for url in rows:
            f.write(f"{url}\tjobspy\n")


def append_pipeline(rows):
    PIPELINE.parent.mkdir(parents=True, exist_ok=True)
    if not PIPELINE.exists():
        PIPELINE.write_text("# Pipeline Inbox\n\n")
    from datetime import date
    with PIPELINE.open("a") as f:
        f.write(f"\n## scan-broad ({date.today().isoformat()}, {len(rows)} new)\n\n")
        for url, company, title, location in rows:
            f.write(f"- [ ] {url} | {company} | {title} | {location}\n")


# ----- Additional free sources -----

THE_MUSE_BASE = "https://www.themuse.com/api/public/jobs"
ADZUNA_BASE = "https://api.adzuna.com/v1/api/jobs"
HN_RSS_BASE = "https://hnrss.org/jobs?q="
REMOTEOK_BASE = "https://remoteok.com/api"
WWR_FEEDS = [
    "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss",
]


def fetch_themuse(seen: set):
    """The Muse public API — curated tech jobs, no key needed."""
    new = []
    cats = ["Software Engineer", "Software Engineering"]
    levels = ["Senior Level"]
    for page in range(1, 6):  # ~80 results
        params = {
            "category": cats[0],
            "level": levels[0],
            "page": page,
        }
        try:
            req = Request(f"{THE_MUSE_BASE}?{urlencode(params)}",
                          headers={"User-Agent": "Mozilla/5.0 career-ops"})
            with urlopen(req, timeout=15) as r:
                data = json.loads(r.read())
            for j in data.get("results", []):
                url = (j.get("refs") or {}).get("landing_page", "").strip()
                title = j.get("name", "").strip()
                company = (j.get("company") or {}).get("name", "").strip()
                locs = j.get("locations") or []
                loc = locs[0].get("name", "") if locs else ""
                if not url or url in seen or not title_ok(title):
                    continue
                seen.add(url)
                new.append((url, company, title, loc))
        except Exception as e:
            print(f"  [The Muse error pg{page}]: {type(e).__name__}: {str(e)[:80]}", file=sys.stderr)
            break
    return new


def fetch_adzuna(seen: set):
    """Adzuna API — aggregator, requires free app_id + app_key.
    Set ADZUNA_APP_ID and ADZUNA_APP_KEY env vars (or in .env).
    Sign up: https://developer.adzuna.com/
    """
    app_id = os.environ.get("ADZUNA_APP_ID")
    app_key = os.environ.get("ADZUNA_APP_KEY")
    if not app_id or not app_key:
        print("  [Adzuna] skipped (set ADZUNA_APP_ID + ADZUNA_APP_KEY env vars to enable)")
        return []
    new = []
    queries = [
        ("ca", "Senior Software Engineer TypeScript"),
        ("us", "Senior Software Engineer TypeScript"),
        ("us", "Senior Full-Stack Engineer Node React"),
        ("ca", "Senior Full-Stack Engineer"),
    ]
    for country, query in queries:
        for page in range(1, 4):  # ~150 results per query
            params = {
                "app_id": app_id,
                "app_key": app_key,
                "results_per_page": 50,
                "what": query,
                "content-type": "application/json",
            }
            try:
                req = Request(f"{ADZUNA_BASE}/{country}/search/{page}?{urlencode(params)}",
                              headers={"User-Agent": "Mozilla/5.0 career-ops"})
                with urlopen(req, timeout=15) as r:
                    data = json.loads(r.read())
                for j in data.get("results", []):
                    url = j.get("redirect_url", "").strip()
                    title = j.get("title", "").strip()
                    company = (j.get("company") or {}).get("display_name", "").strip()
                    loc = (j.get("location") or {}).get("display_name", "").strip()
                    if not url or url in seen or not title_ok(title):
                        continue
                    seen.add(url)
                    new.append((url, company, title, loc))
            except Exception as e:
                print(f"  [Adzuna error {country}/{query[:20]}/pg{page}]: {type(e).__name__}: {str(e)[:80]}", file=sys.stderr)
                break
    return new


def fetch_hn_hiring(seen: set):
    """Hacker News Who's Hiring via hnrss.org RSS feed — free, no key."""
    new = []
    queries = [
        "Senior+TypeScript+Remote",
        "Senior+Full-Stack+Remote",
        "Senior+Backend+Node+Remote",
        "Senior+React+Remote",
        "Senior+Cloudflare+Remote",
        "Founding+Engineer+TypeScript",
    ]
    for q in queries:
        try:
            req = Request(f"{HN_RSS_BASE}{q}",
                          headers={"User-Agent": "Mozilla/5.0 career-ops"})
            with urlopen(req, timeout=15) as r:
                xml_data = r.read()
            root = ET.fromstring(xml_data)
            for item in root.iter("item"):
                title_el = item.find("title")
                link_el = item.find("link")
                desc_el = item.find("description")
                if title_el is None or link_el is None:
                    continue
                title = (title_el.text or "").strip()
                url = (link_el.text or "").strip()
                if not url or url in seen:
                    continue
                # HN posts use first line as company; title contains role
                company = "HN Who's Hiring"
                # Try to detect "Junior", "Intern" early-out
                if not title_ok(title):
                    continue
                seen.add(url)
                new.append((url, company, title, ""))
        except Exception as e:
            print(f"  [HN RSS error {q}]: {type(e).__name__}: {str(e)[:80]}", file=sys.stderr)
            continue
    return new


def fetch_remoteok(seen: set):
    """RemoteOK public JSON API — single endpoint with all jobs.
    https://remoteok.com/api  (first element is metadata, rest are jobs)
    """
    new = []
    try:
        req = Request(REMOTEOK_BASE,
                      headers={"User-Agent": "Mozilla/5.0 career-ops"})
        with urlopen(req, timeout=20) as r:
            data = json.loads(r.read())
    except Exception as e:
        print(f"  [RemoteOK error]: {type(e).__name__}: {str(e)[:80]}", file=sys.stderr)
        return []

    if not isinstance(data, list) or len(data) < 2:
        return []

    # First element is metadata; rest are jobs
    keep_tags = {"typescript", "javascript", "node", "react", "full-stack", "fullstack",
                 "backend", "frontend", "front-end", "back-end", "senior", "engineer"}
    drop_tags = {"junior", "intern", "internship", "kotlin", "swift", "ios", "android",
                 "rails", "ruby", "php", "java", "blockchain", "web3", "crypto",
                 "solidity", "ethereum"}

    for j in data[1:]:
        if not isinstance(j, dict):
            continue
        url = (j.get("url") or j.get("apply_url") or "").strip()
        title = (j.get("position") or j.get("title") or "").strip()
        company = (j.get("company") or "").strip()
        loc = (j.get("location") or "Remote").strip()
        tags = set((j.get("tags") or []))
        tags = {t.lower() for t in tags if isinstance(t, str)}

        if not url or not title or url in seen:
            continue
        if not title_ok(title):
            continue
        if tags & drop_tags:
            continue
        # Prefer roles with at least one signal tag, OR senior + engineering keyword in title
        title_lower = title.lower()
        has_signal = bool(tags & keep_tags) or (
            "senior" in title_lower and ("engineer" in title_lower or "developer" in title_lower)
        )
        if not has_signal:
            continue

        seen.add(url)
        new.append((url, company, title, loc))
    return new


def fetch_wwr(seen: set):
    """We Work Remotely RSS feeds — multiple programming categories."""
    new = []
    for feed_url in WWR_FEEDS:
        try:
            req = Request(feed_url, headers={"User-Agent": "Mozilla/5.0 career-ops"})
            with urlopen(req, timeout=15) as r:
                xml_data = r.read()
            root = ET.fromstring(xml_data)
            for item in root.iter("item"):
                title_el = item.find("title")
                link_el = item.find("link")
                if title_el is None or link_el is None:
                    continue
                raw_title = (title_el.text or "").strip()
                url = (link_el.text or "").strip()
                if not url or url in seen:
                    continue
                # WWR titles look like "Company: Senior Engineer (Remote)"
                if ":" in raw_title:
                    company, role = raw_title.split(":", 1)
                    company = company.strip()
                    role = role.strip()
                else:
                    company, role = "WeWorkRemotely", raw_title
                if not title_ok(role):
                    continue
                # Filter out roles that don't match Cole's senior IC TypeScript profile
                role_lower = role.lower()
                if not any(kw in role_lower for kw in ["senior", "staff", "principal", "lead", "founding"]):
                    continue
                if not any(kw in role_lower for kw in ["engineer", "developer", "full-stack", "fullstack",
                                                       "backend", "frontend", "back-end", "front-end",
                                                       "typescript", "javascript", "node", "react"]):
                    continue
                seen.add(url)
                new.append((url, company, role, "Remote"))
        except Exception as e:
            short_feed = feed_url.split("/")[-1]
            print(f"  [WWR error {short_feed}]: {type(e).__name__}: {str(e)[:80]}", file=sys.stderr)
            continue
    return new


def fetch_jobspy(seen: set):
    """Multi-board scrape via python-jobspy: linkedin/indeed/glassdoor/zip/google."""
    if not JOBSPY_OK:
        print("  [jobspy not installed — pip install python-jobspy to enable]", file=sys.stderr)
        return []
    new = []
    sites = ["linkedin", "indeed", "glassdoor", "zip_recruiter", "google"]
    for i, s in enumerate(SEARCHES, 1):
        label = f"  [{i:2d}/{len(SEARCHES)}] {s['term'][:46]:46s} @ {s['location'][:22]:22s}"
        try:
            df = scrape_jobs(
                site_name=sites,
                search_term=s["term"],
                location=s["location"],
                is_remote=s.get("is_remote", False),
                results_wanted=s.get("results_wanted", 30),
                hours_old=168,
                country_indeed=s.get("country_indeed", "USA"),
                description_format="markdown",
                verbose=0,
            )
            added = 0
            for _, row in df.iterrows():
                url = str(row.get("job_url", "") or "").strip()
                title = str(row.get("title", "") or "").strip()
                company = str(row.get("company", "") or "").strip()
                loc = str(row.get("location", "") or "").strip()
                if not url or url in seen or not title_ok(title):
                    continue
                seen.add(url)
                new.append((url, company, title, loc))
                added += 1
            print(f"{label}  +{added:3d} new (raw: {len(df)})")
        except Exception as e:
            print(f"{label}  [error] {type(e).__name__}: {str(e)[:80]}", file=sys.stderr)
            continue
    return new


# ----- Source registry -----

SOURCES = {
    "jobspy":   ("JobSpy (LI/Indeed/Glassdoor/Zip/Google)", fetch_jobspy),
    "themuse":  ("The Muse",                                fetch_themuse),
    "adzuna":   ("Adzuna",                                  fetch_adzuna),
    "hn":       ("HN Who's Hiring",                         fetch_hn_hiring),
    "remoteok": ("RemoteOK",                                fetch_remoteok),
    "wwr":      ("We Work Remotely",                        fetch_wwr),
}


def parse_args():
    ap = argparse.ArgumentParser(description="Broad multi-source job scanner")
    ap.add_argument("--only", help="Comma-separated source ids to run (default: all). Choices: " + ", ".join(SOURCES.keys()))
    ap.add_argument("--skip", help="Comma-separated source ids to skip")
    ap.add_argument("--profile", default=None,
                    help="Profile slug (defaults to active profile in data/profiles.json).")
    return ap.parse_args()


def main():
    global PIPELINE, HISTORY
    args = parse_args()
    profile_id = resolve_profile_arg(args.profile)
    ensure_profile_dirs(profile_id)
    PIPELINE = profile_path(profile_id, "pipeline")
    HISTORY = profile_path(profile_id, "scan-history")

    selected = list(SOURCES.keys())
    if args.only:
        wanted = {s.strip() for s in args.only.split(",") if s.strip()}
        unknown = wanted - SOURCES.keys()
        if unknown:
            print(f"ERROR: unknown source(s): {', '.join(sorted(unknown))}", file=sys.stderr)
            sys.exit(2)
        selected = [s for s in selected if s in wanted]
    if args.skip:
        skip = {s.strip() for s in args.skip.split(",") if s.strip()}
        selected = [s for s in selected if s not in skip]

    print(f"career-ops scan-broad — running {len(selected)}/{len(SOURCES)} sources: {', '.join(selected)}")
    print(f"  pipeline: {PIPELINE}")
    print(f"  history:  {HISTORY}")
    seen = load_history()
    print(f"  history dedup: {len(seen):,} URLs already known\n")

    new_rows = []
    counts = {}
    timings = {}

    for src in selected:
        label, fn = SOURCES[src]
        print(f"--- {src}: {label} ---")
        t0 = time.time()
        try:
            rows = fn(seen)
        except Exception as e:
            print(f"  [{src} fatal]: {type(e).__name__}: {str(e)[:120]}", file=sys.stderr)
            rows = []
        elapsed = time.time() - t0
        counts[src] = len(rows)
        timings[src] = elapsed
        new_rows.extend(rows)
        print(f"  → +{len(rows)} new in {elapsed:.1f}s\n")

    print("=" * 60)
    print(f"Per-source totals:")
    for src in selected:
        print(f"  {src:10s}  {counts.get(src, 0):4d} new  ({timings.get(src, 0):4.1f}s)")
    print(f"  {'TOTAL':10s}  {len(new_rows):4d} new")
    print("=" * 60)

    if not new_rows:
        print("\nNo new jobs found.")
        return

    append_pipeline(new_rows)
    append_history([r[0] for r in new_rows])
    print(f"\nAppended to {PIPELINE.name} and {HISTORY.name}.")
    print("Next: review pipeline rows, then run gemini first-pass.")


if __name__ == "__main__":
    main()
