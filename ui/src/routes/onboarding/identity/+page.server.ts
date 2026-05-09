/** Pre-fills the form with anything already in profile.yml — useful when
 *  resuming the wizard or when the user came from /profile. */
import { readProfile } from '$lib/server/profile';

export async function load() {
  const snapshot = readProfile();
  const c = snapshot.candidate ?? {};
  const loc = snapshot.location ?? {};
  return {
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
