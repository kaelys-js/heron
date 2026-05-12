/**
 * comp-bands-overrides — per-profile overrides of the static TIER_COMP_BANDS.
 *
 * The defaults in negotiation-playbook.ts are baked-at-build-time 2024-2025
 * data. They WILL drift. This module:
 *   1. Tags the defaults with a known last-updated date
 *   2. Lets the user override any band per profile via JSONL at
 *      data/profiles/{slug}/comp-bands.jsonl
 *   3. Surfaces a staleness warning when the bands are >6 months old
 *      AND the user has no overrides
 *   4. Exposes mergedBands(profileId) = defaults overlaid with overrides
 *
 * Why per-profile and not global: a Software Engineering profile + a
 * Consulting profile target very different bands. The user can maintain
 * their own per-identity reference.
 */

import fs from 'node:fs';
import path from 'node:path';
import { profilePath } from './profile-paths';
import {
  DEFAULT_TIER_COMP_BANDS,
  TIER_COMP_BANDS_LAST_UPDATED_MS,
  type CompBand,
} from './negotiation-playbook';

const OVERRIDE_FILE = 'comp-bands.jsonl';

export type BandOverride = {
  /** The tier key (e.g. 'faang-senior'). Matches DEFAULT_TIER_COMP_BANDS. */
  key: string;
  /** Override the band data. Partial — fields not present fall through. */
  band: Partial<CompBand>;
  /** ms epoch when the user updated this entry. */
  updatedAt: number;
};

function overrideFilePath(profileId: string): string {
  return path.join(profilePath(profileId, 'profile-dir'), OVERRIDE_FILE);
}

export function readOverrides(profileId: string): Map<string, BandOverride> {
  const p = overrideFilePath(profileId);
  const out = new Map<string, BandOverride>();
  if (!fs.existsSync(p)) return out;
  let txt = '';
  try { txt = fs.readFileSync(p, 'utf8'); } catch { return out; }
  for (const line of txt.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as BandOverride;
      if (row.key) out.set(row.key, row);
    } catch {}
  }
  return out;
}

export function writeOverride(profileId: string, override: Omit<BandOverride, 'updatedAt'>): BandOverride {
  const row: BandOverride = { ...override, updatedAt: Date.now() };
  const p = overrideFilePath(profileId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, JSON.stringify(row) + '\n');
  return row;
}

export function deleteOverride(profileId: string, key: string): boolean {
  const overrides = readOverrides(profileId);
  if (!overrides.has(key)) return false;
  // Rewrite the file without the deleted key.
  const remaining = [...overrides.values()].filter((o) => o.key !== key);
  const p = overrideFilePath(profileId);
  fs.writeFileSync(p, remaining.map((r) => JSON.stringify(r)).join('\n') + (remaining.length ? '\n' : ''));
  return true;
}

/** Defaults overlaid with per-profile overrides. The output is what
 *  /comp-eval + /negotiation should display. */
export function mergedBands(profileId: string): Record<string, CompBand> {
  const overrides = readOverrides(profileId);
  const out: Record<string, CompBand> = {};
  for (const [k, v] of Object.entries(DEFAULT_TIER_COMP_BANDS)) {
    const override = overrides.get(k);
    if (override) {
      out[k] = {
        band: override.band.band ?? v.band,
        base: override.band.base ?? v.base,
        total: override.band.total ?? v.total,
        notes: override.band.notes ?? v.notes,
      };
    } else {
      out[k] = v;
    }
  }
  // Allow overrides to ADD new tiers the defaults don't cover.
  for (const [k, override] of overrides.entries()) {
    if (out[k]) continue;
    if (!override.band.band || !override.band.base || !override.band.total) continue;
    out[k] = {
      band: override.band.band,
      base: override.band.base,
      total: override.band.total,
      notes: override.band.notes ?? '',
    };
  }
  return out;
}

/** Staleness check. Returns true when defaults are >6 months old AND
 *  the user has no overrides. Surfaces a yellow banner in the UI. */
export function bandsAreStale(profileId: string, now: number = Date.now()): {
  stale: boolean;
  ageMonths: number;
  hasOverrides: boolean;
  newestOverrideAt: number | null;
} {
  const ageMs = now - TIER_COMP_BANDS_LAST_UPDATED_MS;
  const ageMonths = Math.floor(ageMs / (30 * 24 * 60 * 60 * 1000));
  const overrides = readOverrides(profileId);
  const newest = [...overrides.values()].reduce(
    (max, o) => (o.updatedAt > max ? o.updatedAt : max), 0,
  );
  const hasOverrides = overrides.size > 0;
  // Stale = defaults > 6mo AND user hasn't updated their overrides in 6mo.
  const overridesStale = newest > 0 ? (now - newest) > 6 * 30 * 24 * 60 * 60 * 1000 : true;
  return {
    stale: ageMonths >= 6 && (!hasOverrides || overridesStale),
    ageMonths,
    hasOverrides,
    newestOverrideAt: newest || null,
  };
}
