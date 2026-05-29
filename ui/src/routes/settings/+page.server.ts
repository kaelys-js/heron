/** /settings loader -- masked env + backup list + retention config.
 *  Owner-only (F23): readEnvMasked() leaks which install-wide creds
 *  the owner has configured (presence/absence is itself sensitive);
 *  listBackups() returns ISO-timestamped filenames + per-profile metadata
 *  across every user, letting a member enumerate other users' slugs.
 *  Matching /api/backup/* + /api/settings/* already requireOwner -- this
 *  loader was the last un-gated path. Members get 403. */
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
