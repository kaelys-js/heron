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
 *   anthropic / gemini / adzuna → delegates to /api/settings/test logic
 *                                  which does the real round-trip probe
 *                                  against the provider (issue B13).
 *
 *   scan-portals / scan-broad / → dry-run --probe of the underlying
 *   scan-curated                  scanner (B12) — confirms the scanner
 *                                  can hit at least one provider without
 *                                  actually adding rows to pipeline.md.
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
      await testImap(
        env.GMAIL_IMAP_HOST,
        env.GMAIL_IMAP_USER,
        env.GMAIL_IMAP_PASSWORD,
        env.GMAIL_IMAP_LABEL || 'INBOX',
      );
      recordSuccess(id);
      return { ok: true, message: 'IMAP connection OK.' };
    } catch (err) {
      recordFailure(id, err);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  if (id === 'anthropic' || id === 'gemini' || id === 'adzuna') {
    // Delegate to the same round-trip probe the /settings page uses, so a
    // valid env var alone is no longer enough to pass Test (B13). Helper
    // is shared via the testApiKey() function below.
    try {
      const r = await probeApiKey(id);
      if (r.ok) {
        recordSuccess(id);
        return { ok: true, message: r.message };
      }
      const err = new Error(r.message);
      recordFailure(id, err);
      return { ok: false, error: r.message };
    } catch (err) {
      recordFailure(id, err);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  if (id === 'scan-portals' || id === 'scan-broad' || id === 'scan-curated') {
    // Real probe of the always-on scanners (B12). Each script understands
    // --dry-run + --probe (no pipeline writes; just exercise one provider).
    try {
      const r = await probeAlwaysOnScanner(id);
      if (r.ok) {
        recordSuccess(id);
        return { ok: true, message: r.message };
      }
      const err = new Error(r.message);
      recordFailure(id, err);
      return { ok: false, error: r.message };
    } catch (err) {
      recordFailure(id, err);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Unknown id — explicit "no probe available" rather than fake success.
  const s = getSource(id);
  return { ok: false, error: 'No probe available for source: ' + id, state: s };
});

/**
 * Round-trip probe an API key. Mirrors `/api/settings/test` logic so
 * `/sources` Test agrees with what Settings reports.
 */
async function probeApiKey(
  id: 'anthropic' | 'gemini' | 'adzuna',
): Promise<{ ok: boolean; message: string }> {
  const env = readEnv();
  if (id === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY) return { ok: false, message: 'ANTHROPIC_API_KEY not set' };
    try {
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
      if (r.ok) return { ok: true, message: 'Anthropic key round-trip OK.' };
      const txt = await r.text();
      return { ok: false, message: 'Anthropic ' + r.status + ': ' + txt.slice(0, 200) };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }
  if (id === 'gemini') {
    if (!env.GEMINI_API_KEY) return { ok: false, message: 'GEMINI_API_KEY not set' };
    try {
      const r = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models?key=' + env.GEMINI_API_KEY,
      );
      if (r.ok) return { ok: true, message: 'Gemini key round-trip OK.' };
      return { ok: false, message: 'Gemini ' + r.status };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }
  // adzuna
  if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY) {
    return { ok: false, message: 'ADZUNA_APP_ID + ADZUNA_APP_KEY not both set' };
  }
  try {
    const u =
      'https://api.adzuna.com/v1/api/jobs/gb/search/1?app_id=' +
      env.ADZUNA_APP_ID +
      '&app_key=' +
      env.ADZUNA_APP_KEY +
      '&results_per_page=1';
    const r = await fetch(u);
    if (r.ok) return { ok: true, message: 'Adzuna key round-trip OK.' };
    return { ok: false, message: 'Adzuna ' + r.status };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Probe the underlying always-on scanner with --dry-run --probe. */
function probeAlwaysOnScanner(
  id: 'scan-portals' | 'scan-broad' | 'scan-curated',
): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    const script =
      id === 'scan-portals'
        ? 'scan.mjs'
        : id === 'scan-broad'
          ? 'scan-broad.py'
          : 'scan-curated.mjs';
    const isPython = script.endsWith('.py');
    const venvPython = path.join(ROOT, '.venv', 'bin', 'python');
    const bin = isPython ? (fs.existsSync(venvPython) ? venvPython : 'python3') : 'node';
    let stdout = '';
    let stderr = '';
    let p: import('node:child_process').ChildProcess;
    try {
      p = spawn(bin, [script, '--dry-run', '--probe'], { cwd: ROOT, env: { ...process.env } });
    } catch (e) {
      resolve({ ok: false, message: e instanceof Error ? e.message : String(e) });
      return;
    }
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    const timer = setTimeout(() => {
      try {
        p.kill('SIGTERM');
      } catch {}
      resolve({ ok: false, message: id + ' probe timed out after 30s' });
    }, 30_000);
    p.on('error', (err: Error) => {
      clearTimeout(timer);
      resolve({ ok: false, message: err.message });
    });
    p.on('close', (code: number | null) => {
      clearTimeout(timer);
      if (code === 0) {
        // Surface a count-style line from stdout if the script emitted one,
        // otherwise a generic success message.
        const tail = stdout.trim().split('\n').slice(-3).join(' · ').slice(0, 200);
        resolve({ ok: true, message: id + ' probe OK' + (tail ? ' · ' + tail : '') });
      } else {
        const tail = (stderr || stdout).trim().slice(-200);
        resolve({ ok: false, message: id + ' probe exited ' + code + (tail ? ': ' + tail : '') });
      }
    });
  });
}

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
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    const timer = setTimeout(() => {
      try {
        p.kill('SIGTERM');
      } catch {}
      reject(new Error('Session check timed out'));
    }, 30_000);
    p.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      const tail = (stderr || stdout || '').slice(-300).trim();
      reject(new Error('Session check exited ' + code + (tail ? ': ' + tail : '')));
    });
  });
}

async function testImap(
  host: string,
  user: string,
  password: string,
  mailbox: string,
): Promise<void> {
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
    await client.status(mailbox, { messages: true });
  } finally {
    try {
      await client.logout();
    } catch {}
  }
}
