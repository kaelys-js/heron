import { readEnvMasked, loadEnv } from '$lib/server/env';
loadEnv();
export async function load() {
  return { env: readEnvMasked() };
}
