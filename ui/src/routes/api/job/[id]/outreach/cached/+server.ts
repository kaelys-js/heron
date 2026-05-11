/**
 * Cached outreach drafts.
 *
 *   GET /api/job/[id]/outreach/cached
 *     → { variants: { persona, content }[] } — one entry per persona that
 *       has an existing draft on disk. Empty array if none yet.
 *
 * Lets the Outreach tab restore previously generated drafts after a page
 * reload without re-spawning Claude.
 */

import fs from 'node:fs';
import path from 'node:path';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { profilePath } from '$lib/server/profile-paths';
import { resolveJobAndProfile } from '$lib/server/job-resolver';

const PERSONAS = ['hiring-manager', 'recruiter', 'peer'] as const;

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'job';
}

export const GET = wrap('outreach-cached', async ({ params, url }: { params: { id: string }; url: URL }) => {
  const resolved = resolveJobAndProfile(params.id, url);
  if (!resolved) badRequest('Job not found: ' + params.id);
  const { job, profileId } = resolved!;
  const slug = slugify(job.id);
  const prepDir = profilePath(profileId, 'interview-prep-dir');
  const variants: { persona: string; content: string; path: string }[] = [];
  for (const persona of PERSONAS) {
    const full = path.join(prepDir, slug + '-outreach-' + persona + '.md');
    if (fs.existsSync(full)) {
      try {
        variants.push({
          persona,
          content: fs.readFileSync(full, 'utf8'),
          path: path.relative(ROOT, full),
        });
      } catch {
        // skip unreadable file
      }
    }
  }
  return { variants };
});
