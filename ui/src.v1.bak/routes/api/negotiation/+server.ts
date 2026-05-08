import { json, error } from '@sveltejs/kit';
import { generateNegotiationBrief } from '$lib/server/interview';
import { logEvent } from '$lib/server/events';

export const POST = async ({ request }) => {
  const { reportFile, offer } = await request.json();
  if (!reportFile || !offer) throw error(400, 'reportFile + offer required');
  try {
    logEvent('negotiation', `generating brief for ${reportFile}`);
    const md = await generateNegotiationBrief(`reports/${reportFile}`, offer);
    logEvent('negotiation', `brief ready`, 'success');
    return json({ ok: true, content: md });
  } catch (e: any) {
    logEvent('negotiation', `failed: ${e.message}`, 'error');
    return json({ ok: false, error: e.message }, { status: 500 });
  }
};
