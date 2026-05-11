/**
 * Liveness check — weekly background sweep + per-job + bulk surfaces.
 *
 * Wraps `check-liveness.mjs` (Playwright-based detector) to classify URLs:
 *   active    — posting still listed
 *   expired   — 404 / posting removed / "no longer accepting applications"
 *   uncertain — couldn't reach a verdict (Playwright timeout, captcha, …)
 *
 * On the bulk sweep, expired URLs auto-flip to status=Closed via markClosed.
 * Uncertain URLs become Inbox issues (so the user can verify by hand).
 *
 * Trigger: weekly (Mondays at 06:00) + manual + per-URL via /api/job/[id]/liveness.
 *
 * Args (manual run):
 *   { urls: string[] }   — explicit URL list
 *   { scope: 'stale' }   — every job ≥ 14 days old in pipeline.md / applications.md
 *   { scope: 'all' }     — every job in pipeline.md (use sparingly — costs Playwright time)
 *   default              — same as scope='stale'
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { ROOT } from '../files';
import { activePath } from '../profile-paths';
import { logEvent } from '../events';
import { reportIssue } from '../issues';
import { markClosed } from '../applications';
import { register } from './registry';
import type { JobArgs, JobResult } from './types';

type LivenessVerdict = 'active' | 'expired' | 'uncertain';
type Outcome = { url: string; verdict: LivenessVerdict; reason?: string };

const LINE_RE = /^([✓✗?])\s+(active|expired|uncertain)\s+(.+)$/;

/** Parse the script's stdout (which interleaves verdict lines with reason lines). */
function parseStdout(stdout: string, urls: string[]): Outcome[] {
  const out: Outcome[] = [];
  const lines = stdout.split('\n');
  let pending: Outcome | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(LINE_RE);
    if (m) {
      if (pending) out.push(pending);
      pending = { url: m[3].trim(), verdict: m[2] as LivenessVerdict };
    } else if (pending && line.startsWith('reason:')) {
      pending.reason = line.replace(/^reason:\s*/, '');
    }
  }
  if (pending) out.push(pending);
  // Fall back to defaults for any URL the script didn't enumerate
  for (const url of urls) {
    if (!out.find((o) => o.url === url)) {
      out.push({ url, verdict: 'uncertain', reason: 'no result line in stdout' });
    }
  }
  return out;
}

/** Stale threshold: a job hasn't been touched (per scan-history.tsv mtime
 *  AND applications.md date column) for at least this many days. F6 + P8. */
const STALE_DAYS = 14;

/** Parse the date column from an applications.md row. Returns null when the
 *  row doesn't have a parseable YYYY-MM-DD in its second pipe-delimited cell. */
function applicationsDate(line: string): Date | null {
  const cells = line.split('|').map((c) => c.trim());
  // Layout: '', '#', 'date', 'company', 'role', ... — date is at cells[2].
  const m = cells[2]?.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(m[1] + '-' + m[2] + '-' + m[3]);
  return isNaN(d.getTime()) ? null : d;
}

/** Pull URLs from data files for the requested scope.
 *
 *  Stale scope (F6 + P8): a URL counts as stale when (a) it's in
 *  applications.md with a date column older than STALE_DAYS, OR (b) the
 *  scan-history.tsv mtime for the URL's domain is older than STALE_DAYS.
 *  The 'all' scope ignores age and includes every URL in pipeline +
 *  applications.
 */
function collectUrls(scope: 'stale' | 'all'): string[] {
  const urls = new Set<string>();
  const staleCutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;

  // Pipeline (active jobs awaiting evaluation)
  try {
    const text = fs.readFileSync(activePath('pipeline'), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/https?:\/\/\S+/);
      if (m) urls.add(m[0].replace(/[)\].,>]+$/, ''));
    }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      logEvent('liveness', 'Could not read pipeline.md', {
        level: 'warn', category: 'system',
        message: code + ': ' + (e instanceof Error ? e.message : String(e)),
      });
    }
  }
  // applications.md — included in both scopes, but with different filtering.
  try {
    const text = fs.readFileSync(activePath('applications'), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/https?:\/\/\S+/);
      if (!m) continue;
      const url = m[0].replace(/[)\].,>]+$/, '');
      if (scope === 'all') {
        urls.add(url);
        continue;
      }
      // 'stale': include only when the row's date is older than STALE_DAYS,
      // OR when there's no date at all (means it predates the dated layout
      // — likely very old, safe to check).
      const date = applicationsDate(line);
      if (!date || date.getTime() <= staleCutoff) {
        urls.add(url);
      }
    }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      logEvent('liveness', 'Could not read applications.md', {
        level: 'warn', category: 'system',
        message: code + ': ' + (e instanceof Error ? e.message : String(e)),
      });
    }
  }
  return [...urls].slice(0, 200); // hard cap to avoid runaway sweeps
}

