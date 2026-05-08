import { buildRuntimeReport } from '$lib/server/runtime-info';
import { loadEnv } from '$lib/server/env';

loadEnv();

export async function load() {
  return { report: buildRuntimeReport() };
}
