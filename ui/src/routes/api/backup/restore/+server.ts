/**
 * POST /api/backup/restore — restore from a specific snapshot.
 *
 * Body: { id: string }
 *
 * Safety: refuses while any orchestrator task is running. Always snapshots
 * the live state into .pre-restore-{id}/ before overwriting so the user
 * can roll back even if the restored data is also wrong.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { restoreBackup } from '$lib/server/backup';

export const POST = wrap('backup-restore', async ({ request }: { request: Request }) => {
  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) badRequest('id required');
  return await restoreBackup(id);
});
