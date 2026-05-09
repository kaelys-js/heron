/**
 * POST /api/sources/[id]/test — light health probe.
 *
 *   linkedin-auth / indeed-auth → spawn a short python `--check-session`
 *                                  invocation (read-only — opens browser
 *                                  headless, navigates to /feed/, checks
 *                                  for redirect to login)
 *
 *   gmail-imap                  → reads creds from .env, opens an IMAP
 *                                  connection, lists inbox (no fetch)
 *
 *   anthropic / gemini / adzuna → checks API-key presence in .env (the
 *                                  Settings page does the real round-trip
 *                                  probe; this is just "is the key still
 *                                  there")
 *
 * On success: recordSuccess updates lastSuccessfulPullAt.
 * On failure: recordFailure increments consecutiveFailures (3 strikes → disconnect).
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { recordSuccess, recordFailure, getSource } from '$lib/server/sources';
import { readEnv } from '$lib/server/env';

export const POST = wrap('sources-test', async ({ params }: { params: { id: string } }) => {
  const id = params.id;

  if (id === 'linkedin-auth' || id === 'indeed-auth') {
    const portal = id === 'linkedin-auth' ? 'linkedin' : 'indeed';
    const stateDir = path.join(ROOT, '.playwright-' + portal);
    if (!fs.existsSync(stateDir)) {
      const err = new Error('No saved session — click Connect first.');
      recordFailure(id, err);
      return { ok: false, error: err.message };
    }
    try {
      await spawnSessionCheck(portal);
      recordSuccess(id);
      return { ok: true, message: portal + ' session is alive.' };
    } catch (err) {
      recordFailure(id, err);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  if (id === 'gmail-imap') {
    const env = readEnv();
    if (!env.GMAIL_IMAP_HOST || !env.GMAIL_IMAP_USER || !env.GMAIL_IMAP_PASSWORD) {
      const err = new Error('Missing GMAIL_IMAP_* in .env — click Connect first.');
      recordFailure(id, err);
      return { ok: false, error: err.message };
    }
    try {
      await testImap(env.GMAIL_IMAP_HOST, env.GMAIL_IMAP_USER, env.GMAIL_IMAP_PASSWORD, env.GMAIL_IMAP_LABEL || 'INBOX');
      recordSuccess(id);
      return { ok: true, message: 'IMAP connection OK.' };
    } catch (err) {
      recordFailure(id, err);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  if (id === 'anthropic' || id === 'gemini' || id === 'adzuna') {
    const env = readEnv();
    const ok =
      (id === 'anthropic' && !!env.ANTHROPIC_API_KEY) ||
      (id === 'gemini' && !!env.GEMINI_API_KEY) ||
      (id === 'adzuna' && !!(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY));
    if (ok) {
      recordSuccess(id);
      return { ok: true, message: id + ' key present in .env' };
    }
    const err = new Error(id + ' key not configured');
    recordFailure(id, err);
    return { ok: false, error: err.message };
  }

  // always-on sources don't have a "test" — just report current state
  const s = getSource(id);
  return { ok: true, message: 'always-on', state: s };
});

function spawnSessionCheck(portal: 'linkedin' | 'indeed'): Promise<void> {
  return new Promise((resolve, reject) => {
    const venvPython = path.join(ROOT, '.venv', 'bin', 'python');
    const py = fs.existsSync(venvPython) ? venvPython : 'python3';
    // lib_playwright_auth.py wraps both portals' is-logged-in probe behind
    // a single --check-session flag (exit 0 = logged in, 1 = not).
    let stdout = '';
    let stderr = '';
    const p = spawn(py, ['lib_playwright_auth.py', '--portal', portal, '--check-session'], {
      cwd: ROOT,
      env: { ...process.env },
    });
    p.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    p.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });
    const timer = setTimeout(() => {
      try { p.kill('SIGTERM'); } catch {}
      reject(new Error('Session check timed out'));
    }, 30_000);
    p.on('error', (err) => { clearTimeout(timer); reject(err); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      const tail = (stderr || stdout || '').slice(-300).trim();
      reject(new Error('Session check exited ' + code + (tail ? ': ' + tail : '')));
    });
  });
}

async function testImap(host: string, user: string, password: string, mailbox: string): Promise<void> {
  const { ImapFlow } = await import('imapflow');
  const client = new ImapFlow({
    host, port: 993, secure: true,
    auth: { user, pass: password },
    logger: false,
  });
  try {
    await client.connect();
    await client.status(mailbox, { messages: true });
  } finally {
    try { await client.logout(); } catch {}
  }
}
