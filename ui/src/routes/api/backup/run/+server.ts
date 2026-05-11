/**
 * POST /api/backup/run — manual backup trigger.
 *
 * Wraps backup.ts:createBackup(). Returns the same shape as the autopilot
 * job result so the UI's Backups card can render a single "created"
 * confirmation regardless of which path triggered the run.
 */

import { wrap } from '$lib/server/api-helpers';
import { createBackup } from '$lib/server/backup';

export const POST = wrap('backup-run', async () => {
  return await createBackup();
});
