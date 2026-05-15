/**
 * Auto-triage workflow — silent chain that runs after every scan.
 *
 * Today the user must manually run `triage → update-pipeline → build-batch-input`
 * to prepare a scan's output for batch evaluation. This job stitches the
 * three together so the user's pipeline is auto-classified and the
 * batch-input.tsv is always fresh.
 *
 *   1. triage.mjs           — classifies pipeline.md by company+role rules
 *                              (survivors.tsv + pipeline-skipped.tsv)
 *   2. update-pipeline.mjs  — applies `[!] reason` markers in pipeline.md
 *                              and appends SKIP rows to applications.md
 *   3. build-batch-input.mjs — writes <profile>/batch/batch-input.tsv from survivors
 *
 * Trigger: after-event on 'scan' and 'scan-portals' (when 2.1 lands). Also
 * registered for manual invocation so power users can dry-run after editing
 * portals.yml triage rules.
 */

import { spawn } from 'node:child_process';
import { ROOT } from '../files';
import { logEvent } from '../events';
import { register } from './registry';
import type { JobResult } from './types';

const SURVIVORS_RE = /Survivors:\s*(\d+)/i;
const SKIPPED_RE = /Skipped:\s*(\d+)/i;
const BATCH_OFFERS_RE = /Wrote batch\/batch-input\.tsv\s+with\s+(\d+)\s+offers/i;
const MARKED_RE = /Marked\s+(\d+)\s+URLs\s+as\s+\[!\]/i;

type StepResult = { ok: boolean; stdout: string; stderr: string; code: number | null };

function runStep(script: string): Promise<StepResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const p = spawn('node', [script], {
      cwd: ROOT,
      env: { ...process.env },
    });
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    p.on('error', (err) => {
      resolve({ ok: false, stdout, stderr: stderr + err.message, code: null });
    });
    p.on('close', (code) => {
      resolve({ ok: code === 0, stdout, stderr, code });
    });
  });
}

async function runAutoTriage(): Promise<JobResult> {
  // Step 1: triage.mjs
  logEvent('auto-triage', 'Step 1/3: triage', { level: 'info', category: 'system' });
  const s1 = await runStep('scripts/system/triage.mjs');
  if (!s1.ok) {
    logEvent('auto-triage', 'Triage failed', {
      level: 'error',
      category: 'system',
      message: s1.stderr.slice(0, 200) || 'exit ' + s1.code,
    });
    return { ok: false, error: 'triage step failed' };
  }
  const survivors = parseInt(s1.stdout.match(SURVIVORS_RE)?.[1] ?? '0', 10);
  const skipped = parseInt(s1.stdout.match(SKIPPED_RE)?.[1] ?? '0', 10);

  // Step 2: update-pipeline.mjs
  logEvent('auto-triage', 'Step 2/3: update-pipeline', { level: 'info', category: 'system' });
  const s2 = await runStep('scripts/system/update-pipeline.mjs');
  if (!s2.ok) {
    logEvent('auto-triage', 'update-pipeline failed', {
      level: 'error',
      category: 'system',
      message: s2.stderr.slice(0, 200) || 'exit ' + s2.code,
    });
    return { ok: false, error: 'update-pipeline step failed' };
  }
  const marked = parseInt(s2.stdout.match(MARKED_RE)?.[1] ?? '0', 10);

  // Step 3: build-batch-input.mjs
  logEvent('auto-triage', 'Step 3/3: build-batch-input', { level: 'info', category: 'system' });
  const s3 = await runStep('scripts/system/build-batch-input.mjs');
  if (!s3.ok) {
    logEvent('auto-triage', 'build-batch-input failed', {
      level: 'warn',
      category: 'system',
      message: s3.stderr.slice(0, 200) || 'exit ' + s3.code,
    });
    // Soft failure — we still got triage + pipeline-marking benefit.
  }
  const offers = parseInt(s3.stdout.match(BATCH_OFFERS_RE)?.[1] ?? '0', 10);

  // Summary event drives the bell.
  logEvent(
    'auto-triage',
    'Triage · ' + survivors + ' survivors · ' + skipped + ' skipped · ' + offers + ' batch input',
    {
      level: 'success',
      category: 'system',
      message: 'pipeline.md self-classified · ' + marked + ' marked · batch ready',
    },
  );
  return {
    ok: true,
    message: survivors + ' survivors · ' + skipped + ' skipped',
    meta: { survivors, skipped, marked, batchOffers: offers },
  };
}

register({
  id: 'auto-triage',
  label: 'Auto-triage',
  description:
    'Classifies pipeline URLs after every scan: survivors → batch input, skips → marked + tracked.',
  category: 'hygiene',
  trigger: { type: 'after', tasks: ['scan', 'scan-portals'] },
  allowManual: true,
  run: runAutoTriage,
});
