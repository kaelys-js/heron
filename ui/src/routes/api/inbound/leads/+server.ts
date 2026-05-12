/**
 * GET /api/inbound/leads
 *   query params: ?kind=real-role|mass-blast|... (optional filter)
 *                 ?state=new|reviewed|... (optional filter)
 *
 * Returns the full inbound-leads list with thread state attached.
 * Powers the new Inbox tab + the per-lead detail page.
 */

import { wrap } from '$lib/server/api-helpers';
import {
  listLeads,
  getThread,
  getDraftPath,
  type InboundLead,
  type InboundThread,
} from '$lib/server/inbound-leads';

type LeadWithThread = InboundLead & {
  thread: InboundThread | null;
  /** Path on disk to the latest drafted reply. Omitted when there is none. */
  draftFile?: string;
};

export const GET = wrap('inbound-leads', async ({ url }: { url: URL }) => {
  const kindFilter = url.searchParams.get('kind') ?? undefined;
  const stateFilter = url.searchParams.get('state') ?? undefined;
  const leads = listLeads();
  const out: LeadWithThread[] = [];
  for (const l of leads) {
    if (kindFilter && l.kind !== kindFilter) continue;
    const thread = getThread(l.id) ?? null;
    if (stateFilter && thread?.state !== stateFilter) continue;
    const draft = getDraftPath(l.id);
    const entry: LeadWithThread = { ...l, thread };
    if (draft) entry.draftFile = draft;
    out.push(entry);
  }
  return { ok: true, leads: out };
});
