import fs from 'node:fs';
import { json, error } from '@sveltejs/kit';
import { chat } from '$lib/server/ai';
import { readSafe } from '$lib/server/files';
import { profilePath } from '$lib/server/profile-paths';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';
import { modesPathFor } from '$lib/server/modes';
import path from 'node:path';
import { logEvent } from '$lib/server/events';

/**
 * Persist the rolling chat history per (profile, job) so page reloads
 * resume the conversation instead of starting over (P7). The bookkeeping
 * is shared with the rest of interview-prep — same profile dir, same
 * cleanup story (reset 'jobs' or 'everything' wipes it).
 */
function historyPath(profileId: string, jobId: string): string {
  const dir = profilePath(profileId, 'interview-prep-dir');
  return path.join(dir, slugifyJobId(jobId) + '-mock-history.json');
}
function slugifyJobId(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'job';
}

type ChatTurn = { role: 'user' | 'assistant'; content: string };
function readPersistedHistory(profileId: string, jobId: string | undefined): ChatTurn[] | null {
  if (!jobId) return null;
  try {
    const p = historyPath(profileId, jobId);
    if (!fs.existsSync(p)) return null;
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(parsed) ? (parsed as ChatTurn[]) : null;
  } catch { return null; }
}
function writePersistedHistory(profileId: string, jobId: string | undefined, history: ChatTurn[]): void {
  if (!jobId) return;
  try {
    const p = historyPath(profileId, jobId);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(history, null, 2) + '\n');
  } catch { /* persistence is best-effort */ }
}

export const POST = async ({ request, url }) => {
  const { reportFile, history, persona, jobId } = await request.json();
  if (!reportFile) throw error(400, 'reportFile required');
  // Profile resolution: caller can pass ?profile=<slug>; else fall back to active.
  // The report file is per-profile (lives under data/profiles/{id}/reports/) — so
  // is the CV, since each profile has its own narrative + experience pitch.
  const queryProfile = url.searchParams.get('profile');
  const profileId = queryProfile && getProfile(queryProfile) ? queryProfile : getActiveProfileId();
  const report = readSafe(path.join(profilePath(profileId, 'reports-dir'), reportFile));
  const cv = readSafe(profilePath(profileId, 'cv-md'));
  // The mock-interview mode template — language follows profile.yml.language.modes_dir.
  // Re-read each request so a language change takes effect without server restart;
  // the fs cost is negligible per-turn vs the LLM round trip (cf. P17 note).
  const mode = readSafe(modesPathFor('mock-interview.md', profileId));
  const personaName = persona ?? 'Hiring Manager';
  const sys = 'You are conducting a mock interview as the ' + personaName + ' for the role described in the report below. Follow the mock-interview mode protocol exactly.\n\n' + mode + '\n\n# Job Report\n' + report + '\n\n# Candidate CV\n' + cv.slice(0, 2500) + '\n\nAfter EACH candidate response, give a brief evaluator note (score 1-5, what worked, what to improve, stronger phrasing). Then ask the next question. Begin the interview with your FIRST question if history is empty.';
  try {
    // P7: if the client passes an empty history but a jobId exists, hydrate
    // from disk so page reloads resume the previous conversation.
    let effectiveHistory: ChatTurn[] = Array.isArray(history) ? (history as ChatTurn[]) : [];
    if (effectiveHistory.length === 0 && jobId) {
      const persisted = readPersistedHistory(profileId, jobId);
      if (persisted && persisted.length > 0) effectiveHistory = persisted;
    }
    const reply = await chat(sys, effectiveHistory, { model: 'claude-sonnet-4-6', maxTokens: 2000, thinking: true });
    // Persist the rolling history (client-supplied turns + the new assistant
    // reply). Bounded — the file balloons otherwise on long sessions.
    if (jobId) {
      const lastUser = effectiveHistory[effectiveHistory.length - 1];
      const nextHistory: ChatTurn[] = lastUser && lastUser.role === 'user'
        ? [...effectiveHistory, { role: 'assistant', content: reply }]
        : [{ role: 'assistant', content: reply }, ...effectiveHistory];
      // Keep at most the last 40 turns to bound disk size.
      writePersistedHistory(profileId, jobId, nextHistory.slice(-40));
    }
    return json({ ok: true, reply, persistedTurns: jobId ? readPersistedHistory(profileId, jobId)?.length ?? 0 : 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logEvent('mock-interview', 'Mock interview failed', { level: 'error', category: 'task', message: msg });
    return json({ ok: false, error: msg }, { status: 500 });
  }
};

/** GET /api/mock-interview?jobId=...&profile=... → returns persisted
 *  history so the chat UI can rehydrate without firing a new turn. */
export const GET = async ({ url }) => {
  const jobId = url.searchParams.get('jobId');
  if (!jobId) return json({ history: [] });
  const queryProfile = url.searchParams.get('profile');
  const profileId = queryProfile && getProfile(queryProfile) ? queryProfile : getActiveProfileId();
  const persisted = readPersistedHistory(profileId, jobId);
  return json({ history: persisted ?? [] });
};
