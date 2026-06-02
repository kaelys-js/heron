/**
 * Deterministic "Last updated" date for the generated legal pages
 * (ui/static/{privacy,support,terms}/index.html).
 *
 * These pages are emitted by apply-brand, which runs on every `pnpm dev`
 * startup (vite plugin) and in CI. The footer used to embed
 * `new Date().toISOString().slice(0,10)` -- TODAY -- so on any new day the three
 * files regenerated with a different date and left the working tree
 * permanently dirty (masking real diffs). The date now derives from the last
 * commit that touched the brand source, so it only changes when branding
 * actually changes, never just because the calendar advanced.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Pure: normalize a `git log --format=%cs` value (YYYY-MM-DD) or fall back.
 * Never returns today's date -- the fallback is fixed so non-git installs
 * (release tarballs) stay deterministic too.
 */
export function resolveLegalUpdated(gitDateRaw, fallback = '2026-01-01') {
  const d = String(gitDateRaw ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : fallback;
}

/**
 * The deterministic date string for the legal-page footers: the commit date of
 * the brand source (branding/brand.json). `root` is injectable for tests.
 */
export function legalUpdatedDate(root = REPO_ROOT) {
  let raw = '';
  try {
    raw = execSync('git log -1 --format=%cs -- branding/brand.json', {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // git absent / not a clone -> deterministic fallback (no churn).
  }
  return resolveLegalUpdated(raw);
}
