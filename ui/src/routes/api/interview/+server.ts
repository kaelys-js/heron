/** POST /api/interview -- generic interview-prep when caller has a report
 *  file but no Job row (postings not in the pipeline, external integrations).
 *  Returns the brief INLINE without persistence; for per-Job + persisted, use
 *  /api/job/[id]/interview-prep. Accepts ?profile=<slug> (defaults to active)
 *  and body { reportFile, archetype? }. */
import { json, error } from '@sveltejs/kit';
import { generateInterviewPrep } from '$lib/server/interview';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';
import { logEvent } from '$lib/server/events';

export const POST = async ({ request, url }) => {
  const { reportFile, archetype } = await request.json();
  if (!reportFile) throw error(400, 'reportFile required');
  const queryProfile = url.searchParams.get('profile');
  const profileId = queryProfile && getProfile(queryProfile) ? queryProfile : getActiveProfileId();
  try {
    logEvent('interview', 'Generating interview prep', {
      category: 'task',
      message: reportFile + ' · profile=' + profileId,
    });
    const md = await generateInterviewPrep(profileId, reportFile, archetype);
    logEvent('interview', 'Interview prep ready', {
      level: 'success',
      category: 'task',
      message: reportFile,
    });
    return json({ ok: true, content: md, profileId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logEvent('interview', 'Interview prep failed', {
      level: 'error',
      category: 'task',
      message: msg,
    });
    return json({ ok: false, error: msg }, { status: 500 });
  }
};
