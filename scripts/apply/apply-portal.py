#!/usr/bin/env python3
"""
apply-portal.py — Python-side dispatcher for the autonomous apply system.

Invoked by ui/src/lib/server/jobs/apply-queue.job.ts:dispatchApply once per
job in the queue. Detects the portal from the URL, routes to the right
per-portal adapter, and streams the canonical APPLY_STEP / APPLY_RESULT
lines back to the caller's stdout.

Usage:
    python apply-portal.py --url <url> --job-id <id> [--profile <slug>]
                            [--score <float>] [--headed] [--dry-run]

Exit codes (mirrors lib_apply.emit_result):
    0 — applied
    1 — manual-apply-needed (Issue should be emitted)
    2 — error (system-level failure, e.g. adapter script missing)

Adapter routing (all 11 named portals are production today):
    linkedin           → apply-linkedin.py
    greenhouse         → apply-greenhouse.py
    ashby              → apply-ashby.py
    lever              → apply-lever.py
    workday            → apply-workday.py
    workable           → apply-workable.py
    personio           → apply-personio.py
    smartrecruiters    → apply-smartrecruiters.py
    recruitee          → apply-recruitee.py
    teamtailor         → apply-teamtailor.py
    indeed             → apply-indeed.py
    unknown            → apply-stub.py (catch-all → ManualApplyNeeded)

`unknown` is the only path that intentionally routes to apply-stub.py:
detect_portal() returns 'unknown' when the URL doesn't match any of
the known portal hostnames, so the user finishes manually from the
Inbox. The stub adapter is deliberately invoked in-process via
subprocess so we keep ONE dispatch path — no special-case branch to
forget when adding a new portal.
"""

from __future__ import annotations
import argparse
import os
import subprocess
import sys
from pathlib import Path

# Import shared helpers — these define the state-file convention and
# canonical APPLY_RESULT format that ui-side parses.
ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))
from lib_apply import detect_portal, write_apply_state, emit_result  # noqa: E402

PRODUCTION_PORTALS = {
    "linkedin",
    "greenhouse",
    "ashby",
    "lever",
    "workday",
    # Second-round graduations — heuristic-quality where instance-specific,
    # selector-stable on the common case. Each adapter is 50-80 lines on
    # top of the shared lib_portal.PortalConfig scaffold.
    "workable",
    "personio",
    "smartrecruiters",
    "recruitee",
    "teamtailor",
    "indeed",
}
# Only 'unknown' remains as a stub now. Listed explicitly so a typo in
# an adapter filename doesn't get silently masked.
STUB_PORTALS = {"unknown"}


def adapter_for(portal: str) -> Path:
    """Map portal id → per-portal script path. Always returns a real Path;
    raises FileNotFoundError if production portals don't have their script."""
    if portal in STUB_PORTALS:
        return ROOT / "apply-stub.py"
    return ROOT / f"apply-{portal}.py"


def main() -> int:
    ap = argparse.ArgumentParser(description="Dispatch a job apply to the correct portal adapter")
    ap.add_argument("--url", required=True)
    ap.add_argument("--job-id", required=True, dest="job_id")
    ap.add_argument("--profile", default=None)
    ap.add_argument("--score", default=None)
    ap.add_argument(
        "--headed",
        action="store_true",
        help="Run the adapter with a visible browser window (for debugging or CAPTCHA fall-through).",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Fill the form but stop before Submit. Useful for adapter smoke tests.",
    )
    args = ap.parse_args()

    # Detect portal first — emit APPLY_STEP so the caller's parser sees us
    # before any subprocess output mixes in.
    det = detect_portal(args.url)
    portal = det.get("portal", "unknown")
    meta = det.get("meta") or {}

    print(f"APPLY_STEP: dispatch-detect:{portal}", flush=True)

    # Seed the apply-state file — the adapter will append_step over it.
    # If apply-queue.job.ts already wrote one, this is a benign overwrite.
    write_apply_state(
        args.job_id,
        url=args.url,
        portal=portal,
        profileId=args.profile or "",
        startedAt=None,  # adapter will fill on actual launch
        lastStep="dispatched",
        stepHistory=["queued", "dispatched"],
        meta=meta,
    )

    script = adapter_for(portal)
    if not script.exists():
        # Unexpected: a portal in PRODUCTION_PORTALS doesn't have its script
        # yet. Treat as system error so the caller surfaces a real Issue
        # (not a soft manual-apply-needed which would silently mask the bug).
        print(f"[dispatch] missing adapter script: {script}", file=sys.stderr, flush=True)
        return emit_result("error", f"missing-adapter:{portal}")

    # Build the child argv. We pass through every relevant arg so each
    # adapter has uniform access — adapters can ignore flags they don't use.
    cmd = [
        sys.executable,
        str(script),
        "--url",
        args.url,
        "--job-id",
        args.job_id,
    ]
    if args.profile:
        cmd += ["--profile", args.profile]
    if args.score is not None:
        cmd += ["--score", args.score]
    if args.headed:
        cmd.append("--headed")
    if args.dry_run:
        cmd.append("--dry-run")

    print(f"APPLY_STEP: dispatch-spawn:{script.name}", flush=True)

    # Stream stdout/stderr directly to the caller. apply-queue.job.ts is
    # already line-parsing for APPLY_STEP / APPLY_RESULT — we don't need to
    # buffer here.
    try:
        rc = subprocess.call(cmd, cwd=str(ROOT), env=os.environ.copy())
    except FileNotFoundError as e:
        print(f"[dispatch] failed to spawn adapter: {e}", file=sys.stderr, flush=True)
        return emit_result("error", f"spawn-failed:{e}")
    except KeyboardInterrupt:
        # Bubble up — autopilot will mark the parent run as cancelled.
        return emit_result("error", "interrupted")

    # If the adapter exited without emitting APPLY_RESULT, derive one from
    # the exit code so the caller still gets a valid protocol line.
    # (The adapter SHOULD emit its own; this is defensive.)
    if rc not in (0, 1, 2):
        # Treat unknown exit codes as system errors. Don't double-emit
        # APPLY_RESULT if the adapter already wrote one — the caller's
        # parser keeps the last value.
        print(
            f"[dispatch] adapter exited with unexpected code {rc}",
            file=sys.stderr,
            flush=True,
        )
        return emit_result("error", f"exit-{rc}")

    return rc


if __name__ == "__main__":
    sys.exit(main())
