/**
 * Autopilot circuit breaker.
 *
 * Listens to bus events for operationally suspicious failures and pauses
 * Autopilot when thresholds trip. Surfaces a structured Issue (deduped,
 * so repeated tripping doesn't spam the inbox) so the user can see what
 * happened on /inbox and click "Resume" once they've fixed it.
 *
 * Multi-user (F12): pre-fix this module had a single
 * `consecutiveLinkedInFailures` counter and `checkPreflight()` read
 * `activePath('cv-md')` from whatever ALS context the boot timer held
 * (= SYSTEM_USER). Result: user A's two LinkedIn failures paused
 * Autopilot for EVERYONE, and the boot preflight tripped on SYSTEM's
 * empty profile tree even when all real users had cv.md.
 *
 * Now:
 *   - Per-user `consecutiveLinkedInFailures` map keyed by
 *     `ev.userId ?? SYSTEM_USER_ID`. Each user trips their own breaker.
 *   - `trip()` writes to THIS user's autopilot config + tags the issue
 *     with the userId so /inbox only surfaces it to the affected user.
 *   - `checkPreflight()` iterates every schedulable user and only trips
 *     for users whose own profile tree is missing essentials.
 *
 * Trip conditions (any one breaks the circuit for a user):
 *   - 2× consecutive `apply-linkedin` task failures for that user
 *   - profile.yml YAML parse error tagged to that user
 *   - cv.md missing for that user's active profile (preflight only)
 *
 * Resolution: the user clicks "Resume autopilot" on the issue (which
 * calls resumeAutopilot()), or directly toggles globalEnabled back on
 * from the Autopilot page. Either path clears the dedupeKey'd issue
 * on next trip.
 *
 * Idempotent: installCircuitBreaker() can be called multiple times
 * safely (only the first call wires the bus listener).
 */

import fs from 'node:fs';
import { installBusListener, logEvent } from './events';
import { readConfigForUser, writeConfigForUser } from './autopilot';
import { reportIssue, listOpenIssues, resolveIssue } from './issues';
import { profilePathForUser } from './profile-paths';
import {
  currentUserIdOrDefault,
  listSchedulableUsers,
  runAsUser,
  SYSTEM_USER_ID,
} from './user-context';
import type { ActivityEvent } from '$lib/types';

const DEDUPE_KEY = 'autopilot-circuit-breaker';

/** Per-user consecutive-failure counter. Pre-F12 this was a single
 *  `let consecutiveLinkedInFailures = 0` which conflated every user's
 *  failures. */
const consecutiveLinkedInFailures = new Map<string, number>();

/** Resolve the active profile id for a given user. Returns null when the
 *  user has no profiles (a fresh signup pre-onboarding). */
async function activeProfileFor(userId: string): Promise<string | null> {
  try {
    const { listProfilesForUser } = await import('./profiles-db');
    const profiles = listProfilesForUser(userId);
    if (profiles.length === 0) return null;
    const active = profiles.find((p) => p.isActive) ?? profiles[0];
    return active.slug;
  } catch {
    return null;
  }
}

/** Common helper: pause Autopilot for a SPECIFIC user, write the issue
 *  tagged to that user, log the event with userId attribution. */
function trip(
  userId: string,
  reason: string,
  detail: string,
  fix?: { label: string; href: string },
): void {
  const cfg = readConfigForUser(userId);
  if (cfg.globalEnabled) {
    writeConfigForUser(userId, { ...cfg, globalEnabled: false });
  }
  reportIssue({
    severity: 'error',
    source: 'autopilot',
    summary: 'Autopilot paused: ' + reason,
    detail,
    fix: fix ?? { label: 'Open Autopilot', href: '/autopilot' },
    // Per-user dedupe key so user A and user B can each have their own
    // open circuit-breaker issue without colliding.
    dedupeKey: DEDUPE_KEY + ':' + userId,
    userId: userId === SYSTEM_USER_ID ? undefined : userId,
  });
  logEvent('autopilot', 'Circuit breaker tripped', {
    level: 'error',
    category: 'system',
    message: reason,
    userId: userId === SYSTEM_USER_ID ? null : userId,
  });
  // Reset that user's LinkedIn counter so a re-enable + new failure
  // starts fresh.
  consecutiveLinkedInFailures.set(userId, 0);
}

function isLinkedInFailure(ev: ActivityEvent): boolean {
  if (ev.level !== 'error') return false;
  if (ev.source !== 'apply-linkedin') return false;
  // logEvent for failed tasks uses titles like "Task failed" or "Apply finished failed".
  // We're conservative and accept any error from this source.
  return true;
}

function isLinkedInSuccess(ev: ActivityEvent): boolean {
  if (ev.level !== 'success') return false;
  if (ev.source !== 'apply-linkedin') return false;
  return /finished|complete/i.test(ev.title);
}

function isProfileYamlError(ev: ActivityEvent): boolean {
  if (ev.level !== 'error') return false;
  // Heuristic: profile-loader-style sources, or message mentions profile.yml
  // and YAML/parse keywords.
  if (ev.source === 'profile' || ev.source === 'profile-yml') return true;
  const text = (ev.title + ' ' + (ev.message ?? '')).toLowerCase();
  if (text.includes('profile.yml') && (text.includes('yaml') || text.includes('parse')))
    return true;
  return false;
}

