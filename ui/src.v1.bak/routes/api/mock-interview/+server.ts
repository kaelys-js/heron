import { json, error } from '@sveltejs/kit';
import { chat } from '$lib/server/ai';
import { readSafe } from '$lib/server/files';
import { ROOT } from '$lib/server/files';
import path from 'node:path';
import { logEvent } from '$lib/server/events';

export const POST = async ({ request }) => {
  const { reportFile, history, persona } = await request.json();
  if (!reportFile) throw error(400, 'reportFile required');

  const report = readSafe(path.join(ROOT, 'reports', reportFile));
  const cv = readSafe(path.join(ROOT, 'cv.md'));
  const mode = readSafe(path.join(ROOT, 'modes', 'mock-interview.md'));

  const personaName = persona ?? 'Hiring Manager';

  const systemPrompt = `You are conducting a mock interview as the ${personaName} for the role described in the report below. Follow the mock-interview mode protocol exactly.

${mode}

# Job Report (A-G evaluation)
${report}

# Candidate CV
${cv.slice(0, 2500)}

You are interviewing the candidate now. After EACH candidate response, ALWAYS provide a brief evaluator note (score 1-5, what worked, what to improve, stronger phrasing). Then ask the next question.

Begin the interview with your FIRST question if history is empty.`;

  try {
    const reply = await chat(systemPrompt, history ?? [], { maxTokens: 1500 });
    logEvent('mock-interview', `turn ok (${(history ?? []).length} prior)`);
    return json({ ok: true, reply });
  } catch (e: any) {
    logEvent('mock-interview', `failed: ${e.message}`, 'error');
    return json({ ok: false, error: e.message }, { status: 500 });
  }
};
