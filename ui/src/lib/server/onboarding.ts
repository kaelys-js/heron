/**
 * Onboarding state — tracks which wizard steps the user has completed,
 * powers the first-run redirect at the layout level.
 *
 * State at `data/onboarding-state.json` — gitignored runtime data.
 *
 * Two distinct concepts:
 *   - `completed: true`  — user has been through the wizard at least once.
 *                           Don't redirect them again, even if they later
 *                           delete files manually. Trust the user.
 *   - `isFreshInstall()` — a NEVER-completed install where the required
 *                           config files are missing. Redirects to /onboarding.
 *
 * Why this split: a power user who manually populates cv.md / profile.yml
 * and clicks "Skip onboarding" on the welcome page should get
 * `completed: true` set without going through every step. They never see
 * the wizard again, even though their state.completedSteps is short.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';
import { activePath, userSharedPath } from './profile-paths';
import { reportServerError } from './events';
import { readEnv } from './env';

/** Per-user onboarding state path. Multi-user installs: each user
 *  gets their own wizard state — Alice can be at step 3 while Bob is
 *  at step 6. Resolved lazily so AsyncLocalStorage's current-user
 *  context is honored. */
function statePath(): string {
  return userSharedPath('onboarding-state');
}

export const STEPS = [
  // Multi-user: pick the owner account (passkey / GitHub / invite code).
  // This is the FIRST step because every per-user piece of data below
  // needs a `user_id` to attach to.
  'account',
  'welcome',
  'api-keys',
  'identity',
  'cv',
  'targeting',
  'sources',
  'first-scan',
  'done',
] as const;

export type OnboardingStep = (typeof STEPS)[number];

export type OnboardingState = {
  completed: boolean;
  /** ms timestamp when the user finished (or skipped) the wizard. */
  completedAt?: number;
  completedSteps: OnboardingStep[];
  /** Steps the user explicitly skipped — kept for analytics + the
   *  Done page's "you skipped these, finish them later via /sources" hint. */
  skippedSteps: OnboardingStep[];
  /** Last step the user landed on. Used to resume mid-wizard on refresh. */
  currentStep?: OnboardingStep;
};

const ZERO_STATE: OnboardingState = {
  completed: false,
  completedSteps: [],
  skippedSteps: [],
};

function ensureDir() {
  try {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true });
  } catch {
    // mkdir recursive only fails for permission/IO. Subsequent file
    // writes will surface the real error with the actual op name.
  }
}

export function readOnboarding(): OnboardingState {
  try {
    if (!fs.existsSync(statePath())) return { ...ZERO_STATE };
    const txt = fs.readFileSync(statePath(), 'utf8');
    if (!txt.trim()) return { ...ZERO_STATE };
    const parsed = JSON.parse(txt) as Partial<OnboardingState>;
    return {
      ...ZERO_STATE,
      ...parsed,
      completedSteps: Array.isArray(parsed.completedSteps) ? parsed.completedSteps : [],
      skippedSteps: Array.isArray(parsed.skippedSteps) ? parsed.skippedSteps : [],
    };
  } catch (e) {
    reportServerError('onboarding', 'Failed to read onboarding-state.json', e, {
      category: 'system',
    });
    return { ...ZERO_STATE };
  }
}

function writeOnboarding(state: OnboardingState): OnboardingState {
  ensureDir();
  try {
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2) + '\n');
  } catch (e) {
    reportServerError('onboarding', 'Failed to write onboarding-state.json', e, {
      category: 'system',
    });
  }
  return state;
}

/** Mark a step complete. Idempotent — re-marking is a no-op (no dupes
 *  in completedSteps). Also sets `currentStep` to the just-completed
 *  step's successor (so resume lands on the next pending one). */
export function markStepComplete(step: OnboardingStep): OnboardingState {
  const state = readOnboarding();
  if (!state.completedSteps.includes(step)) state.completedSteps.push(step);
  // Drop from skippedSteps if it had been skipped previously (user came back).
  state.skippedSteps = state.skippedSteps.filter((s) => s !== step);
  const idx = STEPS.indexOf(step);
  state.currentStep = idx >= 0 && idx + 1 < STEPS.length ? STEPS[idx + 1] : 'done';
  return writeOnboarding(state);
}

export function markStepSkipped(step: OnboardingStep): OnboardingState {
  const state = readOnboarding();
  if (!state.skippedSteps.includes(step)) state.skippedSteps.push(step);
  state.completedSteps = state.completedSteps.filter((s) => s !== step);
  const idx = STEPS.indexOf(step);
  state.currentStep = idx >= 0 && idx + 1 < STEPS.length ? STEPS[idx + 1] : 'done';
  return writeOnboarding(state);
}

/** Final flip: user has finished the wizard (or skipped via the welcome
 *  page's advanced-skip link). Subsequent visits don't redirect even if
 *  files are missing. */
export function markComplete(): OnboardingState {
  const state = readOnboarding();
  state.completed = true;
  state.completedAt = Date.now();
  state.currentStep = 'done';
  return writeOnboarding(state);
}

/** Reset everything — used by the "Re-run onboarding" Settings button.
 *  Only touches the state file; cv.md / profile.yml / etc are preserved. */
export function reset(): OnboardingState {
  return writeOnboarding({ ...ZERO_STATE });
}

/**
 * The crucial check: should the layout redirect this request to /onboarding?
 *
 * Returns true ONLY when the wizard hasn't been completed AND any of the
 * required-for-anything files is missing. Once `completed: true` is set
 * (even via the skip link), this never returns true again unless the
 * user explicitly resets.
 */
export function isFreshInstall(): boolean {
  const state = readOnboarding();
  if (state.completed) return false;

  // Required files for any Heron workflow to function. Each one would
  // cause a downstream feature to silently fail (or 500) if missing.
  const requiredFiles = [
    activePath('cv-md'), // cv.md — read by oferta + every CV-tailoring path
    activePath('profile-yml'), // profile.yml — every personalization read
    activePath('portals-yml'), // tracker company list + title filter
    activePath('profile-md'), // user-customisable mode fragment (per-profile)
  ];
  for (const p of requiredFiles) {
    if (!fs.existsSync(p)) return true;
  }

  // ANTHROPIC_API_KEY is also required for the deep-eval pipeline. Missing
  // key = onboarding incomplete.
  const env = readEnv();
  if (!env.ANTHROPIC_API_KEY) return true;

  return false;
}

/** Helper for the wizard's progress sidebar — returns step → status map
 *  in canonical order. */
export function progressSummary(): Array<{
  step: OnboardingStep;
  status: 'complete' | 'skipped' | 'current' | 'pending';
}> {
  const state = readOnboarding();
  return STEPS.map((step) => {
    if (state.completedSteps.includes(step)) return { step, status: 'complete' as const };
    if (state.skippedSteps.includes(step)) return { step, status: 'skipped' as const };
    if (state.currentStep === step) return { step, status: 'current' as const };
    return { step, status: 'pending' as const };
  });
}
