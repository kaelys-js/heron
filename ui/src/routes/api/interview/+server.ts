import { json, error } from '@sveltejs/kit';
import { generateInterviewPrep } from '$lib/server/interview';
import { logEvent } from '$lib/server/events';

export const POST = async ({ request }) => {
  const { reportFile, archetype } = await request.json();
  if (!reportFile) throw error(400, 'reportFile required');
  try {
    logEvent('interview', 'Generating interview prep', { category: 'task', message: reportFile });
    const md = await generateInterviewPrep(reportFile, archetype);
    logEvent('interview', 'Interview prep ready', { level: 'success', category: 'task', message: reportFile });
    return json({ ok: true, content: md });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logEvent('interview', 'Interview prep failed', { level: 'error', category: 'task', message: msg });
    return json({ ok: false, error: msg }, { status: 500 });
  }
};
