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
import { loadAllJobs } from '$lib/server/parsers';
import { ROOT } from '$lib/server/files';

const PREP_DIR = path.join(ROOT, 'interview-prep');
const PERSONAS = ['hiring-manager', 'recruiter', 'peer'] as const;

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'job';
}

export const GET = wrap('outreach-cached', async ({ params }: { params: { id: string } }) => {
  const job = loadAllJobs().find((j) => j.id === params.id);
  if (!job) badRequest('Job not found: ' + params.id);
  const slug = slugify(job!.id);
  const variants: { persona: string; content: string; path: string }[] = [];
  for (const persona of PERSONAS) {
    const full = path.join(PREP_DIR, slug + '-outreach-' + persona + '.md');
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
