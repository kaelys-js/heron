/**
 * Read/write env settings.
 *
 * @module
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { readEnvMasked, writeEnv, loadEnv } from '$lib/server/env';
import { logEvent } from '$lib/server/events';

loadEnv();

export const GET = wrap('settings', async () => readEnvMasked());

export const POST = wrap('settings', async ({ request }: any) => {
  const updates = await request.json().catch(() => null);
  if (!updates || typeof updates !== 'object') {
    badRequest('expected JSON object of env updates');
  }
  try {
    writeEnv(updates);
  } catch (e: any) {
    throw new Error('failed to write .env: ' + (e?.message ?? String(e)));
  }
  const changedKeys = Object.keys(updates).filter(
    (k) => updates[k] && !String(updates[k]).startsWith('****'),
  );
  logEvent('settings', 'Settings updated', {
    level: 'success',
    category: 'user',
    message: changedKeys.length ? changedKeys.join(', ') + ' changed' : 'no key changes',
  });
  return { current: readEnvMasked() };
});
