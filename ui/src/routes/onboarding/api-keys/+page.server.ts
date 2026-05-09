/** Loads masked existing keys so the form pre-fills if the user is
 *  resuming the wizard after a partial setup. */
import { readEnvMasked } from '$lib/server/env';

export async function load() {
  return { masked: readEnvMasked() };
}
