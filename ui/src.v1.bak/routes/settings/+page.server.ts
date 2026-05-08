import { readEnvMasked } from '$lib/server/env';

export async function load() {
  return { env: readEnvMasked() };
}
