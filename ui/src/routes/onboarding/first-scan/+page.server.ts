/** First-scan step preload — list which sources are connected so we know
 *  which child scanners scan-all will fan out to. We don't trigger anything
 *  here; the page does that on mount via /api/run. */
import { listSourcesWithState } from '$lib/server/sources';

export async function load() {
  const sources = listSourcesWithState();
  // Filter to the children scan-all actually fans out to (matches the logic
  // in scan-all.job.ts). Always-on aggregators always run.
  const children = [
    { id: 'scan-portals', label: 'ATS providers (9)', alwaysOn: true },
    { id: 'scan',         label: 'JobSpy + free aggregators', alwaysOn: true },
    { id: 'scan-curated', label: 'Curated boards', alwaysOn: true },
    { id: 'scan-linkedin-auth', label: 'LinkedIn (authenticated)', source: 'linkedin-auth' },
    { id: 'scan-indeed-auth',   label: 'Indeed (authenticated)',   source: 'indeed-auth' },
    { id: 'scan-email-imap',    label: 'Gmail (job alerts)',       source: 'gmail-imap' },
  ].filter((c) => {
    if (c.alwaysOn) return true;
    return sources.find((s) => s.id === c.source)?.state.connected ?? false;
  });
  return { children };
}
