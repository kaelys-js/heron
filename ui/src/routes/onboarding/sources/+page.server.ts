/** Loads connection state for the onboarding sources step. We keep the
 *  shape compatible with /sources so the same KnownSource + SourceState
 *  contract is reused. */
import { listSourcesWithState } from '$lib/server/sources';

export async function load() {
  const sources = listSourcesWithState();
  return { sources };
}
