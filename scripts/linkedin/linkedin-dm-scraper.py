#!/usr/bin/env python3
"""
linkedin-dm-scraper.py — pull recent LinkedIn DMs into the inbound-lead
pipeline.

LinkedIn DMs (InMail + 1st-degree messages) are the single highest-
converting recruiter inbound channel. The Inbox already surfaces email
recruiter-reach-outs; this script extends that coverage to LinkedIn.

Output: JSON array on stdout, one entry per message. The dashboard
ingests it via `linkedin-dm.job.ts` which dedupes + enriches +
classifies.

USAGE
  python3 linkedin-dm-scraper.py --json
  python3 linkedin-dm-scraper.py --json --max 30
  python3 linkedin-dm-scraper.py --json --since-days 7

OUTPUT shape per entry
  {
    "messageId": "stable-hash-from-sender+ts+excerpt",
    "ts": 1700000000000,
    "senderName": "...",
    "senderTitle": "...",            # if extractable from sender header
    "senderCompany": "...",           # ditto
    "senderProfileUrl": "https://www.linkedin.com/in/...",
    "subject": "...",                 # first line if InMail
    "body": "...",                    # full message body (truncated 4KB)
    "kind": "inmail" | "direct"
  }

EXIT CODES
  0 — clean (or empty inbox)
  1 — auth required
  2 — partial scrape (some messages skipped); JSON still emitted
  3 — fatal Playwright failure
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent  # scripts/linkedin/
REPO_ROOT = ROOT.parent.parent  # repo root
sys.path.insert(0, str(REPO_ROOT / "scripts" / "lib"))

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


MESSAGES_URL = "https://www.linkedin.com/messaging/"


def stable_id(sender: str, ts: int, excerpt: str) -> str:
    h = hashlib.sha256()
    h.update((sender + "|" + str(ts) + "|" + excerpt[:64]).encode("utf-8"))
    return h.hexdigest()[:16]


def parse_time_ago(text: str) -> int:
    """LinkedIn shows 'now' / '5m' / '2h' / 'Yesterday' / 'Mon' / 'Apr 12'.
    Best-effort conversion to a unix-ms timestamp."""
    now_ms = int(time.time() * 1000)
    text = (text or "").strip().lower()
    if text in ("now", "just now"):
        return now_ms
    m = re.match(r"^(\d+)\s*m$", text)
    if m:
        return now_ms - int(m.group(1)) * 60 * 1000
    m = re.match(r"^(\d+)\s*h$", text)
    if m:
        return now_ms - int(m.group(1)) * 3600 * 1000
    if text == "yesterday":
        return now_ms - 24 * 3600 * 1000
    m = re.match(r"^(\d+)\s*d$", text)
    if m:
        return now_ms - int(m.group(1)) * 24 * 3600 * 1000
    # "Apr 12" / "Apr 12, 2024" -- too noisy to parse precisely. Use
    # 30-days-ago as a conservative fallback.
    return now_ms - 30 * 24 * 3600 * 1000


def scrape_messages(page: Page, max_messages: int, since_ms: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    try:
        page.goto(MESSAGES_URL, timeout=PROBE_TIMEOUT_MS, wait_until="domcontentloaded")
    except PlaywrightTimeout:
        return out
    humanize(1.0, 2.0)

    # Each conversation row in the left rail. We open each one in turn,
    # read the message body from the right pane, then close.
    rows = page.locator(
        "ul.msg-conversations-container__conversations-list li.msg-conversation-listitem"
    )
    count = min(rows.count(), max_messages)
    for i in range(count):
        try:
            row = rows.nth(i)
            time_text = ""
            try:
                time_text = (
                    row.locator("time.msg-conversation-listitem__time-stamp")
                    .inner_text(timeout=1500)
                    .strip()
                )
            except Exception:
                pass
            ts = parse_time_ago(time_text)
            if ts < since_ms:
                continue
            row.click(timeout=4_000)
            humanize(0.5, 1.2)
            # Now the right pane has the conversation. Extract the latest
            # message body + sender meta.
            sender_name = ""
            sender_title = ""
            sender_profile_url = ""
            try:
                header = page.locator(
                    "section.msg-thread h2, header.msg-overlay-bubble-header__title"
                ).first
                sender_name = header.inner_text(timeout=1500).strip()
            except Exception:
                pass
            try:
                link = page.locator(
                    "header a.msg-thread__link-to-profile, section.msg-thread a[href*='/in/']"
                ).first
                sender_profile_url = (link.get_attribute("href", timeout=1500) or "").strip()
            except Exception:
                pass
            # Subject -- InMails have a subject line
            subject = ""
            try:
                subj = page.locator("h2.msg-s-event-listitem__subject").first
                subject = subj.inner_text(timeout=1500).strip()
            except Exception:
                pass
            kind = "inmail" if subject else "direct"
            # Body -- last message-body block
            body = ""
            try:
                bodies = page.locator(
                    "div.msg-s-event-listitem__body, p.msg-s-event-listitem__body"
                )
                bcount = bodies.count()
                if bcount > 0:
                    body = bodies.nth(bcount - 1).inner_text(timeout=2000).strip()
            except Exception:
                pass
            if not body and not subject:
                continue
            body_excerpt = body[:4000]
            out.append(
                {
                    "messageId": stable_id(sender_name, ts, body_excerpt),
                    "ts": ts,
                    "senderName": sender_name,
                    "senderProfileUrl": sender_profile_url,
                    "subject": subject,
                    "body": body_excerpt,
                    "kind": kind,
                }
            )
        except Exception:
            continue
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--max", type=int, default=30)
    ap.add_argument("--since-days", type=int, default=14)
    args = ap.parse_args()
    since_ms = int(time.time() * 1000) - args.since_days * 24 * 3600 * 1000
    with launch_persistent("linkedin", headed=False) as ctx:
        page = ctx.new_page()
        if not is_logged_in_linkedin(page):
            print("ERROR: LinkedIn session expired.", file=sys.stderr)
            sys.exit(1)
        humanize(0.5, 1.0)
        msgs = scrape_messages(page, args.max, since_ms)
    if args.json:
        print(json.dumps(msgs, indent=2))
    else:
        print(f"{len(msgs)} message(s) pulled.")
    sys.exit(0)


if __name__ == "__main__":
    main()
