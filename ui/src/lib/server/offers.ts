/** offers -- per-job structured offer + negotiation tracking. Stored at
 *  data/users/{userId}/profiles/{slug}/offers.json as jobId → OfferRecord.
 *  Captures every round (initial / counter / final) to drive multi-offer
 *  side-by-side comparison (BATNA on /comparison), the EV calculator
 *  (Phase VII.1), the per-job Negotiation tab (Phase VI.3), and the
 *  levels.fyi / Glassdoor comp benchmark (Phase VI.2). */

import fs from 'node:fs';
import path from 'node:path';
import { profilePath } from './profile-paths';
import { getActiveProfileId } from './profiles';

export type CompCurrency = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY' | 'BRL' | 'INR';

export type OfferRound = {
  /** 'initial', 'counter-by-candidate', 'counter-by-recruiter', 'final'. */
  kind: 'initial' | 'counter-by-candidate' | 'counter-by-recruiter' | 'final';
  /** Unix ms. */
  at: number;
  base: number;
  /** Annual target bonus (cash, not equity). */
  bonus?: number;
  /** Signing bonus (one-time cash). */
  signing?: number;
  /** Equity in dollar terms (4-yr vesting unless equityVestingYears set). */
  equity?: number;
  equityVestingYears?: number;
  /** Equity-cliff vesting in months (default 12 for typical 4-yr-with-cliff). */
  equityCliffMonths?: number;
  /** Any other quantifiable benefit (relo, learning budget, etc.) in cash equivalent. */
  otherCash?: number;
  /** Free-form notes the user can write inline. */
  notes?: string;
};

export type OfferBenchmark = {
  /** Provider that supplied the band. */
  source: 'levels.fyi' | 'glassdoor' | 'manual' | 'unknown';
  /** Median TC for this role/level/location. */
  medianTc?: number;
  /** 25th-percentile TC. */
  p25Tc?: number;
  /** 75th-percentile TC. */
  p75Tc?: number;
  /** Currency for the band. */
  currency: CompCurrency;
  /** When the benchmark was last refreshed. */
  refreshedAt: number;
  /** Source URL where the data was pulled from. */
  sourceUrl?: string;
};

export type OfferRecord = {
  jobId: string;
  /** Top-level currency for all rounds in this offer. */
  currency: CompCurrency;
  /** Date the first offer landed. */
  receivedAt: number;
  /** Decision deadline the recruiter set. Used by the "decide-by" alarm. */
  decisionDeadline?: number;
  /** Each negotiation round, in time order. The last entry is the current state. */
  rounds: OfferRound[];
  /** When the candidate signed (or declined). */
  closedAt?: number;
  closedOutcome?: 'accepted' | 'declined' | 'rescinded';
  benchmark?: OfferBenchmark;
  /** Computed at write-time so /comparison doesn't recompute on every page load. */
  cachedTc?: number;
  cachedTcAt?: number;
};

function statePath(profileId?: string): string {
  return profilePath(profileId ?? getActiveProfileId(), 'offers-json');
}

function readAll(profileId?: string): Record<string, OfferRecord> {
  const p = statePath(profileId);
  try {
    if (!fs.existsSync(p)) {
      return {};
    }
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, OfferRecord>) : {};
  } catch {
    return {};
  }
}

function writeAll(state: Record<string, OfferRecord>, profileId?: string): void {
  const p = statePath(profileId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2));
}

/** Compute the annualised TC of an offer round. Equity is annualised over
 *  `equityVestingYears` (default 4); signing is annualised over 1 year. */
export function annualisedTc(round: OfferRound): number {
  const equityPerYear = round.equity ? round.equity / (round.equityVestingYears || 4) : 0;
  const signingAnnualised = round.signing || 0; // count fully in year 1
  return (
    (round.base || 0) +
    (round.bonus || 0) +
    equityPerYear +
    signingAnnualised +
    (round.otherCash || 0)
  );
}

export function currentRound(offer: OfferRecord): OfferRound | undefined {
  return offer.rounds[offer.rounds.length - 1];
}

export function getOffer(jobId: string, profileId?: string): OfferRecord | undefined {
  return readAll(profileId)[jobId];
}

export function listOffers(profileId?: string): OfferRecord[] {
  return Object.values(readAll(profileId));
}

/** List offers that are still in negotiation (not closed). Used for /comparison. */
export function listActiveOffers(profileId?: string): OfferRecord[] {
  return listOffers(profileId).filter((o) => !o.closedAt);
}

export function upsertOffer(record: OfferRecord, profileId?: string): OfferRecord {
  const all = readAll(profileId);
  const cur = currentRound(record);
  record.cachedTc = cur ? annualisedTc(cur) : 0;
  record.cachedTcAt = Date.now();
  all[record.jobId] = record;
  writeAll(all, profileId);
  return record;
}

export function appendRound(
  jobId: string,
  round: OfferRound,
  profileId?: string,
): OfferRecord | undefined {
  const all = readAll(profileId);
  const existing = all[jobId];
  if (!existing) {
    return undefined;
  }
  existing.rounds.push(round);
  existing.cachedTc = annualisedTc(round);
  existing.cachedTcAt = Date.now();
  all[jobId] = existing;
  writeAll(all, profileId);
  return existing;
}

export function closeOffer(
  jobId: string,
  outcome: 'accepted' | 'declined' | 'rescinded',
  profileId?: string,
): OfferRecord | undefined {
  const all = readAll(profileId);
  const existing = all[jobId];
  if (!existing) {
    return undefined;
  }
  existing.closedAt = Date.now();
  existing.closedOutcome = outcome;
  all[jobId] = existing;
  writeAll(all, profileId);
  return existing;
}

export function attachBenchmark(
  jobId: string,
  benchmark: OfferBenchmark,
  profileId?: string,
): OfferRecord | undefined {
  const all = readAll(profileId);
  const existing = all[jobId];
  if (!existing) {
    return undefined;
  }
  existing.benchmark = benchmark;
  all[jobId] = existing;
  writeAll(all, profileId);
  return existing;
}

/** BATNA strength: how does this offer compare to the user's current best
 *  alternative? Returns a 0-100 score where 100 = strongest alternative,
 *  0 = no alternative. Drives the negotiation tab's `leverage` badge. */
export function batnaScore(jobId: string, profileId?: string): number {
  const all = listActiveOffers(profileId);
  const target = all.find((o) => o.jobId === jobId);
  if (!target || !target.cachedTc) {
    return 0;
  }
  const others = all.filter((o) => o.jobId !== jobId && o.cachedTc);
  if (others.length === 0) {
    return 0;
  }
  const bestAlt = Math.max(...others.map((o) => o.cachedTc!));
  // BATNA strength as a ratio: 1.0 means alternative matches current,
  // higher means the alternative is BETTER (strong `leverage`).
  const ratio = bestAlt / target.cachedTc;
  if (ratio >= 1.15) {
    return 100;
  }
  if (ratio >= 1.05) {
    return 80;
  }
  if (ratio >= 0.95) {
    return 60;
  }
  if (ratio >= 0.8) {
    return 40;
  }
  return 20;
}
