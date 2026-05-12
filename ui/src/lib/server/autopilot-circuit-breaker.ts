/**
 * Autopilot circuit breaker.
 *
 * Listens to bus events for operationally suspicious failures and pauses
 * Autopilot globally when thresholds trip. Surfaces a structured Issue
 * (deduped, so repeated tripping doesn't spam the inbox) so the user can
 * see what happened on /inbox and click "Resume" once they've fixed it.
 *
 * Trip conditions (any one breaks the circuit):
 *   - 2× consecutive `apply-linkedin` task failures within the same session
 *   - profile.yml YAML parse error reported on the bus
 *   - cv.md missing reported on the bus
 *
 * Resolution: the user clicks "Resume autopilot" on the issue (which calls
 * resumeAutopilot()), or directly toggles globalEnabled back on from the
 * Autopilot page. Either path clears the dedupeKey'd issue on next trip.
 *
 * Idempotent: installCircuitBreaker() can be called multiple times safely
 * (only the first call wires the bus listener).
 */

import fs from 'node:fs';
import { installBusListener, logEvent } from './events';
import { readConfig, writeConfig } from './autopilot';
import { reportIssue, listOpenIssues, resolveIssue } from './issues';
import { activePath } from './profile-paths';
import type { ActivityEvent } from '$lib/types';

const DEDUPE_KEY = 'autopilot-circuit-breaker';

let consecutiveLinkedInFailures = 0;

/** Common helper: pause Autopilot, write the issue, log the event. */
function trip(reason: string, detail: string, fix?: { label: string; href: string }): void {
  const cfg = readConfig();
  if (cfg.globalEnabled) {
    writeConfig({ ...cfg, globalEnabled: false });
  }
  reportIssue({
    severity: 'error',
    source: 'autopilot',
    summary: 'Autopilot paused: ' + reason,
    detail,
    fix: fix ?? { label: 'Open Autopilot', href: '/autopilot' },
    dedupeKey: DEDUPE_KEY,
  });
  logEvent('autopilot', 'Circuit breaker tripped', {
    level: 'error',
    category: 'system',
    message: reason,
  });
  // Reset the LinkedIn counter so a re-enable + new failure starts fresh.
  consecutiveLinkedInFailures = 0;
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

function checkPreflight(): void {
  // Boot-time sanity check — if the user-layer essentials are missing the
  // autopilot has nothing to apply with, so trip pre-emptively. Scoped to
  // the active profile.
  const cvPath = activePath('cv-md');
  const profileYml = activePath('profile-yml');
  if (!fs.existsSync(cvPath)) {
    trip(
      'cv.md is missing',
      'The autopilot needs your CV to generate tailored applications. Add cv.md via /profile.',
      { label: 'Onboarding guide', href: '/help' },
    );
    return;
  }
  if (fs.existsSync(profileYml)) {
    try {
      const txt = fs.readFileSync(profileYml, 'utf8');
      // Trivial syntactic check: profile.yml should not be empty and should
      // contain at least one top-level key.
      if (!txt.trim() || !/^[a-zA-Z_]/m.test(txt)) {
        trip(
          'profile.yml looks empty or invalid',
          'The autopilot reads config/profile.yml for archetypes, comp targets, and location policy. Fill it in or restore from profile.example.yml.',
          { label: 'Open Profile', href: '/profile' },
        );
      }
    } catch (e) {
      trip('profile.yml could not be read', e instanceof Error ? e.message : String(e), {
        label: 'Open Profile',
        href: '/profile',
      });
    }
  }
}

function onEvent(ev: ActivityEvent): void {
  // LinkedIn streak tracking
  if (isLinkedInFailure(ev)) {
    consecutiveLinkedInFailures += 1;
    if (consecutiveLinkedInFailures >= 2) {
      trip(
        'LinkedIn Easy Apply failed twice in a row',
        'Two consecutive runs of `apply-linkedin` errored. Common causes: expired LinkedIn cookies, profile/CV mismatch, or LinkedIn rate-limit. Check the activity feed for the underlying messages, fix the cause, then resume.',
        { label: 'Open Autopilot', href: '/autopilot' },
      );
    }
    return;
  }
  if (isLinkedInSuccess(ev)) {
    consecutiveLinkedInFailures = 0;
    return;
  }

  // Per-event triggers
  if (isProfileYamlError(ev)) {
    trip(
      'profile.yml failed to parse',
      ev.message ??
        'YAML parser raised an error reading config/profile.yml. Fix the syntax and resume.',
      { label: 'Open Profile', href: '/profile' },
    );
    return;
  }
}

/** Manually clear the circuit-breaker issue and re-enable autopilot. */
export function resumeAutopilot(): { ok: boolean; resolved: boolean } {
  const cfg = readConfig();
  if (!cfg.globalEnabled) writeConfig({ ...cfg, globalEnabled: true });
  consecutiveLinkedInFailures = 0;
  // Mark the open circuit-breaker issue resolved so the inbox banner clears.
  const open = listOpenIssues().find((i) => i.dedupeKey === DEDUPE_KEY);
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
  // Defer preflight by a tick so other boot logging stays first.
  setTimeout(checkPreflight, 1500);
}

installCircuitBreaker();
