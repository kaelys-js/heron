/**
 * apply-timing — turn a job's first_seen date into a "apply NOW" /
 * "still good" / "already late" band.
 *
 * Industry baseline: postings on Days 1-3 convert to phone screen at
 * 3-5× the rate of postings on Days 7+. After ~Day 14, most pipelines
 * are full enough that you're an "also-ran" regardless of CV quality.
 *
 * We use scan-history.first_seen as the proxy for "posted on" — it's
 * not perfect (a posting could have existed before we discovered it),
 * but it's monotonically non-decreasing relative to the true post
 * date, so the ordering is correct even if absolute numbers skew late.
 */

import { readScanHistorySummary } from './scan-history';
import { profilePath } from './profile-paths';
import fs from 'node:fs';

export type TimingBand = 'fresh' | 'good' | 'fading' | 'late';

export type ApplyTiming = {
  /** YYYY-MM-DD of when we first saw this URL. Null if not in scan-history. */
  firstSeen: string | null;
  /** Whole days between firstSeen and today. */
  daysSinceFirstSeen: number | null;
  band: TimingBand;
  /** Short label suitable for a badge. */
  label: string;
  /** Coaching one-liner — what to do given the band. */
  advice: string;
};

const BAND_LABELS: Record<TimingBand, string> = {
  fresh: 'Apply NOW',
  good: 'Still early',
  fading: 'Getting late',
  late: 'Already late',
};

const BAND_ADVICE: Record<TimingBand, string> = {
  fresh:
    'Day 1-3 applications convert 3-5× more than Day 7+. Highest-leverage time slot. Apply today.',
  good: 'Within the first week — still well-positioned. Apply by tomorrow at the latest.',
  fading:
    'Pipeline already filling. Tailor harder + lead with a strong narrative. Worth it but expect lower yield.',
  late: 'Days 14+ — pipeline is closed in most cases. Apply only if extremely high-fit; better to skip and free up your daily cap for fresh listings.',
};

/** Classify a job's age into one of 4 bands. */
function bandFor(days: number | null): TimingBand {
  if (days == null) return 'late';
  if (days <= 3) return 'fresh';
  if (days <= 7) return 'good';
  if (days <= 14) return 'fading';
  return 'late';
}

function daysBetween(iso: string): number {
  const t0 = Date.parse(iso + 'T00:00:00Z');
  if (!Number.isFinite(t0)) return Number.NaN;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const diff = todayStart.getTime() - t0;
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

/** Look up a job URL's firstSeen via the per-profile scan-history.tsv. */
function readFirstSeen(profileId: string, url: string): string | null {
  // We don't go through readScanHistorySummary because it aggregates;
  // we need the raw url → firstSeen row.
  try {
    const p = profilePath(profileId, 'scan-history');
    if (!fs.existsSync(p)) return null;
    const txt = fs.readFileSync(p, 'utf8');
    for (const line of txt.split('\n').slice(1)) {
      if (!line.trim()) continue;
      const cells = line.split('\t');
      if (cells[0] !== url) continue;
      const fs = cells[1];
      if (/^\d{4}-\d{2}-\d{2}$/.test(fs)) return fs;
    }
  } catch {
    // scan-history.tsv read failure — return null so the UI degrades to
    // "unknown timing" rather than crashing. Caller falls back to neutral
    // classification.
  }
  return null;
}

/** Public: classify a job's apply-timing window. */
export function applyTimingFor(profileId: string, url: string): ApplyTiming {
  const firstSeen = readFirstSeen(profileId, url);
  const days = firstSeen ? daysBetween(firstSeen) : null;
  const band = bandFor(days);
  return {
    firstSeen,
    daysSinceFirstSeen: Number.isFinite(days as number) ? (days as number) : null,
    band,
    label: BAND_LABELS[band],
    advice: BAND_ADVICE[band],
  };
}

// Re-export to silence unused-import lints from related callers.
export { readScanHistorySummary };
