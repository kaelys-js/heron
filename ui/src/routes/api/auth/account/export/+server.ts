/**
 * GET /api/auth/account/export → application/json
 *
 * GDPR data export. Streams a single self-contained JSON document with:
 *   • every per-user row across auth.db + app.db
 *   • the entire data/users/{userId}/ filesystem tree (base64-encoded)
 *
 * The client offers it as a download named
 * "career-ops-export-{userId}-{date}.json".
 */
import { json } from '@sveltejs/kit';
import { requireUserId } from '$lib/server/auth-helpers';
import { buildExport } from '$lib/server/account-lifecycle';
import { recordAuditEvent } from '$lib/server/audit-log';
import { logEvent } from '$lib/server/events';

export const GET = async ({ locals }: { locals: App.Locals }) => {
  const userId = requireUserId(locals);
  const payload = buildExport(userId);
  recordAuditEvent('data-exported', { userId });
  logEvent('account-export', 'Account data exported', { level: 'info', category: 'user' });
  const date = new Date().toISOString().slice(0, 10);
  return json(payload, {
    headers: {
      'Content-Disposition': `attachment; filename="career-ops-export-${userId}-${date}.json"`,
    },
  });
};
