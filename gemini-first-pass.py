#!/usr/bin/env python3
"""
gemini-first-pass.py — fast, free first-pass scoring via Gemini Flash.

Reads data/pipeline.md (all pending jobs), scores each based on title +
company + location vs cv.md and config/profile.yml. Outputs ranked list to
data/gemini-scores.tsv. Top N flow into the Claude deep-eval pipeline.

Why title-based first-pass:
  - Free (Gemini's 1M tokens/day free tier)
  - Fast (~30 sec for 850 jobs in batches)
  - Title+company is 80% of the signal at first-pass
  - Claude finalist phase reads full JD on the top 30 only

Usage:
  # Set the Gemini API key (free at https://aistudio.google.com/apikey)
  export GEMINI_API_KEY=your_key

  # Run
  .venv/bin/python gemini-first-pass.py

  # Top N output
  .venv/bin/python gemini-first-pass.py --top 30
"""

import os
import sys
import re
import json
import time
import argparse
from pathlib import Path

try:
    import google.generativeai as genai
except ImportError:
    print("ERROR: google-generativeai not installed.\n  .venv/bin/pip install google-generativeai")
    sys.exit(1)


ROOT = Path(__file__).parent
from lib_profiles import resolve_profile_arg, profile_path, ensure_profile_dirs

# Per-profile; set in main() after --profile is resolved. Placeholders so
# module-level imports + type-checkers don't choke.
PIPELINE: Path = ROOT / "data" / "profiles" / "default" / "pipeline.md"
SCORES_TSV: Path = ROOT / "data" / "profiles" / "default" / "gemini-scores.tsv"
CV_MD: Path = ROOT / "data" / "profiles" / "default" / "cv.md"

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("ERROR: GEMINI_API_KEY env var not set.")
    print("Get a free key at: https://aistudio.google.com/apikey")
    print("Then: export GEMINI_API_KEY=your_key")
    sys.exit(1)

genai.configure(api_key=API_KEY)
MODEL = genai.GenerativeModel("gemini-2.0-flash")  # free tier


SYSTEM_PROMPT = """You are scoring job postings for fit against a candidate's profile.

CANDIDATE PROFILE (from cv.md):
{cv_summary}

ARCHETYPES the candidate is targeting (best-fit roles):
- Senior Full-Stack Engineer (TypeScript / React / Node)
- Senior Backend Engineer (Node.js / TS)
- Senior Frontend Engineer (React / TS)
- Senior Platform / Cloud Engineer (AWS / GCP / Cloudflare)
- Senior Edge / Cloudflare Workers Engineer (specialty)
- Tech Lead (hands-on IC, no people-management overhead)

Adjacent fits (still good if at the right company):
- Developer Experience / DX Engineer
- AI Dev Tools companies (Anthropic, Cursor, Sourcegraph, Continue, Vercel, etc.) — Cole is a daily Claude Code user
- Privacy / Compliance engineering (deep Enzuzo experience)

HARD STOPS (score 1.0):
- Defense / intelligence / government clearance work
- Roles requiring TS/SCI / Top Secret / Polygraph / Vulnerable Sector check

NEGATIVE FACTORS (score 1-3):
- Engineering Manager / Director / VP titles (Cole is IC focused)
- Sales-adjacent: Solutions Architect, Solutions Engineer, Forward Deployed, Customer Engineer
- Off-stack: ML Engineer, Research Scientist, iOS, Android, .NET, Java, PHP, Embedded
- Junior, Intern, Graduate, Associate

TASK: For each job below, output a JSON line per job with:
  - score: 1-10 (10 = perfect fit, 1 = hard reject)
  - reason: 1 short sentence

Output FORMAT (one JSON object per line, no markdown wrappers):
{{"id": <int>, "score": <number>, "reason": "<one short sentence>"}}

JOBS TO SCORE:
"""


def load_cv_summary():
    """Read cv.md, return first 3K characters (enough to convey profile)."""
    if not CV_MD.exists():
        return "Senior full-stack engineer, TypeScript / React / Node.js / AWS / GCP / Cloudflare, 10+ years."
    text = CV_MD.read_text()
    return text[:3000]


