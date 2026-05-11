/**
 * apply-counter — daily LinkedIn Easy Apply rate-limit accounting.
 *
 * Reads/writes `data/apply-counter.json` which is keyed by ISO yyyy-mm-dd
 * date in the host's local timezone (matching how autopilot's daily-scan
 * weekday logic uses local time). The counter is shared across profiles
 * because `thresholds.maxAppliesPerDay` from autopilot.json is itself a
 * single global cap, not per-profile.
 *
 * Used by orchestrator's `runLinkedInApply` (per-job + bulk paths) to gate
 * each Submit on whether today's count is still under the threshold.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';

const PATH = path.join(ROOT, 'data', 'apply-counter.json');

type State = Record<string, number>; // { 'yyyy-mm-dd': count }

function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd;
}

function readState(): State {
  try {
    if (!fs.existsSync(PATH)) return {};
    const raw = fs.readFileSync(PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as State) : {};
  } catch {
    return {};
  }
}

function writeState(s: State): void {
  fs.mkdirSync(path.dirname(PATH), { recursive: true });
  fs.writeFileSync(PATH, JSON.stringify(s, null, 2) + '\n');
}

/** Today's apply count (0 if no entry). */
export function todayCount(): number {
  const s = readState();
  return s[todayKey()] ?? 0;
}

/** Increment + persist. Returns the new count after the bump. */
export function bumpApplyCounter(): number {
  const s = readState();
  const key = todayKey();
  s[key] = (s[key] ?? 0) + 1;
  writeState(s);
  return s[key];
}

/** Path getter for reset code that needs to back up the file. */
export function applyCounterPath(): string {
  return PATH;
}
