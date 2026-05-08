import { json, error } from '@sveltejs/kit';
import { generateInterviewPrep } from '$lib/server/interview';
import { logEvent } from '$lib/server/events';

export const POST = async ({ request }) => {
  const { reportFile, archetype } = await request.json();
  if (!reportFile) throw error(400, 'reportFile required');
  try {
    logEvent('interview', `generating prep for ${reportFile}`);
    const md = await generateInterviewPrep(`reports/${reportFile}`, archetype);
    logEvent('interview', `prep ready (${md.length} chars)`, 'success');
    return json({ ok: true, content: md });
  } catch (e: any) {
    logEvent('interview', `failed: ${e.message}`, 'error');
    return json({ ok: false, error: e.message }, { status: 500 });
  }
};
