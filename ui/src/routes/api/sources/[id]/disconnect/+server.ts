/**
 * POST /api/sources/[id]/disconnect -- remove credentials/session.
 *
 *   linkedin-auth / indeed-auth → rm -rf .playwright-{portal}/ + reset state
 *   gmail-imap                  → wipe the GMAIL_IMAP_* keys from .env + reset state
 *   anthropic / gemini / adzuna → just reset the source state (the user can
 *                                  edit the .env key on /settings if they
 *                                  also want to remove it; we don't auto-wipe
 *                                  since the same key may be used elsewhere)
 */

import fs from 'node:fs';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { resetSource } from '$lib/server/sources';
import { logEvent } from '$lib/server/events';
import { writeEnv, readEnv } from '$lib/server/env';
import { requireOwner, requireUserId } from '$lib/server/auth-helpers';
import { playwrightUserDataDir } from '$lib/server/profile-paths';

export const POST = wrap(
  'sources-disconnect',
  async ({ params, locals }: { params: { id: string }; locals: App.Locals }) => {
    requireOwner(locals);
    const userId = requireUserId(locals);
    const id = params.id;

    if (id === 'linkedin-auth' || id === 'indeed-auth') {
      const portal = id === 'linkedin-auth' ? 'linkedin' : 'indeed';
      // F20 -- use the same path Playwright writes to. Pre-fix this hit
      // the legacy repo-root `.playwright-{portal}/` which never
      // existed in multi-user mode, so "Disconnect" was a no-op.
      const stateDir = playwrightUserDataDir(userId, portal);
      try {
        if (fs.existsSync(stateDir)) {
          fs.rmSync(stateDir, { recursive: true, force: true });
        }
      } catch (err) {
        // Surface the error but continue -- state file reset is the primary effect.
        logEvent('sources', 'Could not remove ' + stateDir, {
          level: 'warn',
          category: 'system',
          message: err instanceof Error ? err.message : String(err),
        });
      }
      resetSource(id);
      return { ok: true, message: portal + ' disconnected · session removed' };
    }

    if (id === 'gmail-imap') {
      const env = readEnv();
      const next = { ...env };
      delete next.GMAIL_IMAP_HOST;
      delete next.GMAIL_IMAP_USER;
      delete next.GMAIL_IMAP_PASSWORD;
      delete next.GMAIL_IMAP_LABEL;
      writeEnv(next);
      resetSource(id);
      return { ok: true, message: 'Gmail IMAP disconnected · creds removed from .env' };
    }

    if (id === 'anthropic' || id === 'gemini' || id === 'adzuna') {
      // We don't wipe the key (other features may still use it). Just reset
      // the source-state record so the /sources card reverts to "Not connected".
      resetSource(id);
      return { ok: true, message: id + ' source state reset · API key preserved on /settings' };
    }

    badRequest('Unknown source id: ' + id);
  },
);
