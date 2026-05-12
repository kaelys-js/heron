/**
 * POST /api/backup/restore — restore from a specific snapshot. Owner-only.
 *
 * A restore overwrites EVERY user's data. Members and admins cannot
 * trigger this — only the install owner.
 *
 * Body: { id: string }
 *
 * Safety: refuses while any orchestrator task is running. Always snapshots
 * the live state into .pre-restore-{id}/ before overwriting so the user
 * can roll back even if the restored data is also wrong.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { requireOwner } from '$lib/server/auth-helpers';
import { restoreBackup } from '$lib/server/backup';

export const POST = wrap(
  'backup-restore',
  async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    requireOwner(locals);
    const body = await request.json().catch(() => ({}));
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!id) badRequest('id required');
    return await restoreBackup(id);
  },
);
