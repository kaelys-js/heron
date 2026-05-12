/**
 * /inbound — full inbound recruiter triage view.
 *
 * Lists every recruiter message (email + LinkedIn DM) with classifier
 * tag, thread state, age, and one-click "Open" link to the per-lead
 * detail page.
 */

import { listLeads, getThread, getDraftPath } from '$lib/server/inbound-leads';

export async function load() {
  const raw = listLeads();
  const leads = raw.map((l) => ({
    ...l,
    thread: getThread(l.id) ?? null,
    draftPath: getDraftPath(l.id) ?? null,
  }));
  return { leads };
}