/** Boot-time sanity check — fan out across every schedulable user. If a
 *  user's user-layer essentials are missing, that user's autopilot has
 *  nothing to apply with, so trip pre-emptively for THAT user.
 *
 *  F12 sibling: pre-fix this ran once at boot with SYSTEM_USER context,
 *  tripping the global breaker for an empty SYSTEM tree even when all
 *  real users had cv.md. */
async function checkPreflight(): Promise<void> {
  try {
    const userIds = await listSchedulableUsers();
    for (const userId of userIds) {
      if (userId === SYSTEM_USER_ID) continue; // skip the legacy sentinel
      await runAsUser(userId, async () => {
        const activeSlug = await activeProfileFor(userId);
        if (!activeSlug) return; // pre-onboarding, nothing to check
        const cvPath = profilePathForUser(userId, activeSlug, 'cv-md');
        const profileYml = profilePathForUser(userId, activeSlug, 'profile-yml');
        if (!fs.existsSync(cvPath)) {
          trip(
            userId,
            'cv.md is missing',
            'The autopilot needs your CV to generate tailored applications. Add cv.md via /profile.',
            { label: 'Onboarding guide', href: '/help' },
          );
          return;
        }
        if (fs.existsSync(profileYml)) {
          try {
            const txt = fs.readFileSync(profileYml, 'utf8');
            if (!txt.trim() || !/^[a-zA-Z_]/m.test(txt)) {
              trip(
                userId,
                'profile.yml looks empty or invalid',
                'The autopilot reads config/profile.yml for archetypes, comp targets, and location policy. Fill it in or restore from templates/profile.example.yml.',
                { label: 'Open Profile', href: '/profile' },
              );
            }
          } catch (e) {
            trip(
              userId,
              'profile.yml could not be read',
              e instanceof Error ? e.message : String(e),
              {
                label: 'Open Profile',
                href: '/profile',
              },
            );
          }
        }
      });
    }
  } catch (e) {
    // Preflight is best-effort; don't crash boot if listSchedulableUsers
    // raced with DB init.
    logEvent('autopilot', 'Preflight check skipped', {
      level: 'warn',
      category: 'system',
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

function onEvent(ev: ActivityEvent): void {
  // F12 — every breaker action is scoped to the event's userId. Events
  // without a userId fall back to SYSTEM_USER which keeps legacy
  // single-user installs working unchanged.
  const userId = ev.userId ?? SYSTEM_USER_ID;

  // LinkedIn streak tracking
  if (isLinkedInFailure(ev)) {
    const next = (consecutiveLinkedInFailures.get(userId) ?? 0) + 1;
    consecutiveLinkedInFailures.set(userId, next);
    if (next >= 2) {
      // trip() needs the user context for readConfig / reportIssue /
      // logEvent to land in the right user's files. runAsUser preserves
      // it through any internal awaits.
      void runAsUser(userId, async () => {
        trip(
          userId,
          'LinkedIn Easy Apply failed twice in a row',
          'Two consecutive runs of `apply-linkedin` errored. Common causes: expired LinkedIn cookies, profile/CV mismatch, or LinkedIn rate-limit. Check the activity feed for the underlying messages, fix the cause, then resume.',
          { label: 'Open Autopilot', href: '/autopilot' },
        );
      });
    }
    return;
  }
  if (isLinkedInSuccess(ev)) {
    consecutiveLinkedInFailures.set(userId, 0);
    return;
  }

  // Per-event triggers
  if (isProfileYamlError(ev)) {
    void runAsUser(userId, async () => {
      trip(
        userId,
        'profile.yml failed to parse',
        ev.message ??
          'YAML parser raised an error reading config/profile.yml. Fix the syntax and resume.',
        { label: 'Open Profile', href: '/profile' },
      );
    });
    return;
  }
}

/** Manually clear the circuit-breaker issue and re-enable autopilot for
 *  the CURRENT user. Endpoint that calls this must run inside a
 *  requireUserId() guard so the ALS context resolves correctly. */
export function resumeAutopilot(): { ok: boolean; resolved: boolean } {
  const userId = currentUserIdOrDefault();
  const cfg = readConfigForUser(userId);
  if (!cfg.globalEnabled) writeConfigForUser(userId, { ...cfg, globalEnabled: true });
  consecutiveLinkedInFailures.set(userId, 0);
  // Mark the open circuit-breaker issue resolved so the inbox banner clears.
  // Match by per-user dedupeKey (F12) so user A's resume doesn't
  // accidentally clear user B's open issue.
  const open = listOpenIssues().find((i) => i.dedupeKey === DEDUPE_KEY + ':' + userId);
  let resolved = false;
  if (open) {
    resolveIssue(open.id);
    resolved = true;
  }
  logEvent('autopilot', 'Resumed by user', {
    level: 'info',
    category: 'system',
    message: resolved ? 'Cleared circuit-breaker issue' : 'No open circuit-breaker issue',
  });
  return { ok: true, resolved };
}

/** Idempotent installer. Call once from boot (orchestrator/hooks).
 *  installBusListener handles HMR-safe re-installation — see events.ts. */
export function installCircuitBreaker(): void {
  installBusListener('autopilot-circuit-breaker', onEvent);
  // Defer preflight by a tick so other boot logging stays first. Skip in
  // test envs — the timer would fire after the test process is supposed
  // to exit and crash on the (intentionally empty) tmpdir DB.
  if (process.env.VITEST !== 'true' && process.env.NODE_ENV !== 'test') {
    setTimeout(() => {
      void checkPreflight();
    }, 1500);
  }
}

installCircuitBreaker();