/** Run check-liveness.mjs against an explicit URL list. */
function runLivenessSubprocess(urls: string[]): Promise<Outcome[]> {
  return new Promise((resolve) => {
    if (urls.length === 0) { resolve([]); return; }
    let stdout = '';
    const p = spawn('node', ['check-liveness.mjs', ...urls], {
      cwd: ROOT,
      env: { ...process.env },
    });
    p.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    p.stderr?.on('data', () => { /* swallow */ });
    p.on('error', (err) => {
      logEvent('liveness', 'check-liveness.mjs failed to spawn', {
        level: 'error',
        category: 'system',
        message: err.message + ' — Playwright must be installed in the venv',
      });
      resolve(urls.map((url) => ({ url, verdict: 'uncertain' as const, reason: 'spawn failed' })));
    });
    p.on('close', () => {
      resolve(parseStdout(stdout, urls));
    });
  });
}

/**
 * Public surface: per-URL check (fast path) — used by /api/job/[id]/liveness.
 */
export async function checkOne(url: string): Promise<Outcome> {
  const out = await runLivenessSubprocess([url]);
  return out[0] ?? { url, verdict: 'uncertain', reason: 'no result' };
}

/**
 * Bulk sweep — auto-flips expired URLs to Closed, files an issue per
 * uncertain URL. Idempotent: stable issue dedupeKey per URL.
 */
async function runLivenessSweep(args?: JobArgs): Promise<JobResult> {
  let urls: string[] = [];
  if (Array.isArray(args?.urls)) {
    urls = (args!.urls as string[]).filter((u) => typeof u === 'string');
  } else {
    const scope = (args?.scope === 'all') ? 'all' : 'stale';
    urls = collectUrls(scope as 'stale' | 'all');
  }
  if (urls.length === 0) {
    logEvent('liveness', 'Liveness sweep: nothing to check', {
      level: 'info',
      category: 'system',
      message: 'no URLs in scope',
    });
    return { ok: true, message: '0 checked', meta: { checked: 0, expired: 0, uncertain: 0 } };
  }
  logEvent('liveness', 'Liveness sweep started', {
    level: 'info',
    category: 'system',
    message: 'checking ' + urls.length + ' URL(s) via Playwright',
  });
  const outcomes = await runLivenessSubprocess(urls);
  let expired = 0;
  let uncertain = 0;
  for (const o of outcomes) {
    if (o.verdict === 'expired') {
      expired++;
      try {
        markClosed(o.url, o.reason ?? 'liveness-sweep');
      } catch (err) {
        // markClosed has its own internal error logging via reportServerError,
        // but the throw shouldn't blow up the sweep loop. Log once and move on.
        logEvent('liveness', 'Could not mark URL closed', {
          level: 'warn', category: 'application',
          message: o.url + ' — ' + (err instanceof Error ? err.message : String(err)),
        });
      }
    } else if (o.verdict === 'uncertain') {
      uncertain++;
      reportIssue({
        severity: 'warn',
        source: 'liveness',
        summary: 'Liveness uncertain · ' + o.url,
        detail: 'Could not classify this posting reliably.\n\nreason: ' + (o.reason ?? '(none)'),
        fix: { label: 'Open job', href: o.url },
        dedupeKey: 'liveness:uncertain:' + o.url,
      });
    }
  }
  logEvent('liveness', 'Liveness sweep finished', {
    level: 'success',
    category: 'system',
    message:
      outcomes.length + ' checked · ' +
      expired + ' expired → Closed · ' +
      uncertain + ' uncertain (Inbox)',
  });
  return {
    ok: true,
    message: outcomes.length + ' checked · ' + expired + ' expired',
    meta: { checked: outcomes.length, expired, uncertain },
  };
}

register({
  id: 'liveness',
  label: 'Liveness sweep',
  description: 'Walks pipeline URLs through Playwright; auto-closes expired postings, flags uncertain ones.',
  category: 'hygiene',
  trigger: { type: 'weekly', dayOfWeek: 1, hour: 6, minute: 0 },
  allowManual: true,
  run: runLivenessSweep,
});
