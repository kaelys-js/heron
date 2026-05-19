/**
 * /settings -- page loader.
 *
 * Returns env (masked) + backup list + backup-retention config. Owner-only
 * (F23) because:
 *   - `readEnvMasked()` reveals which credentials the OWNER configured
 *     (Anthropic, Gemini, Adzuna, Gmail-IMAP, etc.). Even masked, the
 *     presence/absence of each key is sensitive: it tells a member-role
 *     user how the install is wired.
 *   - `listBackups()` returns filenames with ISO timestamps + per-profile
 *     metadata across every user. A member could enumerate other users'
 *     profile slugs.
 *
 * The corresponding API endpoints (`/api/backup/*`, `/api/settings/*`)
 * already call `requireOwner` -- this loader was the only un-gated path
 * to the same data. Members hitting /settings get a 403 (better than
 * silently rendering an empty page).
 */
import { readEnvMasked, loadEnv } from '$lib/server/env';
import { listBackups, readBackupConfig } from '$lib/server/backup';
import { requireOwnerOrAdmin } from '$lib/server/auth-helpers';
loadEnv();
export async function load({ locals }: { locals: App.Locals }) {
  // F23 -- gate to owner/admin. requireOwnerOrAdmin throws 403 if the
  // requesting user doesn't have the role. The matching API endpoints
  // (/api/backup/*, /api/settings/*) already enforce this; this is the
  // last un-gated path to the same data.
  requireOwnerOrAdmin(locals);
  return {
    env: readEnvMasked(),
    // Seed the Backups card with the current snapshot list + retention
    // config so it renders without a separate /api/backup/list round-trip
    // on first paint.
    backups: listBackups(),
    backupConfig: readBackupConfig(),
  };
}
