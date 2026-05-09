/**
 * GET /api/profile/general-cv/status
 *
 * Returns whether the user has a generated general-CV PDF, when it was
 * generated, and whether cv.md has been modified since (i.e. the PDF is
 * stale and the user should regenerate). Used by the /profile UI to render
 * the right state on the "Generate general CV" card.
 */
import { wrap } from '$lib/server/api-helpers';
import { generalCvStatus } from '$lib/server/cv-pdf';

export const GET = wrap('general-cv-status', async () => {
  return generalCvStatus();
});
