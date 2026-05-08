import { json } from '@sveltejs/kit';
import { readEnvMasked, writeEnv, loadEnv } from '$lib/server/env';
import { logEvent } from '$lib/server/events';

loadEnv();

export const GET = async () => json(readEnvMasked());

export const POST = async ({ request }) => {
  const updates = await request.json();
  writeEnv(updates);
  logEvent('settings', 'env vars updated');
  return json({ ok: true, current: readEnvMasked() });
};
