/**
 * Onboarding layout loader — bypasses the parent +layout.server.ts's
 * fresh-install redirect (otherwise the redirect would catch every step
 * and infinite-loop). Loads the current onboarding state so the sidebar
 * progress indicator and the Welcome step's resume hint can render.
 *
 * Also silently seeds `modes/_profile.md` from the bundled template the
 * first time the wizard loads. The template is generic enough that the
 * user can leave it untouched; advanced users can edit it later from the
 * Profile page. This belongs in the layout (not a single step) so any
 * entry point into the wizard triggers the seed once.
 */

import fs from 'node:fs';
import path from 'node:path';
import { readOnboarding, progressSummary } from '$lib/server/onboarding';
import { ROOT } from '$lib/server/files';

const PROFILE_MD = path.join(ROOT, 'modes', '_profile.md');
const PROFILE_TEMPLATE = path.join(ROOT, 'modes', '_profile.template.md');

function seedProfileMd(): void {
  if (fs.existsSync(PROFILE_MD)) return;
  if (!fs.existsSync(PROFILE_TEMPLATE)) return;
  try {
    fs.mkdirSync(path.dirname(PROFILE_MD), { recursive: true });
    fs.copyFileSync(PROFILE_TEMPLATE, PROFILE_MD);
  } catch {
    // Non-fatal — wizard still works without _profile.md, the user can
    // populate it later from /profile.
  }
}

export async function load() {
  seedProfileMd();
  const state = readOnboarding();
  const progress = progressSummary();
  return { state, progress };
}

// Tell SvelteKit to NOT inherit parent layout data — we don't need
// inboxCount / queueCount / pinnedJobs in the wizard.
