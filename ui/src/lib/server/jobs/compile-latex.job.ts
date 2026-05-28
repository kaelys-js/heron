/** compile-latex (D11) -- registry wrapper around generate-latex.mjs.
 *  Most users write cv.md; this job compiles a hand-written cv.tex
 *  dropped at <profile output dir>/cv.tex into cv.pdf.
 *  Trigger: manual via Agents page. Args: { tex?, out? } -- tex
 *  defaults to <profile output dir>/cv.tex, out to .tex→.pdf in the
 *  same dir.
 *  Requires `tectonic` (preferred) or `pdflatex` on PATH; surfaces a
 *  clear error in the activity feed if neither is installed. */

import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { register } from './registry';
import { ROOT } from '../files';
import { profilePath } from '../profile-paths';
import { getActiveProfileId } from '../profiles';
import { logEvent, reportServerError } from '../events';
import type { JobArgs, JobResult } from './types';
import { userContextEnv } from '../user-context';

async function runCompileLatex(args?: JobArgs): Promise<JobResult> {
  const profileId = (typeof args?.profileId === 'string' && args.profileId) || getActiveProfileId();
  const outputDir = profilePath(profileId, 'output-dir');
  const tex = (typeof args?.tex === 'string' && args.tex) || path.join(outputDir, 'cv.tex');
  const out = (typeof args?.out === 'string' && args.out) || tex.replace(/\.tex$/, '.pdf');

  if (!fs.existsSync(tex)) {
    return {
      ok: false,
      error: `No .tex source at ${
        tex
      }. Write one (templates/cv-template.tex is the reference) and re-run.`,
    };
  }

  logEvent('compile-latex', 'LaTeX compile started', {
    category: 'task',
    message: `${tex} → ${out} · profile=${profileId}`,
  });

  return new Promise<JobResult>((resolve) => {
    const p = spawn('node', ['scripts/cv/generate-latex.mjs', tex, out], {
      cwd: ROOT,
      env: userContextEnv(),
    });
    let stdoutBuf = '';
    let stderrBuf = '';
    p.stdout?.on('data', (c: Buffer) => {
      stdoutBuf += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderrBuf += c.toString();
    });
    p.on('error', (err) => {
      reportServerError('compile-latex', 'Failed to spawn node', err, { category: 'task' });
      resolve({ ok: false, error: err.message });
    });
    p.on('close', (code) => {
      if (code === 0) {
        const stat = fs.existsSync(out) ? fs.statSync(out) : null;
        const bytes = stat ? Math.round(stat.size / 1024) : 0;
        logEvent('compile-latex', 'LaTeX compile finished', {
          level: 'success',
          category: 'task',
          message: out + (bytes ? ' · ' + bytes + 'KB' : ''),
        });
        resolve({ ok: true, message: `Wrote ${out}` });
      } else {
        const tail = (stderrBuf || stdoutBuf || '').slice(-400).trim();
        logEvent('compile-latex', 'LaTeX compile failed', {
          level: 'error',
          category: 'task',
          message: `exit ${code}${tail ? ': ' + tail : ''}`,
        });
        resolve({
          ok: false,
          error: `generate-latex.mjs exited ${code}${tail ? ': ' + tail : ''}`,
        });
      }
    });
  });
}

register({
  id: 'compile-latex',
  label: 'Compile LaTeX CV',
  description:
    "Compile a hand-written .tex CV (from the active profile's output/cv.tex) to PDF. Requires tectonic or pdflatex on PATH.",
  category: 'apply',
  trigger: { type: 'manual' },
  allowManual: true,
  perUser: true,
  run: runCompileLatex,
});
