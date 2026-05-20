/** GET /api/job/[id]/pdf -- stream a job's tailored CV PDF inline. Looks up
 *  job.pdfFile (relative to output/) and streams with Content-Type:
 *  application/pdf + Content-Disposition: inline so browsers render in an
 *  iframe instead of downloading. 404 if no PDF generated yet. Defence-in-
 *  depth: rejects pdfFile resolving outside OUTPUT_DIR (guards traversal
 *  injection from a malformed applications.md row). */

import fs from 'node:fs';
import path from 'node:path';
import { error } from '@sveltejs/kit';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { profilePath } from '$lib/server/profile-paths';
import { reportServerError } from '$lib/server/events';

export const GET = async ({ params, url }: { params: { id: string }; url: URL }) => {
  const resolved = resolveJobAndProfile(params.id, url);
  if (!resolved) throw error(404, 'Job not found');
  const { job, profileId } = resolved;
  if (!job.pdfFile) throw error(404, 'No CV PDF generated for this job yet');

  // Resolve safely under THIS JOB'S profile output dir -- reject traversal.
  const outputDir = profilePath(profileId, 'output-dir');
  const candidate = path.resolve(outputDir, job.pdfFile);
  const root = path.resolve(outputDir);
  if (!candidate.startsWith(root + path.sep) && candidate !== root) {
    throw error(400, 'Invalid PDF path');
  }
  if (!fs.existsSync(candidate)) {
    throw error(404, 'PDF file missing on disk: ' + job.pdfFile);
  }

  // existsSync → readFileSync is technically a TOCTOU race; if the file
  // disappears (rotation, delete, etc.) between the two calls readFileSync
  // throws and we'd return a 500 with no log entry. Wrap in an IIFE so the
  // error path can call reportServerError + throw a 404 without TS losing
  // narrowing on the Buffer type.
  const buf = (() => {
    try {
      return fs.readFileSync(candidate);
    } catch (e) {
      reportServerError('job-pdf', 'Failed to read PDF', e, {
        category: 'api',
        link: '/job/' + params.id,
      });
      throw error(404, 'PDF file unreadable: ' + (e instanceof Error ? e.message : String(e)));
    }
  })();
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="' + path.basename(candidate) + '"',
      'Content-Length': String(buf.byteLength),
      // 5 min cache -- tailored CVs don't change after they're written
      'Cache-Control': 'private, max-age=300',
    },
  });
};