def parse_pipeline():
    """Extract all pending jobs from pipeline.md.
    Returns list of dicts: {id, url, company, role, location}.
    """
    if not PIPELINE.exists():
        return []
    rows = []
    line_pat = re.compile(r"^- \[ \] (https?://\S+)\s*\|\s*(.*?)\s*\|\s*(.*?)(?:\s*\|\s*(.*?))?$")
    for i, line in enumerate(PIPELINE.read_text().splitlines()):
        m = line_pat.match(line.strip())
        if not m:
            continue
        rows.append({
            "id": len(rows) + 1,
            "url": m.group(1).strip(),
            "company": m.group(2).strip(),
            "role": m.group(3).strip(),
            "location": (m.group(4) or "").strip(),
        })
    return rows


def score_batch(jobs_batch, cv_summary):
    """Send a batch of jobs to Gemini, return list of {id, score, reason}."""
    job_lines = []
    for j in jobs_batch:
        job_lines.append(f"id={j['id']} | company: {j['company']} | role: {j['role']} | location: {j['location']}")
    payload = SYSTEM_PROMPT.format(cv_summary=cv_summary) + "\n".join(job_lines)

    try:
        resp = MODEL.generate_content(payload)
        text = resp.text or ""
        results = []
        for line in text.splitlines():
            line = line.strip()
            if not line or not line.startswith("{"):
                continue
            try:
                obj = json.loads(line)
                if "id" in obj and "score" in obj:
                    results.append(obj)
            except Exception:
                continue
        return results
    except Exception as e:
        print(f"  [batch error] {type(e).__name__}: {str(e)[:120]}", file=sys.stderr)
        return []


def main():
    global PIPELINE, SCORES_TSV, CV_MD
    parser = argparse.ArgumentParser()
    parser.add_argument("--top", type=int, default=30, help="Top N to print at end")
    parser.add_argument("--batch-size", type=int, default=40, help="Jobs per Gemini request")
    parser.add_argument("--delay", type=float, default=1.5, help="Sec between batches (rate limit)")
    parser.add_argument("--profile", default=None,
                        help="Profile slug (defaults to active profile in data/profiles.json).")
    args = parser.parse_args()

    profile_id = resolve_profile_arg(args.profile)
    ensure_profile_dirs(profile_id)
    PIPELINE = profile_path(profile_id, "pipeline")
    SCORES_TSV = profile_path(profile_id, "gemini-scores")
    CV_MD = profile_path(profile_id, "cv-md")

    jobs = parse_pipeline()
    print(f"Loaded {len(jobs)} pending jobs from {PIPELINE.name}")
    if not jobs:
        print("No pending jobs to score.")
        return

    cv_summary = load_cv_summary()
    print(f"CV summary: {len(cv_summary)} chars\n")

    all_scores = {}  # id -> {score, reason}
    batches = [jobs[i:i + args.batch_size] for i in range(0, len(jobs), args.batch_size)]
    print(f"Scoring in {len(batches)} batches of {args.batch_size}\n")

    for bi, batch in enumerate(batches, 1):
        print(f"[batch {bi:3d}/{len(batches)}] sending {len(batch)} jobs...", end=" ", flush=True)
        results = score_batch(batch, cv_summary)
        for r in results:
            all_scores[r["id"]] = {"score": r["score"], "reason": r.get("reason", "")}
        print(f"got {len(results)}/{len(batch)} scores")
        time.sleep(args.delay)

    # Write TSV
    SCORES_TSV.parent.mkdir(parents=True, exist_ok=True)
    with SCORES_TSV.open("w") as f:
        f.write("id\tscore\turl\tcompany\trole\tlocation\treason\n")
        for j in jobs:
            s = all_scores.get(j["id"], {"score": "", "reason": "(no score)"})
            f.write(f"{j['id']}\t{s['score']}\t{j['url']}\t{j['company']}\t{j['role']}\t{j['location']}\t{s['reason']}\n")
    print(f"\nWrote {SCORES_TSV}")

    # Print top N
    ranked = sorted(
        [(all_scores.get(j["id"], {"score": 0})["score"] or 0, j, all_scores.get(j["id"], {})) for j in jobs],
        key=lambda t: -float(t[0]) if t[0] else 0,
    )
    print(f"\n=== TOP {args.top} BY GEMINI SCORE ===\n")
    for score, j, s in ranked[:args.top]:
        print(f"  {score:5} | {j['company'][:30]:30s} | {j['role'][:60]:60s} | {s.get('reason', '')[:80]}")
    print(f"\nNext: review {SCORES_TSV.name}, pick top jobs, then in Claude Code: /career-ops oferta <url>")


if __name__ == "__main__":
    main()
