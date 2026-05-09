/** Pre-fills the textarea with whatever's already in cv.md (so the user can
 *  edit / re-run rather than starting from scratch when revisiting). Also
 *  reports whether LinkedIn is connected — the LinkedIn URL import path is
 *  only available when there's a saved authenticated session to scrape with. */
import { readSiblingFile } from '$lib/server/profile';
import { getSource } from '$lib/server/sources';
import { readProfile } from '$lib/server/profile';

export async function load() {
  const existing = readSiblingFile('cv') ?? '';
  const linkedinConnected = getSource('linkedin-auth').connected;
  // Suggest the user's LinkedIn URL from profile.yml as the default value
  // for the URL input (saves a copy/paste step).
  const profile = readProfile();
  const linkedinUrl = profile.candidate?.linkedin
    ? (profile.candidate.linkedin.startsWith('http')
      ? profile.candidate.linkedin
      : 'https://www.' + profile.candidate.linkedin.replace(/^www\./, ''))
    : '';
  return { existing, linkedinConnected, linkedinUrl };
}
