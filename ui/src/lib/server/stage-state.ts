/**
 * stage-state — per-job stage tracking sidecar.
 *
 * Why a sidecar JSON file instead of widening applications.md:
 *   • applications.md is a fixed 9-column markdown table. Adding cols
 *     would break every existing row and every parser (incl. the
 *     Claude CLI that reads it).
 *   • Stage-history (every transition, with timestamps) doesn't fit a
 *     table cell — it's a list-of-records per job.
 *   • The sidecar lives at `data/users/{userId}/profiles/{slug}/stage-
 *     state.json` so it's automatically scoped to one user + one
 *     profile, just like every other per-profile file.
 *
 * Shape:
 *   {
 *     "{jobId}": {
 *       "stageHistory": [{ status: 'Applied', at: 1778500000000 }, ...],
 *       "lastTouchAt": 1778600000000,
 *       "nextActionDue": { dueAt: 1778800000000, kind: 'follow-up' | 'thank-you' | 'prep' | 'decision', note?: string },
 *       "ghostedAt": 1778900000000   // null until auto-ghost flag fires
 *     }
 *   }
 *
 * Used by:
 *   • Pipeline UI — surfaces "days since last touch" + "next action due"
 *   • Inbox — auto-cards for thank-you-owed / follow-up-due / prep-block
 *   • Funnel stats — measures applied→screen→onsite→offer rates per company tier
 *   • Auto-ghost detection — flags applications silent for ≥ daysToGhost
 */

import fs from 'node:fs';
import path from 'node:path';
import { profilePath } from './profile-paths';
import { getActiveProfileId } from './profiles';
import type { Status } from '$lib/types';

export type StageTransition = { status: Status; at: number; note?: string };

export type NextActionKind = 'follow-up' | 'thank-you' | 'prep' | 'decision' | 'negotiate';
export type NextAction = {
  dueAt: number;
  kind: NextActionKind;
  note?: string;
  /** When kind=thank-you, which interviewer is owed the note. */
  interviewerName?: string;
};

export type JobStageState = {
  stageHistory: StageTransition[];
  /** Timestamp of the most recent event the user "touched" — apply, stage
   *  transition, sent a follow-up, scheduled an interview, etc. Drives the
   *  "days since last touch" badge + auto-ghost detection. */
  lastTouchAt: number;
  nextActionDue?: NextAction;
  /** Set by the auto-ghost detector when lastTouchAt + daysToGhost has
   *  elapsed without a stage transition. Cleared if the user manually
   *  marks the job as Active again. */
  ghostedAt?: number;
};

function statePath(profileId?: string): string {
  return profilePath(profileId ?? getActiveProfileId(), 'stage-state-json');
}

function readAll(profileId?: string): Record<string, JobStageState> {
  const p = statePath(profileId);
  try {
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, JobStageState>) : {};
  } catch {
    return {};
  }
}

function writeAll(state: Record<string, JobStageState>, profileId?: string): void {
  const p = statePath(profileId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2));
}

export function getStageState(jobId: string, profileId?: string): JobStageState | undefined {
  return readAll(profileId)[jobId];
}

/** Record a status transition. Updates lastTouchAt automatically. */
export function recordTransition(
  jobId: string,
  newStatus: Status,
  opts: { profileId?: string; note?: string; at?: number } = {},
): JobStageState {
  const all = readAll(opts.profileId);
  const at = opts.at ?? Date.now();
  const existing: JobStageState = all[jobId] ?? {
    stageHistory: [],
    lastTouchAt: at,
  };
  const last = existing.stageHistory[existing.stageHistory.length - 1];
  if (!last || last.status !== newStatus) {
    existing.stageHistory.push({ status: newStatus, at, note: opts.note });
  }
  existing.lastTouchAt = at;
  // A transition clears any pending action that was specific to the prior
  // stage. The next-action engine will populate a fresh one if needed.
  existing.nextActionDue = undefined;
  // Manual transition unghosts the job.
  existing.ghostedAt = undefined;
  all[jobId] = existing;
  writeAll(all, opts.profileId);
  return existing;
}

export function setNextAction(
  jobId: string,
  action: NextAction,
  profileId?: string,
): JobStageState | undefined {
  const all = readAll(profileId);
  const existing = all[jobId];
  if (!existing) return undefined;
  existing.nextActionDue = action;
  all[jobId] = existing;
  writeAll(all, profileId);
  return existing;
}

export function clearNextAction(jobId: string, profileId?: string): void {
  const all = readAll(profileId);
  if (!all[jobId]) return;
  all[jobId].nextActionDue = undefined;
  writeAll(all, profileId);
}

export function touchJob(jobId: string, profileId?: string, at?: number): void {
  const all = readAll(profileId);
  if (!all[jobId]) {
    all[jobId] = { stageHistory: [], lastTouchAt: at ?? Date.now() };
  } else {
    all[jobId].lastTouchAt = at ?? Date.now();
    all[jobId].ghostedAt = undefined;
  }
  writeAll(all, profileId);
}

