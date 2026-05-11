/**
 * /sources — connection-state dashboard.
 *
 * Loads the merged shape (KNOWN_SOURCES × current state) plus per-source
 * 7-day pull counts derived from data/scan-history.tsv. The page renders
 * one card per source.
 */

import { listSourcesWithState } from '$lib/server/sources';
import { readSafe } from '$lib/server/files';
import { profilePath } from '$lib/server/profile-paths';
import { listProfiles, getActiveProfileId } from '$lib/server/profiles';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Count rows in the active profile's scan-history.tsv per `portal` column.
 *  When profileId === 'all', sum across every profile. */
function pullCountsLast7d(profileId: string): Record<string, { last7d: number; total: number }> {
  const out: Record<string, { last7d: number; total: number }> = {};
  const cutoff = new Date(Date.now() - 7 * DAY_MS).toISOString().slice(0, 10);

  const consume = (path: string) => {
    const txt = readSafe(path);
    if (!txt) return;
    const lines = txt.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split('\t');
      if (parts.length < 3) continue;
      const date = parts[1];
      const portal = parts[2];
      if (!portal) continue;
      if (!out[portal]) out[portal] = { last7d: 0, total: 0 };
      out[portal].total += 1;
      if (date >= cutoff) out[portal].last7d += 1;
    }
  };

  if (profileId === 'all') {
    for (const p of listProfiles()) consume(profilePath(p.id, 'scan-history'));
  } else {
    consume(profilePath(profileId, 'scan-history'));
  }
  return out;
}

export async function load({ url }: { url: URL }) {
  const queryProfile = url.searchParams.get('profile');
  const profileId = queryProfile ?? getActiveProfileId();
  const sources = listSourcesWithState();
  const pulls = pullCountsLast7d(profileId);
  return {
    profileId,
    sources: sources.map((s) => ({
      ...s,
      pulls: pulls[s.id] ?? pulls[mapToScanHistorySource(s.id)] ?? { last7d: 0, total: 0 },
    })),
  };
}

/** scan.mjs writes `{type}-api` (e.g. `workday-api`) into scan-history.tsv,
 *  but our KNOWN_SOURCES uses friendlier ids. Some bridging required for
 *  the always-on aggregate sources. */
function mapToScanHistorySource(id: string): string {
  const map: Record<string, string> = {
    'scan-portals': 'workday-api', // hack: aggregates many providers; just show "anything"
    'scan-broad': 'linkedin',
    'scan-curated': 'aijobs',
    'linkedin-auth': 'linkedin-authenticated',
    'indeed-auth': 'indeed-authenticated',
    'gmail-imap': 'linkedin-alert-email',
  };
  return map[id] ?? id;
}
