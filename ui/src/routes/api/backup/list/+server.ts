/**
 * GET /api/backup/list — every backup currently on disk, newest first.
 *
 * Sidecar metadata (file count, profile slugs, app version) is folded in
 * when present. The UI uses this to render the snapshots table on
 * /settings → Backups.
 */

import { wrap } from '$lib/server/api-helpers';
import { listBackups, readBackupConfig } from '$lib/server/backup';

export const GET = wrap('backup-list', async () => ({
  backups: listBackups(),
  config: readBackupConfig(),
}));
