import { json, error } from '@sveltejs/kit';
import { generateNegotiationBrief } from '$lib/server/interview';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';
import { logEvent } from '$lib/server/events';

export const POST = async ({ request, url }) => {
  const { reportFile, offer } = await request.json();
  if (!reportFile || !offer) {
    throw error(400, 'reportFile + offer required');
  }
  // Profile resolution: caller can pass ?profile=<slug>; else active.
  // The report file + CV + profile.yml all live under the profile's dir.
  const queryProfile = url.searchParams.get('profile');
  const profileId = queryProfile && getProfile(queryProfile) ? queryProfile : getActiveProfileId();
  try {
    const md = await generateNegotiationBrief(profileId, reportFile, offer);
    logEvent('negotiation', 'Negotiation brief ready', {
      level: 'success',
      category: 'task',
      message: reportFile,
    });
    return json({ ok: true, content: md });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logEvent('negotiation', 'Negotiation brief failed', {
      level: 'error',
      category: 'task',
      message: msg,
    });
    return json({ ok: false, error: msg }, { status: 500 });
  }
};
