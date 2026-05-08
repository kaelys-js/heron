import { readProfile } from '$lib/server/profile';

export async function load() {
  return { profile: readProfile() };
}
