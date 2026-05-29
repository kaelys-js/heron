/**
 * /api/ui-prefs -- read + patch the per-machine UI preferences.
 *
 * GET → UiPrefs (appearance / theme / displayName / avatarPath / notifications)
 * PATCH body: Partial<UiPrefs> → merged with current + persisted
 *
 * Multi-user support is OUT of scope today; this is per-machine.
 */

import { wrap } from '$lib/server/api-helpers';
import { readPrefs, writePrefs } from '$lib/server/ui-prefs';
import type { UiPrefs } from '$lib/server/ui-prefs';

export const GET = wrap('ui-prefs', async () => readPrefs());

export const PATCH = wrap('ui-prefs', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => ({}))) as Partial<UiPrefs>;
  return writePrefs(body);
});
