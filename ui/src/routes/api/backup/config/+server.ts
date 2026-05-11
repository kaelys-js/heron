/**
 * GET/PUT /api/backup/config — read or update retention settings.
 *
 * GET → { retentionDays }
 * PUT { retentionDays } → updated config (clamped to [1, 365])
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { readBackupConfig, writeBackupConfig } from '$lib/server/backup';

export const GET = wrap('backup-config', async () => readBackupConfig());

export const PUT = wrap('backup-config', async ({ request }: { request: Request }) => {
  const body = await request.json().catch(() => ({}));
  const days = Number(body?.retentionDays);
  if (!Number.isFinite(days) || days < 1) {
    badRequest('retentionDays must be a positive number');
  }
  return writeBackupConfig({ retentionDays: days });
});
