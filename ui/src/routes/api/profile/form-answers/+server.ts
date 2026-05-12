/**
 * /api/profile/form-answers — per-question cache CRUD.
 *
 *   GET    ?profile=slug              → list every answer for a profile
 *   POST   body { label, answer }     → upsert one answer
 *   DELETE body { key }               → delete one answer
 *
 * The cache lives at data/profiles/{slug}/form-answers-cache.jsonl and is
 * READ by apply-greenhouse.py + apply-ashby.py at form-fill time. Future
 * adapters (Lever, Workable, Workday, Indeed, …) should use the same
 * lib_apply.load_form_answers() helper so the cache is portal-agnostic.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import {
  listAnswers,
  saveAnswer,
  deleteAnswer,
  normalizeQuestion,
  cacheStats,
} from '$lib/server/form-answers-cache';
import { getActiveProfileId } from '$lib/server/profiles';

function resolveProfileId(url: URL): string {
  const q = url.searchParams.get('profile');
  if (q && q !== 'all') return q;
  return getActiveProfileId();
}

export const GET = wrap('form-answers-cache', async ({ url }: { url: URL }) => {
  const profileId = resolveProfileId(url);
  return {
    profileId,
    answers: listAnswers(profileId),
    stats: cacheStats(profileId),
  };
});

export const POST = wrap(
  'form-answers-cache',
  async ({ request, url }: { request: Request; url: URL }) => {
    const profileId = resolveProfileId(url);
    const body = await request.json().catch(() => ({}));
    const label = typeof body?.label === 'string' ? body.label : '';
    const answer = typeof body?.answer === 'string' ? body.answer : '';
    if (!label.trim()) badRequest('label required');
    if (!answer.trim()) badRequest('answer required');
    const row = saveAnswer(profileId, label, answer);
    return { ok: true, row };
  },
);

export const DELETE = wrap('form-answers-cache', async ({ url }: { url: URL }) => {
  // The shared api.delete client doesn't ship a body, so we accept `key`
  // as a query parameter instead. Belt-and-suspenders: also accept body
  // from raw fetch callers (e.g. curl).
  const profileId = resolveProfileId(url);
  const key = url.searchParams.get('key') ?? '';
  if (!key.trim()) badRequest('key required');
  const ok = deleteAnswer(profileId, key);
  return { ok };
});

// Helper endpoint so the inbox + JobActions UIs can normalize a question
// label client-side without duplicating the regex.
export const PATCH = wrap('form-answers-cache', async ({ request }: { request: Request }) => {
  const body = await request.json().catch(() => ({}));
  const label = typeof body?.label === 'string' ? body.label : '';
  return { key: normalizeQuestion(label) };
});
