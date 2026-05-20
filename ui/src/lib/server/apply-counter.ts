/** Per-user daily apply rate-limit counter at
 *  data/users/{userId}/profiles/_shared/apply-counter.json. Keyed by
 *  local-time ISO date to match autopilot's weekday logic. Must be
 *  per-user because thresholds.maxAppliesPerDay is per-user (F9/F17).
 *  Callers (orchestrator.runLinkedInApply, apply-queue.job.ts) run
 *  inside runAsUser() so the implicit currentUserIdOrDefault() is
 *  correct. */

import fs from 'node:fs';
import path from 'node:path';
import { userSharedPath, userSharedPathForUser } from './profile-paths';

type State = Record<string, number>; // { 'yyyy-mm-dd': count }

function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd;
}

function readState(p: string): State {
  try {
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as State) : {};
  } catch {
    return {};
  }
}

function writeState(p: string, s: State): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(s, null, 2) + '\n');
}

/** Today's apply count for the current user (0 if no entry). */
export function todayCount(): number {
  const s = readState(userSharedPath('apply-counter'));
  return s[todayKey()] ?? 0;
}

/** Increment + persist for the current user. Returns the new count after the bump. */
export function bumpApplyCounter(): number {
  const p = userSharedPath('apply-counter');
  const s = readState(p);
  const key = todayKey();
  s[key] = (s[key] ?? 0) + 1;
  writeState(p, s);
  return s[key];
}

/** Path getter for reset code that needs to back up the file. Resolves
 *  to the current user's counter under `userSharedPath('apply-counter')`. */
export function applyCounterPath(): string {
  return userSharedPath('apply-counter');
}

/** Explicit per-user variants for cross-user maintenance code (backup,
 *  GDPR reap, lifecycle reaper). Callers outside an ALS user context
 *  MUST use these instead of the implicit-user versions above. */
export function todayCountForUser(userId: string): number {
  const s = readState(userSharedPathForUser(userId, 'apply-counter'));
  return s[todayKey()] ?? 0;
}

export function bumpApplyCounterForUser(userId: string): number {
  const p = userSharedPathForUser(userId, 'apply-counter');
  const s = readState(p);
  const key = todayKey();
  s[key] = (s[key] ?? 0) + 1;
  writeState(p, s);
  return s[key];
}

export function applyCounterPathForUser(userId: string): string {
  return userSharedPathForUser(userId, 'apply-counter');
}
