/**
 * Pipeline integrity verification — silent + on-demand.
 *
 * Runs in-process, in pure TS, against the active profile's
 * applications.md. Emits one issue per problem class with a stable
 * dedupeKey, so repeat detections refresh the existing row rather
 * than spamming.
 *
 * Schedule: nightly at 04:00. Manual run via the Agents page and via
 * `POST /api/jobs/verify-pipeline/run`. Output is parsed into the
 * issue stream so the user only sees a notification when something
 * is actually broken.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { logEvent } from '../events';
import { reportIssue } from '../issues';
import { register } from './registry';
import type { JobResult } from './types';
import { activePath } from '../profile-paths';

type Finding = { severity: 'error' | 'warn'; cls: string; line: string };

// Canonical statuses per data/states.yml. Kept inline to avoid a
// YAML parser dep just for this list; tested by templates.test.ts to
// stay in sync with the canonical file.
const CANONICAL_STATUSES = new Set([
  'Evaluated',
  'Applied',
  'Responded',
  'Interview',
  'Offer',
  'Rejected',
  'Discarded',
  'SKIP',
]);

function loadActiveProfileTracker(): { path: string; body: string } | null {
  // Resolve via activePath() so multi-user installs read the correct
  // user+profile applications.md (data/users/{uid}/profiles/{slug}/
  // applications.md). Legacy single-user installs naturally fall back
  // to data/profiles/{slug}/applications.md via the SYSTEM_USER_ID
  // branch in profile-paths.ts.
  const p = activePath('applications');
  if (existsSync(p)) return { path: p, body: readFileSync(p, 'utf8') };
  return null;
}

function parseRows(body: string): { rowIdx: number; cols: string[] }[] {
  // Markdown tables: header + separator + rows. Skip the first two
  // pipe-rows (header + separator) and ignore blank lines.
  const rows: { rowIdx: number; cols: string[] }[] = [];
  let pipeRowsSeen = 0;
  body.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    if (!line.startsWith('|')) return;
    pipeRowsSeen += 1;
    if (pipeRowsSeen <= 2) return; // header + separator
    const cols = line
      .slice(1) // strip leading |
      .replace(/\|\s*$/, '') // strip trailing |
      .split('|')
      .map((c) => c.trim());
    rows.push({ rowIdx: i + 1, cols });
  });
  return rows;
}

/** Exported for tests; production callers receive this via register(). */
export function runVerifyPipeline(): Promise<JobResult> {
  return new Promise((resolve) => {
    const findings: Finding[] = [];
    const tracker = loadActiveProfileTracker();
    if (!tracker) {
      logEvent('verify-pipeline', 'No applications.md found — skipping', {
        level: 'info',
        category: 'system',
        message: 'No tracker exists yet',
      });
      resolve({ ok: true, message: 'No tracker yet', meta: { errors: 0, warnings: 0 } });
      return;
    }

    const rows = parseRows(tracker.body);

    // Check 1 — canonical statuses
    const seen = new Map<string, number[]>();
    rows.forEach(({ rowIdx, cols }) => {
      if (cols.length < 6) {
        findings.push({
          severity: 'warn',
          cls: 'Malformed row',
          line: `row ${rowIdx}: only ${cols.length} columns (expected ≥ 6)`,
        });
        return;
      }
      const company = cols[2];
      const role = cols[3];
      const status = cols[5]; // applications.md column order: # | Date | Company | Role | Score | Status | …
      if (status && !CANONICAL_STATUSES.has(status)) {
        findings.push({
          severity: 'warn',
          cls: 'Non-canonical status',
          line: `row ${rowIdx}: "${status}" not in data/states.yml`,
        });
      }
      const dedupKey = `${(company || '').toLowerCase()}|${(role || '').toLowerCase()}`;
      const existing = seen.get(dedupKey);
      if (existing) existing.push(rowIdx);
      else seen.set(dedupKey, [rowIdx]);
    });

    // Check 2 — duplicates
    for (const [key, idxs] of seen) {
      if (idxs.length > 1) {
        findings.push({
          severity: 'warn',
          cls: 'Duplicate company+role',
          line: `${key}: rows ${idxs.join(', ')}`,
        });
      }
    }

    // Check 3 — unmerged TSVs in the active profile's tracker-additions/
    // (per-profile post-multi-user migration; the legacy repo-root
    // batch/tracker-additions/ no longer exists).
    const tsvDir = join(activePath('batch-dir'), 'tracker-additions');
    if (existsSync(tsvDir)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require('node:fs') as typeof import('node:fs');
        const pending = fs.readdirSync(tsvDir).filter((f: string) => f.endsWith('.tsv'));
        if (pending.length > 0) {
          findings.push({
            severity: 'warn',
            cls: 'Unmerged tracker TSVs',
            line: `${pending.length} pending — run \`node merge-tracker.mjs\``,
          });
        }
      } catch {
        // ignore — non-fatal
      }
    }

    // Group findings by class — one issue per class with stable dedupeKey.
    const groups = new Map<string, Finding[]>();
    for (const f of findings) {
      if (!groups.has(f.cls)) groups.set(f.cls, []);
      groups.get(f.cls)!.push(f);
    }

    for (const [cls, items] of groups) {
      const errCount = items.filter((i) => i.severity === 'error').length;
      const warnCount = items.length - errCount;
      const severity: 'error' | 'warn' = errCount > 0 ? 'error' : 'warn';
      const summary =
        cls +
        ' (' +
        (errCount > 0 ? errCount + ' error' + (errCount === 1 ? '' : 's') : '') +
        (errCount > 0 && warnCount > 0 ? ' · ' : '') +
        (warnCount > 0 ? warnCount + ' warning' + (warnCount === 1 ? '' : 's') : '') +
        ')';
      const detail =
        items
          .slice(0, 50)
          .map((i) => '- ' + i.line)
          .join('\n') + (items.length > 50 ? '\n\n…and ' + (items.length - 50) + ' more.' : '');
      reportIssue({
        severity,
        source: 'verify-pipeline',
        summary,
        detail,
        fix: { label: 'Open Settings → Maintenance', href: '/settings#maintenance' },
        dedupeKey: 'verify-pipeline:' + cls.toLowerCase().replace(/\s+/g, '-'),
      });
    }

    const errors = findings.filter((f) => f.severity === 'error').length;
    const warnings = findings.length - errors;

    if (errors === 0 && warnings === 0) {
      logEvent('verify-pipeline', 'Pipeline integrity OK', {
        level: 'info',
        category: 'system',
        message: 'No issues found',
      });
    } else {
      logEvent(
        'verify-pipeline',
        'Pipeline issues: ' +
          errors +
          ' error' +
          (errors === 1 ? '' : 's') +
          ' · ' +
          warnings +
          ' warning' +
          (warnings === 1 ? '' : 's'),
        {
          level: errors > 0 ? 'warn' : 'info',
          category: 'system',
          message: 'See Inbox · Maintenance for details',
        },
      );
    }

    resolve({
      ok: true,
      message: 'Verified · ' + errors + ' errors / ' + warnings + ' warnings',
      meta: { errors, warnings, trackerPath: tracker.path },
    });
  });
}

register({
  id: 'verify-pipeline',
  label: 'Pipeline integrity check',
  description:
    'Validates statuses, dedupes, and report links across applications.md. Surfaces problems via the issue stream.',
  category: 'hygiene',
  trigger: { type: 'daily', hour: 4, minute: 0 },
  allowManual: true,
  perUser: true,
  run: runVerifyPipeline,
});
