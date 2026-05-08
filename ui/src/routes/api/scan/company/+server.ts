/**
 * Per-company targeted scan.
 *
 * POST { company: string }  — runs scan.mjs --company <name> via the registry's
 *                              scan-portals job. Spawns the same Greenhouse/
 *                              Ashby/Lever direct API hits as the full portal
 *                              scan but limited to one company.
 *
 * Fire-and-forget — the activity feed reports completion + counts.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { runById } from '$lib/server/jobs';

export const POST = wrap('scan-company', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as { company?: string } | null;
  const company = body?.company?.trim();
  if (!company) badRequest('company required (non-empty string)');
  // Reuse scan-portals job with the company arg — keeps logging + after-trigger
  // chain (auto-triage fires after scan-portals success).
  runById('scan-portals', { company }).catch(() => {});
  return { ok: true, message: 'Scanning ' + company + ' — watch the activity feed.' };
});
