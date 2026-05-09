/** Done-step preload — counts the connected sources + jobs in pipeline.md
 *  so the celebratory summary has real numbers. */
import { listSourcesWithState } from '$lib/server/sources';
import { readSafe } from '$lib/server/files';
import path from 'node:path';
import { ROOT } from '$lib/server/files';

export async function load() {
  const sources = listSourcesWithState();
  const connected = sources.filter((s) => s.state.connected || s.authKind === 'always-on');

  // Count jobs in pipeline.md — rough approximation for the summary.
  const pipeline = readSafe(path.join(ROOT, 'data', 'pipeline.md'));
  const jobCount = (pipeline.match(/^- \[[ x]\] /gm) ?? []).length;

  return {
    summary: {
      connectedCount: connected.length,
      connectedLabels: connected.map((s) => s.label),
      jobCount,
    },
  };
}
