/**
 * GET    /api/inbound/leads/[id]  -- fetch a single lead + thread state + draft
 * POST   /api/inbound/leads/[id]  -- body: { state, notes? } -- update thread state
 *
 * State transitions the dashboard uses:
 *   new → reviewed (when user opens the lead)
 *   drafted → sent (when user clicks "I sent this")
 *   sent → awaiting-reply (auto on send)
 *   any → closed (user dismisses)
 */

import fs from 'node:fs';
import path from 'node:path';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import {
  getLead,
  getThread,
  getDraftPath,
  setThreadState,
  recordUserReply,
  type InboundThreadState,
} from '$lib/server/inbound-leads';

const VALID_STATES: InboundThreadState[] = [
  'new',
  'reviewed',
  'drafted',
  'sent',
  'awaiting-reply',
  'engaged',
  'went-silent',
  'closed',
];

export const GET = wrap('inbound-lead', async ({ params }: { params: { id: string } }) => {
  const lead = getLead(params.id);
  if (!lead) badRequest('Lead not found: ' + params.id);
  const thread = getThread(params.id) ?? null;
  const draftPath = getDraftPath(params.id) ?? null;
  let draftContent: string | null = null;
  if (draftPath) {
    try {
      const full = path.isAbsolute(draftPath) ? draftPath : path.join(ROOT, draftPath);
      if (fs.existsSync(full)) draftContent = fs.readFileSync(full, 'utf8');
    } catch {}
  }
  return { ok: true, lead, thread, draftPath, draftContent };
});

export const POST = wrap(
  'inbound-lead',
  async ({ params, request }: { params: { id: string }; request: Request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      state?: InboundThreadState;
      markSent?: boolean;
    };
    if (body.markSent) {
      const t = recordUserReply(params.id);
      if (!t) badRequest('Lead/thread not found: ' + params.id);
      return { ok: true, thread: t };
    }
    if (!body.state || !VALID_STATES.includes(body.state)) {
      badRequest('state required (' + VALID_STATES.join(' / ') + ')');
    }
    const t = setThreadState(params.id, body.state!);
    if (!t) badRequest('Lead/thread not found: ' + params.id);
    return { ok: true, thread: t };
  },
);
