/**
 * Read/write install-wide env settings.
 *
 * .env holds Anthropic / Gemini / Adzuna API keys, Gmail IMAP credentials,
 * etc. These are SHARED across every user on this install (the install
 * owner pays for them), so:
 *
 *   GET  → owner-only (the masked values still reveal which keys exist)
 *   POST → owner-only (changes affect every user's spawned tasks)
 *
 * @module
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { requireOwner } from '$lib/server/auth-helpers';
import { readEnvMasked, writeEnv, loadEnv } from '$lib/server/env';
import { logEvent } from '$lib/server/events';

loadEnv();

export const GET = wrap('settings', async ({ locals }: { locals: App.Locals }) => {
  requireOwner(locals);
  return readEnvMasked();
});

export const POST = wrap(
  'settings',
  async ({ request, locals }: { request: Request; locals: App.Locals }) => {
    requireOwner(locals);
    const updates = await request.json().catch(() => null);
    if (!updates || typeof updates !== 'object') {
      badRequest('expected JSON object of env updates');
    }
    try {
      writeEnv(updates);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error('failed to write .env: ' + msg);
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
  },
);