/** List jobs whose lastTouchAt is older than `daysToGhost` and are NOT in a
 *  terminal state (Accepted / Declined / Rejected / Closed / Ghosted). */
export function listStaleJobs(
  daysToGhost: number,
  profileId?: string,
): { jobId: string; daysSinceLastTouch: number; state: JobStageState }[] {
  const all = readAll(profileId);
  const cutoff = Date.now() - daysToGhost * 24 * 60 * 60 * 1000;
  const out: { jobId: string; daysSinceLastTouch: number; state: JobStageState }[] = [];
  for (const [jobId, state] of Object.entries(all)) {
    if (state.lastTouchAt > cutoff) continue;
    const lastStage = state.stageHistory[state.stageHistory.length - 1]?.status;
    if (
      lastStage === 'Accepted' ||
      lastStage === 'Declined' ||
      lastStage === 'Rejected' ||
      lastStage === 'Closed' ||
      lastStage === 'Ghosted'
    )
      continue;
    out.push({
      jobId,
      daysSinceLastTouch: Math.floor((Date.now() - state.lastTouchAt) / (24 * 60 * 60 * 1000)),
      state,
    });
  }
  return out.sort((a, b) => b.daysSinceLastTouch - a.daysSinceLastTouch);
}

/** Mark a job as ghosted. */
export function markGhosted(jobId: string, profileId?: string): JobStageState | undefined {
  const all = readAll(profileId);
  const existing = all[jobId];
  if (!existing) return undefined;
  existing.ghostedAt = Date.now();
  existing.stageHistory.push({ status: 'Ghosted', at: Date.now(), note: 'auto-ghost' });
  all[jobId] = existing;
  writeAll(all, profileId);
  return existing;
}

/** Aggregate funnel stats across every job in this profile. */
export type FunnelStats = {
  applied: number;
  screened: number; // PhoneScreen + Screened
  interview: number; // Technical/Onsite/Final
  offer: number;
  accepted: number;
  rejected: number;
  ghosted: number;
  /** Conversion rate from previous stage. */
  appliedToScreen: number;
  screenToInterview: number;
  interviewToOffer: number;
  offerToAccept: number;
};

export function computeFunnelStats(profileId?: string): FunnelStats {
  const all = readAll(profileId);
  const stats: FunnelStats = {
    applied: 0,
    screened: 0,
    interview: 0,
    offer: 0,
    accepted: 0,
    rejected: 0,
    ghosted: 0,
    appliedToScreen: 0,
    screenToInterview: 0,
    interviewToOffer: 0,
    offerToAccept: 0,
  };
  // We walk each job's history and count the FURTHEST stage it ever reached.
  // This is conservative (e.g. a Rejected-after-onsite job counts in interview)
  // and matches how real recruiter funnel-rates are computed.
  for (const state of Object.values(all)) {
    const seen = new Set(state.stageHistory.map((s) => s.status));
    if (
      seen.has('Applied') ||
      seen.has('Screened') ||
      seen.has('PhoneScreen') ||
      seen.has('Technical') ||
      seen.has('TakeHome') ||
      seen.has('Onsite') ||
      seen.has('Final') ||
      seen.has('Interview') ||
      seen.has('Offer') ||
      seen.has('Negotiating') ||
      seen.has('Accepted')
    ) {
      stats.applied++;
    }
    if (
      seen.has('Screened') ||
      seen.has('PhoneScreen') ||
      seen.has('Technical') ||
      seen.has('TakeHome') ||
      seen.has('Onsite') ||
      seen.has('Final') ||
      seen.has('Interview') ||
      seen.has('Offer') ||
      seen.has('Negotiating') ||
      seen.has('Accepted')
    ) {
      stats.screened++;
    }
    if (
      seen.has('Technical') ||
      seen.has('TakeHome') ||
      seen.has('Onsite') ||
      seen.has('Final') ||
      seen.has('Interview') ||
      seen.has('Offer') ||
      seen.has('Negotiating') ||
      seen.has('Accepted')
    ) {
      stats.interview++;
    }
    if (seen.has('Offer') || seen.has('Negotiating') || seen.has('Accepted')) {
      stats.offer++;
    }
    if (seen.has('Accepted')) stats.accepted++;
    if (seen.has('Rejected')) stats.rejected++;
    if (seen.has('Ghosted')) stats.ghosted++;
  }
  stats.appliedToScreen = stats.applied ? stats.screened / stats.applied : 0;
  stats.screenToInterview = stats.screened ? stats.interview / stats.screened : 0;
  stats.interviewToOffer = stats.interview ? stats.offer / stats.interview : 0;
  stats.offerToAccept = stats.offer ? stats.accepted / stats.offer : 0;
  return stats;
}

/** List all jobs with their full stage state — used by /api/pipeline + /api/inbox/cards. */
export function listAllStageState(profileId?: string): Record<string, JobStageState> {
  return readAll(profileId);
}
