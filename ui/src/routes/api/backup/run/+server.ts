/**
 * POST /api/backup/run — manual backup trigger. Owner-only.
 *
 * Backups capture install-wide state (every user's per-user tree, the
 * auth.db, the app.db). Non-owners must not be able to trigger or read
 * back the resulting tarball.
 */

import { wrap } from '$lib/server/api-helpers';
import { requireOwner } from '$lib/server/auth-helpers';
import { createBackup } from '$lib/server/backup';

export const POST = wrap('backup-run', async ({ locals }: { locals: App.Locals }) => {
  requireOwner(locals);
  return await createBackup();
});
