/**
 * quality-checks — server-side wrappers for ats-check, resume-quality
 * and cover-letter-check. Each spawns the corresponding mjs script
 * in --json mode and returns a typed result.
 *
 * Used by:
 *   • cv-pdf.ts (after PDF render → ats-check + resume-quality)
 *   • /api/job/[id]/cover-letter (after cover-letter render → cover-letter-check)
 *   • onboarding flow (when user uploads/edits their base CV)
 *
 * Failures are SURFACED, never blocking — we always return the score so
 * the caller can decide whether to retry, auto-fix, or just warn the user.
 */

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from './files';
import { reportServerError } from './events';

export type QualityCheck = {
  status: 'pass' | 'warn' | 'fail';
  name: string;
  evidence: string;
};

export type QualityResult = {
  score: number;
  total: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  checks: QualityCheck[];
  /** Markdown-formatted fail summary, suitable for surfacing in an Issue card. */
  failSummary: string;
};

function runScript(scriptName: string, args: string[], timeoutMs = 30_000): Promise<QualityResult> {
  return new Promise((resolveP, rejectP) => {
    const p = spawn('node', [join(ROOT, scriptName), ...args, '--json'], {
      cwd: ROOT,
      env: { ...process.env },
    });
    let stdoutBuf = '';
    let stderrBuf = '';
    p.stdout?.on('data', (c: Buffer) => {
      stdoutBuf += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderrBuf += c.toString();
    });
    const timer = setTimeout(() => {
      try {
        p.kill('SIGTERM');
      } catch {
        /* already gone */
      }
      rejectP(new Error(`${scriptName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    p.on('error', (err) => {
      clearTimeout(timer);
      rejectP(err);
    });
    p.on('close', () => {
      clearTimeout(timer);
      try {
        const json = JSON.parse(stdoutBuf);
        const checks: QualityCheck[] = json.checks ?? [];
        const failed = checks.filter((c) => c.status === 'fail');
        const failSummary =
          failed.length === 0
            ? ''
            : failed.map((c) => `- **${c.name}** — ${c.evidence || 'failed'}`).join('\n');
        resolveP({
          score: typeof json.score === 'number' ? json.score : 0,
          total: typeof json.total === 'number' ? json.total : 0,
          passCount: json.passCount ?? 0,
          warnCount: json.warnCount ?? 0,
          failCount: json.failCount ?? 0,
          checks,
          failSummary,
        });
      } catch (e) {
        rejectP(
          new Error(
            `${scriptName} produced non-JSON output: ` +
              (stderrBuf.slice(-200) || stdoutBuf.slice(-200)),
          ),
        );
      }
    });
  });
}

/** Run ats-check.mjs on a PDF. Returns score 0-100 + the failed-check list. */
export function checkAts(pdfPath: string, opts?: { lenient?: boolean }): Promise<QualityResult> {
  const args = [pdfPath];
  if (opts?.lenient) args.push('--lenient');
  return runScript('ats-check.mjs', args).catch((err) => {
    reportServerError('quality-checks', 'ats-check failed', err);
    return emptyResult('ats-check threw — see activity log');
  });
}

/** Run resume-quality.mjs on a markdown CV. */
export function checkResumeQuality(
  mdPath: string,
  opts?: { lenient?: boolean },
): Promise<QualityResult> {
  const args = [mdPath];
  if (opts?.lenient) args.push('--lenient');
  return runScript('resume-quality.mjs', args).catch((err) => {
    reportServerError('quality-checks', 'resume-quality failed', err);
    return emptyResult('resume-quality threw — see activity log');
  });
}

/** Run cover-letter-check.mjs on a markdown cover letter. */
export function checkCoverLetter(
  mdPath: string,
  opts?: { company?: string; role?: string; lenient?: boolean },
): Promise<QualityResult> {
  const args = [mdPath];
  if (opts?.company) args.push(`--company=${opts.company}`);
  if (opts?.role) args.push(`--role=${opts.role}`);
  if (opts?.lenient) args.push('--lenient');
  return runScript('cover-letter-check.mjs', args).catch((err) => {
    reportServerError('quality-checks', 'cover-letter-check failed', err);
    return emptyResult('cover-letter-check threw — see activity log');
  });
}

/** A null-object result so callers don't need to handle exceptions. */
function emptyResult(note: string): QualityResult {
  return {
    score: 0,
    total: 0,
    passCount: 0,
    warnCount: 0,
    failCount: 1,
    checks: [{ status: 'fail', name: 'Checker crashed', evidence: note }],
    failSummary: `- **Checker crashed** — ${note}`,
  };
}

/** Sugar: run all three checks in parallel for a job's outputs (PDF + CV.md + cover.md). */
export async function checkAll(opts: {
  pdfPath?: string;
  cvMdPath?: string;
  coverMdPath?: string;
  company?: string;
  role?: string;
}): Promise<{
  ats?: QualityResult;
  resume?: QualityResult;
  cover?: QualityResult;
}> {
  const tasks: Promise<unknown>[] = [];
  let ats: QualityResult | undefined;
  let resume: QualityResult | undefined;
  let cover: QualityResult | undefined;
  if (opts.pdfPath) tasks.push(checkAts(opts.pdfPath).then((r) => (ats = r)));
  if (opts.cvMdPath) tasks.push(checkResumeQuality(opts.cvMdPath).then((r) => (resume = r)));
  if (opts.coverMdPath)
    tasks.push(
      checkCoverLetter(opts.coverMdPath, { company: opts.company, role: opts.role }).then(
        (r) => (cover = r),
      ),
    );
  await Promise.all(tasks);
  return { ats, resume, cover };
}
