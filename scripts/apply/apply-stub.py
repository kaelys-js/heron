#!/usr/bin/env python3
"""
apply-stub.py — Fallback adapter for portals that don't have production
automation yet.

Routes-here: lever, workable, personio, smartrecruiters, recruitee,
teamtailor, workday, indeed, unknown.

Behavior:
    1. Read URL + job id from args.
    2. Append `stub-detected` to apply-state stepHistory.
    3. Emit `APPLY_RESULT: manual-apply-needed:stub` so the dispatcher
       sees a proper protocol line.
    4. Exit 1.

The TypeScript side (apply-queue.job.ts) sees the manual-apply-needed
result and calls reportApplyFailure() with mode='stub', which emits an
Issue with the dedupeKey `apply:{jobId}` and a "Open posting" CTA so
the user can finish by hand.

When a real adapter ships for one of these portals (e.g. apply-lever.py),
remove the portal from STUB_PORTALS in apply-portal.py — the routing
will automatically prefer the new script.
"""

from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent
REPO_ROOT = ROOT.parent.parent  # scripts/<domain>/ → repo/
sys.path.insert(0, str(ROOT))
from lib_apply import detect_portal, append_step, emit_result  # noqa: E402

APPLY_STATE_DIR = REPO_ROOT / "data" / "apply-state"


def _state_file_for(job_id: str) -> Path:
    """Mirror lib_apply._state_path so we can probe whether apply-portal.py
    seeded a state file for this run. Standalone invocations skip seeding."""
    safe = re.sub(r"[^a-zA-Z0-9_\-:]", "", job_id) or "unknown"
    return APPLY_STATE_DIR / f"{safe}.json"


def main() -> int:
    ap = argparse.ArgumentParser(description="Stub adapter (manual-apply-needed:stub)")
    ap.add_argument("--url", required=True)
    ap.add_argument("--job-id", required=True, dest="job_id")
    ap.add_argument("--profile", default=None)
    ap.add_argument("--score", default=None)
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    det = detect_portal(args.url)
    portal = det.get("portal", "unknown")

    # append_step writes to the state file AND prints the canonical
    # APPLY_STEP line to stdout (see lib_apply.py). If the state file
    # doesn't exist (standalone invocation, not via apply-portal.py),
    # append_step is a no-op for the file but we still want the protocol
    # line -- fall back to printing explicitly.
    try:
        append_step(args.job_id, f"stub-detected:{portal}")
    except Exception:
        pass
    # Defensive: if append_step's auto-print was skipped (no state file for
    # THIS job), the dispatcher's parser still needs to see this step.
    # apply-portal.py seeds state before calling us, so this should be a
    # no-op in the production path -- but standalone debug runs benefit.
    if not _state_file_for(args.job_id).exists():
        print(f"APPLY_STEP: stub-detected:{portal}", flush=True)

    print(
        f"[stub] {portal} automation not implemented yet — escalating to ManualApplyNeeded.",
        file=sys.stderr,
        flush=True,
    )

    return emit_result("manual-apply-needed", "stub")


if __name__ == "__main__":
    sys.exit(main())
