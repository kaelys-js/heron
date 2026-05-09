/**
 * POST /api/profile/general-cv/generate
 *
 * Triggers the cv.md → templates/cv-template.html → PDF pipeline. Returns
 * the new status (path, size, mtime) on success. Failures surface as
 * 500/400 with a descriptive message — common ones are "cv.md missing"
 * (user needs to import their CV first) and "Anthropic key not set".
 *
 * Cost: 1 Anthropic call (~$0.30–$0.60) + ~5s Playwright render.
 */
import { wrap, badRequest } from '$lib/server/api-helpers';
import { generateGeneralCv } from '$lib/server/cv-pdf';
import { logEvent } from '$lib/server/events';

export const POST = wrap('general-cv-generate', async () => {
  if (!process.env.ANTHROPIC_API_KEY) {
    badRequest('Anthropic key not set — configure it in Settings or the API-keys onboarding step.');
  }
  try {
    const result = await generateGeneralCv();
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logEvent('general-cv-generate', 'General CV generation failed', {
      level: 'error',
      category: 'user',
      message: msg.slice(0, 280),
    });
    badRequest(msg);
  }
});
