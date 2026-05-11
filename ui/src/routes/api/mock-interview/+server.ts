import { json, error } from '@sveltejs/kit';
import { chat } from '$lib/server/ai';
import { readSafe, ROOT } from '$lib/server/files';
import { profilePath } from '$lib/server/profile-paths';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';
import path from 'node:path';
import { logEvent } from '$lib/server/events';

export const POST = async ({ request, url }) => {
  const { reportFile, history, persona } = await request.json();
  if (!reportFile) throw error(400, 'reportFile required');
  // Profile resolution: caller can pass ?profile=<slug>; else fall back to active.
  // The report file is per-profile (lives under data/profiles/{id}/reports/) — so
  // is the CV, since each profile has its own narrative + experience pitch.
  const queryProfile = url.searchParams.get('profile');
  const profileId = queryProfile && getProfile(queryProfile) ? queryProfile : getActiveProfileId();
  const report = readSafe(path.join(profilePath(profileId, 'reports-dir'), reportFile));
  const cv = readSafe(profilePath(profileId, 'cv-md'));
  // The mock-interview mode template is system-layer (shared); stays at modes/.
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
