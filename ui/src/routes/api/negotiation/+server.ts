import { json, error } from '@sveltejs/kit';
import { generateNegotiationBrief } from '$lib/server/interview';
import { logEvent } from '$lib/server/events';

export const POST = async ({ request }) => {
  const { reportFile, offer } = await request.json();
  if (!reportFile || !offer) throw error(400, 'reportFile + offer required');
  try {
    const md = await generateNegotiationBrief(reportFile, offer);
    logEvent('negotiation', 'Negotiation brief ready', { level: 'success', category: 'task', message: reportFile });
    return json({ ok: true, content: md });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logEvent('negotiation', 'Negotiation brief failed', { level: 'error', category: 'task', message: msg });
    return json({ ok: false, error: msg }, { status: 500 });
  }
};
