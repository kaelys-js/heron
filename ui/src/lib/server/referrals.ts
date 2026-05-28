/** referrals -- track referral asks + build the LinkedIn search URL.
 *  TOS-careful: no scraping for mutuals. We open LinkedIn People search
 *  with filters pre-populated, the user picks 1-2 to message, and logs
 *  the ask here so they don't double-ask.
 *  Storage: data/users/{uid}/profiles/{slug}/referral-asks.jsonl. Each
 *  line: { jobId, company, contactName, contactLinkedIn?, askedAt,
 *  status: asked|replied-yes|replied-no|silent, notes? }.
 *  Surfaces: JobActions "Find LinkedIn mutuals at {company}" + /inbox
 *  "X pending referral asks -- follow up?" if asked >7d with no reply. */

import fs from 'node:fs';
import path from 'node:path';
import { profilePath } from './profile-paths';

export type ReferralAsk = {
  jobId: string;
  company: string;
  contactName: string;
  contactLinkedIn?: string;
  askedAt: number;
  status: 'asked' | 'replied-yes' | 'replied-no' | 'silent';
  notes?: string;
};

function asksFile(profileId: string): string {
  return path.join(profilePath(profileId, 'profile-dir'), 'referral-asks.jsonl');
}

export function listAsks(profileId: string): ReferralAsk[] {
  const p = asksFile(profileId);
  if (!fs.existsSync(p)) {
    return [];
  }
  let txt = '';
  try {
    txt = fs.readFileSync(p, 'utf8');
  } catch {
    return [];
  }
  // Last-write-wins on (jobId, contactName) key.
  const map = new Map<string, ReferralAsk>();
  for (const line of txt.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    try {
      const r = JSON.parse(line) as ReferralAsk;
      const key = `${r.jobId}|${r.contactName.toLowerCase()}`;
      map.set(key, r);
    } catch {
      // Corrupt line from a partial write -- skip and continue loading.
    }
  }
  return [...map.values()].sort((a, b) => b.askedAt - a.askedAt);
}

export function logAsk(profileId: string, ask: ReferralAsk): void {
  const p = asksFile(profileId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, `${JSON.stringify(ask)}\n`);
}

/** Build the LinkedIn People search URL pre-filtered to mutuals at a
 *  given company. We use the public LinkedIn search query format --
 *  it works in any logged-in browser. */
export function linkedInMutualsUrl(company: string): string {
  // LinkedIn People search with company filter + 1st-degree (network=F).
  // network=F → 1st-degree connections. company is the canonical company URN
  // or company name -- passing the name works; LinkedIn auto-resolves.
  const params = new URLSearchParams({
    keywords: company,
    network: 'F', // 1st-degree only
    origin: 'GLOBAL_SEARCH_HEADER',
  });
  return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
}

/** Find asks that have been silent for N+ days -- candidates for a
 *  gentle follow-up. */
export function silentAsks(profileId: string, days = 7): ReferralAsk[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return listAsks(profileId).filter((a) => a.status === 'asked' && a.askedAt < cutoff);
}
