/**
 * POST /api/sources/[id]/connect — initiate the source-specific connect flow.
 *
 *   linkedin-auth / indeed-auth → spawns headed Playwright via the existing
 *                                  `python linkedin-easy-apply.py --login`
 *                                  pattern (extended to per-portal). User
 *                                  logs in on the desktop window; we poll
 *                                  the process exit and recordSuccess.
 *
 *   gmail-imap                  → expects { host, user, password, label } in
 *                                  body. Tests the connection synchronously,
 *                                  writes creds to .env on success, calls
 *                                  recordSuccess.
 *
 *   anthropic / gemini / adzuna → API-key sources. Re-validates the key (via
 *                                  /api/settings/test) and recordSuccess.
 *                                  The actual key is set on /settings.
 */

import { spawn } from 'node:child_process';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { recordSuccess, recordFailure } from '$lib/server/sources';
import { logEvent, reportServerError } from '$lib/server/events';
import { writeEnv, readEnv } from '$lib/server/env';

export const POST = wrap(
  'sources-connect',
  async ({ params, request }: { params: { id: string }; request: Request }) => {
    const id = params.id;
    const body = await request.json().catch(() => ({}));

    if (id === 'linkedin-auth' || id === 'indeed-auth') {
      // Both share the python wrapper. The script accepts --login + --portal
      // (added in Phase 2.1's refactor). For now we route LinkedIn through
      // the existing entry point and Indeed through the new one.
      const portal = id === 'linkedin-auth' ? 'linkedin' : 'indeed';
      try {
        await spawnPlaywrightLogin(portal);
        const meta = id === 'linkedin-auth' ? { portal: 'linkedin' } : { portal: 'indeed' };
        recordSuccess(id, meta);
        logEvent('sources', portal + ' connected', {
          level: 'success',
          category: 'system',
          message: 'Saved Playwright session at .playwright-' + portal + '/',
        });
        return { ok: true, message: portal + ' login confirmed.' };
      } catch (err) {
        recordFailure(id, err);
        reportServerError('sources', portal + ' login failed', err, { category: 'system' });
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }

    if (id === 'gmail-imap') {
      const { host, user, password, label } = body as Record<string, string>;
      if (!host || !user || !password) badRequest('host, user, password required');
      try {
        await testImapConnection(host, user, password, label || 'INBOX');
        const env = readEnv();
        writeEnv({
          ...env,
          GMAIL_IMAP_HOST: host,
          GMAIL_IMAP_USER: user,
          GMAIL_IMAP_PASSWORD: password,
          GMAIL_IMAP_LABEL: label || 'INBOX',
        });
        recordSuccess(id, { user, label: label || 'INBOX' });
        logEvent('sources', 'Gmail IMAP connected', {
          level: 'success',
          category: 'system',
          message: user + ' · label=' + (label || 'INBOX'),
        });
        return { ok: true, message: 'IMAP login verified · creds saved to .env' };
      } catch (err) {
        recordFailure(id, err);
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }

    if (id === 'anthropic' || id === 'gemini' || id === 'adzuna') {
      // Re-probe via the existing settings test endpoint logic. We just call
      // it inline so the source state updates atomically with the probe.
      try {
        await testApiKey(id);
        recordSuccess(id);
        return { ok: true, message: id + ' API probe succeeded.' };
      } catch (err) {
        recordFailure(id, err);
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }

    badRequest('Unknown source id: ' + id);
  },
);

// ── helpers ──────────────────────────────────────────────────────────

/**
 * Spawn the Python Playwright wrapper in headed mode. Resolves when the
 * subprocess exits with code 0 (login confirmed by URL check inside the
 * script). Rejects on non-zero exit OR after a 5-minute timeout — login
 * shouldn't take longer than that and a hung process is worse than a
 * surfaced error.
 */
function spawnPlaywrightLogin(portal: 'linkedin' | 'indeed'): Promise<void> {
  return new Promise((resolve, reject) => {
    const venvPython = ROOT + '/.venv/bin/python';
    const fs = require('node:fs') as typeof import('node:fs');
    const py = fs.existsSync(venvPython) ? venvPython : 'python3';

    // Both portals share the same auth helper module — exposes --login
    // for headed login and --check-session for read-only probe.
    const p = spawn(py, ['lib_playwright_auth.py', '--portal', portal, '--login'], {
      cwd: ROOT,
      env: { ...process.env },
    });

    let stdoutBuf = '';
    let stderrBuf = '';
    p.stdout?.on('data', (c: Buffer) => { stdoutBuf += c.toString(); });
    p.stderr?.on('data', (c: Buffer) => { stderrBuf += c.toString(); });

    const timer = setTimeout(() => {
      try { p.kill('SIGTERM'); } catch {}
      reject(new Error('Login timed out after 5 minutes'));
    }, 5 * 60_000);

    p.on('error', (err) => { clearTimeout(timer); reject(err); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      const tail = (stderrBuf || stdoutBuf || '').slice(-400).trim();
      reject(new Error('Login exited ' + code + (tail ? ': ' + tail : '')));
    });
  });
}

/**
 * One-shot IMAP login probe. Connects, selects mailbox, lists 1 message,
 * disconnects. Throws on auth failure or selector issues.
 */
async function testImapConnection(host: string, user: string, password: string, mailbox: string): Promise<void> {
  // Lazy-load imapflow so the module isn't required at boot for users who
  // never connect Gmail.
  const { ImapFlow } = await import('imapflow');
  const client = new ImapFlow({
    host,
    port: 993,
    secure: true,
    auth: { user, pass: password },
    logger: false,
  });
  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailbox);
    try {
      // Just verify the mailbox opens — don't actually fetch anything.
      await client.status(mailbox, { messages: true });
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch {}
  }
}

/** Probe an API key end-to-end (real round-trip, not just env presence —
 *  B13). Same probe the /api/settings/test endpoint runs. Throws on any
 *  non-2xx so the caller can flip Connect to failure. */
async function testApiKey(provider: 'anthropic' | 'gemini' | 'adzuna'): Promise<void> {
  const env = readEnv();
  if (provider === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 4,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    if (!r.ok) {
      const txt = await r.text();
      throw new Error('Anthropic ' + r.status + ': ' + txt.slice(0, 200));
    }
    return;
  }
  if (provider === 'gemini') {
    if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + env.GEMINI_API_KEY);
    if (!r.ok) throw new Error('Gemini ' + r.status);
    return;
  }
  if (provider === 'adzuna') {
    if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY) {
      throw new Error('ADZUNA_APP_ID and ADZUNA_APP_KEY required');
    }
    const u = 'https://api.adzuna.com/v1/api/jobs/gb/search/1?app_id=' + env.ADZUNA_APP_ID +
      '&app_key=' + env.ADZUNA_APP_KEY + '&results_per_page=1';
    const r = await fetch(u);
    if (!r.ok) throw new Error('Adzuna ' + r.status);
    return;
  }
}
