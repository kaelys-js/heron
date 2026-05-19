/**
 * GET /api/backup/list -- every backup currently on disk, newest first.
 * Owner-only.
 *
 * Backups capture install-wide state; the list itself reveals filenames
 * (which can include user emails / profile names in the metadata), so
 * non-owners must not see it.
 *
 * Sidecar metadata (file count, profile slugs, app version) is folded in
 * when present. The UI uses this to render the snapshots table on
 * /settings → Backups.
 */

import { wrap } from '$lib/server/api-helpers';
import { requireOwner } from '$lib/server/auth-helpers';
import { listBackups, readBackupConfig } from '$lib/server/backup';

export const GET = wrap('backup-list', async ({ locals }: { locals: App.Locals }) => {
  requireOwner(locals);
  return {
    backups: listBackups(),
    config: readBackupConfig(),
  };
});
