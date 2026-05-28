/**
 * /api/job/[id]/reference-prep -- generate per-reference briefs.
 *
 * POST body: { references: [{ name, relationship, lastWorkedTogether,
 *               themes? }] }
 *
 * Each reference gets their own 1-pager that the user emails them
 * 24-48h before the company calls. Cost: 1 Claude pass + 1 file per
 * reference. The PROCESS structure is the value -- most candidates
 * never brief refs at all.
 */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { logEvent, reportServerError } from '$lib/server/events';

import { spawnAgentWithMode } from '$lib/server/spawn-agent';

type Reference = {
  name: string;
  relationship?: string;
  lastWorkedTogether?: string;
  themes?: string[];
};

function spawnRefPrep(args: {
  company: string;
  role: string;
  references: Reference[];
  profileId: string;
}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const promptInput = {
      company: args.company,
      role: args.role,
      references: args.references,
    };

    const { child: p } = spawnAgentWithMode('reference-prep', JSON.stringify(promptInput), {
      profileId: args.profileId,
      env: { REFERENCE_PREP_INPUT: JSON.stringify(promptInput) },
    });
    p.stdout?.on('data', (c: Buffer) => {
      stdout += c.toString();
    });
    p.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString();
    });
    p.on('error', (err) => reject(err));
    p.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('claude -p exited ' + code + ': ' + stderr.slice(0, 300)));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

function parseRefStdout(stdout: string): { filesWritten?: number; paths?: string[] } {
  const out: { filesWritten?: number; paths?: string[] } = {};
  const fw = /REFERENCE_FILES_WRITTEN:\s*(\d+)/.exec(stdout);
  if (fw) {
    out.filesWritten = parseInt(fw[1], 10);
  }
  // REFERENCE_PATHS is followed by indented bullets.
  const ps: string[] = [];
  const re = /^\s*-\s+(\S+)$/gm;
  let m;
  while ((m = re.exec(stdout)) !== null) {
    if (m[1].includes('interview-prep/')) {
      ps.push(m[1]);
    }
  }
  if (ps.length) {
    out.paths = ps;
  }
  return out;
}

export const POST = wrap(
  'reference-prep',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) {
      badRequest('Job not found: ' + params.id);
    }
    const { job, profileId } = resolved!;
    const body = (await request.json().catch(() => ({}))) as { references?: Reference[] };
    if (!Array.isArray(body?.references) || body.references.length === 0) {
      badRequest('references array required (at least one)');
    }

    logEvent('reference-prep', 'Generating reference briefs', {
      level: 'info',
      category: 'application',
      message: `${job.company || '?'} · ${body.references!.length} references`,
    });

    try {
      const { stdout } = await spawnRefPrep({
        company: job.company ?? '',
        role: job.role ?? '',
        references: body.references!,
        profileId,
      });
      const meta = parseRefStdout(stdout);
      logEvent('reference-prep', 'Reference briefs ready', {
        level: 'success',
        category: 'application',
        message: `${meta.filesWritten ?? 0} briefs written`,
      });
      return { ok: true, ...meta };
    } catch (err) {
      reportServerError('reference-prep', 'Reference-prep failed', err, {
        category: 'application',
      });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
);
