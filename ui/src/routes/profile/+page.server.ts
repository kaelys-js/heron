import { readProfile } from '$lib/server/profile';
import { generalCvStatus } from '$lib/server/cv-pdf';

export async function load() {
  return {
    profile: readProfile(),
    generalCv: generalCvStatus(),
  };
}
