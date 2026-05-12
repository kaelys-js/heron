/**
 * POST /api/linkedin/audit/fix
 *   body: { kind: string }
 *   → marks a finding as resolved. The next re-run of the audit will
 *     re-introduce the finding if the issue still exists, so this is a
 *     "stop nagging me" toggle, not a denial of reality.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { markFindingResolved } from '$lib/server/linkedin-audit';
import { logEvent } from '$lib/server/events';

export const POST = wrap('linkedin-audit-fix', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as { kind?: string };
  if (!body.kind) badRequest('kind is required');
  const updated = markFindingResolved(body.kind!);
  if (!updated) return { ok: false, error: 'No audit report on disk' };
  logEvent('linkedin-audit', 'Finding resolved · ' + body.kind, {
    level: 'success',
    category: 'user',
    message: 'grade now ' + updated.grade + '/100',
  });
  return { ok: true, report: updated };
});
