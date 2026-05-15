/**
 * /api/job/[id]/interview-retro — spawn the interview-retro Claude mode.
 *
 * POST body: { stage, notes, outcome }
 *
 * The mode reads the user's free-form interview notes + cv.md + the
 * existing story-bank.md, writes a structured retro file, and APPENDS
 * any strong-moment stories to the bank as "(real rep)" entries.
 * Returns the retro path + count of stories added.
 *
 * Why this matters: the story bank is seeded once from cv.md, but the
 * stories that ACTUALLY land in interviews are different from the ones
 * a CV reviewer would pick. This grows the bank from real reps.
 */

import fs from 'node:fs';
import path from 'node:path';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { logEvent, reportServerError } from '$lib/server/events';

import { spawnAgentWithMode } from '$lib/server/spawn-agent';
type RetroInput = {
  stage: 'PhoneScreen' | 'Technical' | 'TakeHome' | 'Onsite' | 'Final';
  notes: string;
  outcome: 'advanced' | 'rejected' | 'pending';
};

function spawnRetro(
  args: RetroInput & { company: string; role: string; profileId: string },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const promptInput = {
      company: args.company,
      role: args.role,
      stage: args.stage,
      notes: args.notes,
      outcome: args.outcome,
    };

    const { child: p } = spawnAgentWithMode('interview-retro', JSON.stringify(promptInput), {
      profileId: args.profileId,
      env: { INTERVIEW_RETRO_INPUT: JSON.stringify(promptInput) },
    });
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    p.on('error', (err) => reject(err));
    p.on('close', (code) => {
      if (code !== 0) reject(new Error('claude -p exited ' + code + ': ' + stderr.slice(0, 300)));
      else resolve({ stdout, stderr });
    });
  });
}

function parseStdout(stdout: string): {
  retroPath?: string;
  storiesAdded?: number;
  weakAreasLogged?: number;
} {
  const out: { retroPath?: string; storiesAdded?: number; weakAreasLogged?: number } = {};
  const pm = /RETRO_PATH:\s*(\S+)/.exec(stdout);
  if (pm) out.retroPath = pm[1];
  const sm = /STORIES_ADDED:\s*(\d+)/.exec(stdout);
  if (sm) out.storiesAdded = parseInt(sm[1], 10);
  const wm = /WEAK_AREAS_LOGGED:\s*(\d+)/.exec(stdout);
  if (wm) out.weakAreasLogged = parseInt(wm[1], 10);
  return out;
}

export const POST = wrap(
  'interview-retro',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const body = (await request.json().catch(() => ({}))) as Partial<RetroInput>;
    if (!body.stage) badRequest('stage required');
    if (!body.notes || typeof body.notes !== 'string' || !body.notes.trim())
      badRequest('notes required');
    if (!body.outcome) badRequest('outcome required');

    logEvent('interview-retro', 'Generating retro · ' + body.stage, {
      level: 'info',
      category: 'application',
      message: (job.company || '?') + ' · ' + (job.role || '?'),
    });

    try {
      const { stdout } = await spawnRetro({
        company: job.company ?? '',
        role: job.role ?? '',
        stage: body.stage,
        notes: body.notes,
        outcome: body.outcome,
        profileId,
      });
      const meta = parseStdout(stdout);

      // Confirm the bank actually grew by re-reading file size before/after.
      let bankGrewBy = 0;
      try {
        const bankPath = path.join(ROOT, 'interview-prep', 'story-bank.md');
        if (fs.existsSync(bankPath)) {
          // We can't easily measure delta without prior size; just report size now.
          bankGrewBy = fs.statSync(bankPath).size;
        }
      } catch {}

      logEvent('interview-retro', 'Retro ready', {
        level: 'success',
        category: 'application',
        message:
          (meta.retroPath ?? '') +
          (meta.storiesAdded ? ' · ' + meta.storiesAdded + ' new stories' : '') +
          (meta.weakAreasLogged ? ' · ' + meta.weakAreasLogged + ' weak areas' : ''),
      });

      return { ok: true, ...meta, bankSizeBytes: bankGrewBy };
    } catch (err) {
      reportServerError('interview-retro', 'Retro generation failed', err, {
        category: 'application',
      });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
