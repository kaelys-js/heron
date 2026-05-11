/**
 * Follow-up cadence wrapper.
 *
 * Spawns `node followup-cadence.mjs` (which already returns JSON to stdout
 * by default) and parses the result. The script handles cadence math,
 * status normalization, urgency clustering — we just transport its output.
 *
 * Cached on disk at `data/followup-cache.json` with a short TTL so repeat
 * page loads don't re-spawn the script. The daily Autopilot job invalidates
 * the cache by writing a fresh result.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';

const CACHE_PATH = path.join(ROOT, 'data', 'followup-cache.json');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export type Urgency = 'urgent' | 'overdue' | 'waiting' | 'cold';

export type FollowupContact = {
  name?: string;
  role?: string;
  email?: string;
  linkedin?: string;
};

export type FollowupEntry = {
  num: string;
  date: string;
  company: string;
  role: string;
  status: string;
  score?: string;
  notes?: string;
  reportPath?: string;
  contacts: FollowupContact[];
  daysSinceApplication: number;
  daysSinceLastFollowup: number | null;
  followupCount: number;
  urgency: Urgency;
  nextFollowupDate: string | null;
  daysUntilNext: number | null;
};

export type FollowupCadence = {
  metadata: {
    analysisDate: string;
    totalTracked: number;
    actionable: number;
    overdue: number;
    urgent: number;
    cold: number;
    waiting: number;
  };
  entries: FollowupEntry[];
  cadenceConfig: Record<string, number>;
  /** Wall-clock when this snapshot was generated. */
  generatedAt: number;
};

/** Spawn the script and resolve with parsed JSON.
 *  P6: pass `--profile <slug>` so the cache reflects the profile the
 *  caller is interested in (defaults to the active profile). The script
 *  understands the flag via lib-profiles.mjs:profileFromArgv. */
function spawnCadence(profileId?: string): Promise<FollowupCadence> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let resolvedProfileId = profileId;
    if (!resolvedProfileId) {
      try {
        const { getActiveProfileId } = require('./profiles') as typeof import('./profiles');
        resolvedProfileId = getActiveProfileId();
      } catch { /* leave undefined; script will default to active */ }
    }
    const args = ['followup-cadence.mjs'];
    if (resolvedProfileId) args.push('--profile', resolvedProfileId);
    const p = spawn('node', args, {
      cwd: ROOT,
      env: { ...process.env },
    });
    p.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    p.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });
    p.on('error', (err) => reject(err));
    p.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('followup-cadence.mjs exited ' + code + ': ' + stderr.slice(0, 300)));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as Omit<FollowupCadence, 'generatedAt'>;
        resolve({ ...parsed, generatedAt: Date.now() });
      } catch (err) {
        reject(new Error('Failed to parse followup-cadence JSON: ' + (err instanceof Error ? err.message : String(err))));
      }
    });
  });
}

/** Read the on-disk cache; returns null if missing or stale. */
function readCache(): FollowupCadence | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as FollowupCadence;
    if (Date.now() - parsed.generatedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(cadence: FollowupCadence): void {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cadence, null, 2));
  } catch {
    // Cache write failures are non-fatal — caller still got the data.
  }
}

/**
 * Returns a follow-up cadence snapshot. Fast path: read cache (≤5min old).
 * Slow path: spawn the script (typically ~200ms on a small tracker).
 *
 * `force=true` skips the cache (used by the daily Autopilot job).
 */
export async function getFollowupCadence(opts?: { force?: boolean; profileId?: string }): Promise<FollowupCadence> {
  if (!opts?.force) {
    const cached = readCache();
    if (cached) return cached;
  }
  const fresh = await spawnCadence(opts?.profileId);
  writeCache(fresh);
  return fresh;
}

export function findEntryByCompanyRole(
  cadence: FollowupCadence,
  company: string,
  role: string,
): FollowupEntry | null {
  const c = company.trim().toLowerCase();
  const r = role.trim().toLowerCase();
  if (!c) return null;
  return (
    cadence.entries.find(
      (e) =>
        e.company.trim().toLowerCase() === c &&
        e.role.trim().toLowerCase() === r,
    ) ??
    cadence.entries.find((e) => e.company.trim().toLowerCase() === c) ??
    null
  );
}
