/**
 * Stream a job's tailored CV PDF inline.
 *
 *   GET /api/job/[id]/pdf
 *
 * Looks up the job's `pdfFile` (relative to output/) and streams it with
 * Content-Type: application/pdf · Content-Disposition: inline so browsers
 * render it in an iframe instead of downloading. 404 if no PDF has been
 * generated for this job yet.
 *
 * Defence-in-depth: rejects any pdfFile that resolves outside OUTPUT_DIR
 * (guards against ../../../etc/passwd-style filename injection from a
 * malformed applications.md row).
 */

import fs from 'node:fs';
import path from 'node:path';
import { error } from '@sveltejs/kit';
import { loadAllJobs } from '$lib/server/parsers';
import { OUTPUT_DIR } from '$lib/server/files';

export const GET = async ({ params }: { params: { id: string } }) => {
  const job = loadAllJobs().find((j) => j.id === params.id);
  if (!job) throw error(404, 'Job not found');
  if (!job.pdfFile) throw error(404, 'No CV PDF generated for this job yet');

  // Resolve safely under OUTPUT_DIR — reject any traversal attempt.
  const candidate = path.resolve(OUTPUT_DIR, job.pdfFile);
  const root = path.resolve(OUTPUT_DIR);
  if (!candidate.startsWith(root + path.sep) && candidate !== root) {
    throw error(400, 'Invalid PDF path');
  }
  if (!fs.existsSync(candidate)) {
    throw error(404, 'PDF file missing on disk: ' + job.pdfFile);
  }

  const buf = fs.readFileSync(candidate);
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="' + path.basename(candidate) + '"',
      'Content-Length': String(buf.byteLength),
      // 5 min cache — tailored CVs don't change after they're written
      'Cache-Control': 'private, max-age=300',
    },
  });
};
