/**
 * GET/PUT /api/backup/config — read or update retention settings. Owner-only.
 *
 * Retention is install-wide (every user's data is captured by the same
 * cadence), so editing the policy is the owner's job.
 *
 * GET → { retentionDays }
 * PUT { retentionDays } → updated config (clamped to [1, 365])
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { requireOwner } from '$lib/server/auth-helpers';
import { readBackupConfig, writeBackupConfig } from '$lib/server/backup';

export const GET = wrap('backup-config', async ({ locals }: { locals: App.Locals }) => {
  requireOwner(locals);
  return readBackupConfig();
});

export const PUT = wrap(
  'backup-config',
  async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    requireOwner(locals);
    const body = await request.json().catch(() => ({}));
    const days = Number(body?.retentionDays);
    if (!Number.isFinite(days) || days < 1) {
      badRequest('retentionDays must be a positive number');
    }
    return writeBackupConfig({ retentionDays: days });
  },
);
