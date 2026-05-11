/** Pre-fills the form with anything already in the profile.yml of the
 *  target profile (resolved by the onboarding layout-server from
 *  `?profile=<slug>`). Falls back to active profile when no query param. */
import { readProfile } from '$lib/server/profile';
import { getActiveProfileId, getProfile } from '$lib/server/profiles';

export async function load({ url }: { url: URL }) {
  const queryProfile = url.searchParams.get('profile');
  const profileId = (queryProfile && getProfile(queryProfile)) ? queryProfile : getActiveProfileId();
  const snapshot = readProfile(profileId);
  const c = snapshot.candidate ?? {};
  const loc = snapshot.location ?? {};
  return {
    profileId,
    initial: {
      full_name: c.full_name ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      linkedin: c.linkedin ?? '',
      github: c.github ?? '',
      portfolio_url: c.portfolio_url ?? '',
      location_city: loc.city ?? '',
      location_country: loc.country ?? '',
      location_province: loc.province ?? '',
      timezone: loc.timezone ?? '',
      visa_status: loc.visa_status ?? '',
    },
  };
}
