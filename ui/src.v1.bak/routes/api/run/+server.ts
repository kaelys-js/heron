import { json } from '@sveltejs/kit';
import { runScan, runGemini, runLinkedInApply, runLinkedInLogin, listRunning } from '$lib/server/orchestrator';

export const GET = async () => json({ running: listRunning() });

export const POST = async ({ request }) => {
  const { task, autoSubmit } = await request.json();
  switch (task) {
    case 'scan': runScan(); break;
    case 'gemini': runGemini(); break;
    case 'apply-linkedin': runLinkedInApply(!!autoSubmit); break;
    case 'apply-linkedin-login': runLinkedInLogin(); break;
    default: return json({ error: 'unknown task' }, { status: 400 });
  }
  return json({ ok: true, running: listRunning() });
};
