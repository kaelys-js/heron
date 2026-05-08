import { json, error } from '@sveltejs/kit';
import { chat } from '$lib/server/ai';
import { readSafe, ROOT } from '$lib/server/files';
import path from 'node:path';
import { logEvent } from '$lib/server/events';

export const POST = async ({ request }) => {
  const { reportFile, history, persona } = await request.json();
  if (!reportFile) throw error(400, 'reportFile required');
  const report = readSafe(path.join(ROOT, 'reports', reportFile));
  const cv = readSafe(path.join(ROOT, 'cv.md'));
  const mode = readSafe(path.join(ROOT, 'modes', 'mock-interview.md'));
  const personaName = persona ?? 'Hiring Manager';
  const sys = 'You are conducting a mock interview as the ' + personaName + ' for the role described in the report below. Follow the mock-interview mode protocol exactly.\n\n' + mode + '\n\n# Job Report\n' + report + '\n\n# Candidate CV\n' + cv.slice(0, 2500) + '\n\nAfter EACH candidate response, give a brief evaluator note (score 1-5, what worked, what to improve, stronger phrasing). Then ask the next question. Begin the interview with your FIRST question if history is empty.';
  try {
    const reply = await chat(sys, history ?? [], { model: 'claude-sonnet-4-6', maxTokens: 2000, thinking: true });
    return json({ ok: true, reply });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logEvent('mock-interview', 'Mock interview failed', { level: 'error', category: 'task', message: msg });
    return json({ ok: false, error: msg }, { status: 500 });
  }
};
