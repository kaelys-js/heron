/**
 * /api/job/[id]/keyword-match — deterministic JD ⇄ CV keyword overlap.
 *
 * GET → { score, matched, missing, considered }
 *
 * Pulls the JD text from the deep-eval report (the oferta mode embeds it)
 * and the CV from cv.md (NOT the rendered PDF — we want the source text).
 *
 * Returns null when no report exists yet — the UI should hide the badge
 * in that case and prompt the user to run a deep-eval first.
 */

import fs from 'node:fs';
import path from 'node:path';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { profilePath } from '$lib/server/profile-paths';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { keywordMatch, extractJdFromReport } from '$lib/server/keyword-match';

export const GET = wrap('keyword-match', async ({ params, url }: { params: { id: string }; url: URL }) => {
  const resolved = resolveJobAndProfile(params.id, url);
  if (!resolved) badRequest('Job not found: ' + params.id);
  const { job, profileId } = resolved!;

  // Source of CV text: cv.md (per-profile). Falls back to empty string,
  // which produces a 0% score — accurate for the "no CV yet" case.
  let cvText = '';
  try {
    const cvPath = profilePath(profileId, 'cv-md');
    if (fs.existsSync(cvPath)) cvText = fs.readFileSync(cvPath, 'utf8');
  } catch {}

  // Source of JD text: the deep-eval report (oferta mode embeds the JD).
  // If no report exists yet, return null so the UI can prompt.
  if (!job.reportFile) {
    return {
      hasReport: false,
      cvBytes: cvText.length,
      score: null,
      matched: null,
      missing: null,
      considered: null,
    };
  }

  let reportText = '';
  try {
    const reportPath = path.join(ROOT, job.reportFile);
    if (fs.existsSync(reportPath)) reportText = fs.readFileSync(reportPath, 'utf8');
  } catch {}

  const jdText = extractJdFromReport(reportText);
  const result = keywordMatch(jdText, cvText);

  return {
    hasReport: true,
    jdBytes: jdText.length,
    cvBytes: cvText.length,
    score: result.score,
    matched: result.matched,
    missing: result.missing,
    considered: result.considered,
  };
});
