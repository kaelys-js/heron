import { wrap, badRequest } from '$lib/server/api-helpers';
import { readProfile, writeProfile, type ProfileEdit } from '$lib/server/profile';
import { logEvent } from '$lib/server/events';

export const GET = wrap('profile', async () => readProfile());

export const POST = wrap('profile', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as ProfileEdit | null;
  if (!body || typeof body !== 'object') badRequest('expected JSON profile patch');
  const next = writeProfile(body);
  logEvent('profile', 'Profile updated', { level: 'success', category: 'user' });
  return next;
});
