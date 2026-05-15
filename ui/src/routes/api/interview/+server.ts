/**
 * Generic interview-prep endpoint — useful when the caller already has a
 * report file in hand but no Job row (e.g. interview prep for a posting
 * the user never added to their pipeline, or external integrations).
 *
 * The per-Job equivalent `/api/job/[id]/interview-prep` persists the
 * resulting brief in the active user's `profiles/{id}/interview-prep/<jobId>.md`
 * (i.e. `data/users/{uid}/profiles/{id}/interview-prep/<jobId>.md`, or
 * `data/profiles/{id}/interview-prep/<jobId>.md` in legacy single-user installs).
 * This endpoint returns the brief inline without persistence, so users
 * who don't want the brief filed away can call it ad-hoc.
 *
 * Accepts:
 *   ?profile=<slug>  — which profile's CV + report dir to read from
 *                      (defaults to active)
 *   body { reportFile, archetype? }
 */
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
