/**
 * Read/write per-profile `portals.yml` — the scanner's source of truth for
 * tracked companies, title filters, and search queries.
 *
 * Each profile owns its own portals.yml under `data/profiles/{id}/portals.yml`
 * (electrician's tracked companies are very different from software's). On
 * first read for a profile, if portals.yml doesn't exist there, we fall back
 * to the bundled template `templates/portals.example.yml` so the user inherits
 * the curated 100+-company starter list — then writes seed it into the
 * per-profile path on first save.
 *
 * Every exported function takes an OPTIONAL `profileId` as its first arg;
 * undefined → active profile.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { ROOT, readSafe } from './files';
import { profilePath, ensureProfileDirs } from './profile-paths';
import { getActiveProfileId } from './profiles';

/** System-layer template — shared across profiles, never overwritten. */
const PORTALS_TEMPLATE = path.join(ROOT, 'templates', 'portals.example.yml');

export type TitleFilter = {
  positive: string[];
  negative: string[];
  seniority_boost?: string[];
};

export type TrackedCompany = {
  name: string;
  careers_url: string;
  enabled?: boolean;
  notes?: string;
  api?: string;
  scan_method?: string;
  scan_query?: string;
  ats?: string;
  workday?: { tenant?: string; pod?: string; site?: string };
  workday_max_pages?: number;
};

export type PortalsSnapshot = {
  exists: boolean;
  source: 'portals.yml' | 'template' | 'empty';
  title_filter: TitleFilter;
  tracked_companies: TrackedCompany[];
  search_queries: { name: string; query: string; enabled?: boolean }[];
};

function resolveId(profileId?: string): string {
  return profileId ?? getActiveProfileId();
}

/** Load the YAML doc preferring the user's per-profile portals.yml, falling
 *  back to the bundled template. Returns `null` when neither exists. */
function readDoc(profileId?: string): { doc: Record<string, unknown> | null; source: PortalsSnapshot['source'] } {
  const id = resolveId(profileId);
  const portalsPath = profilePath(id, 'portals-yml');
  if (fs.existsSync(portalsPath)) {
    try {
      const doc = parse(readSafe(portalsPath)) as Record<string, unknown>;
      return { doc: doc ?? {}, source: 'portals.yml' };
    } catch {
      return { doc: {}, source: 'portals.yml' };
    }
  }
  if (fs.existsSync(PORTALS_TEMPLATE)) {
    try {
      const doc = parse(readSafe(PORTALS_TEMPLATE)) as Record<string, unknown>;
      return { doc: doc ?? {}, source: 'template' };
    } catch {
      return { doc: {}, source: 'template' };
    }
  }
  return { doc: null, source: 'empty' };
}

export function readPortals(profileId?: string): PortalsSnapshot {
  const id = resolveId(profileId);
  const { doc, source } = readDoc(id);
  const tf = (doc?.title_filter ?? {}) as Partial<TitleFilter>;
  const companies = Array.isArray(doc?.tracked_companies)
    ? (doc!.tracked_companies as TrackedCompany[])
    : [];
  const queries = Array.isArray(doc?.search_queries)
    ? (doc!.search_queries as { name: string; query: string; enabled?: boolean }[])
    : [];
  return {
    exists: source === 'portals.yml',
    source,
    title_filter: {
      positive: Array.isArray(tf.positive) ? tf.positive : [],
      negative: Array.isArray(tf.negative) ? tf.negative : [],
      seniority_boost: Array.isArray(tf.seniority_boost) ? tf.seniority_boost : undefined,
    },
    tracked_companies: companies,
    search_queries: queries,
  };
}

/**
 * Patch `title_filter.positive` and `title_filter.negative` in the profile's
 * portals.yml, preserving every other field (tracked_companies, search_queries,
 * sources, seniority_boost). If portals.yml doesn't exist yet for this profile,
 * the template is copied first so the curated starter list is inherited.
 */
export function writePortalsTitleFilter(
  profileId: string | undefined,
  positive: string[],
  negative: string[],
): PortalsSnapshot;
export function writePortalsTitleFilter(positive: string[], negative: string[]): PortalsSnapshot;
export function writePortalsTitleFilter(
  arg1: string | undefined | string[],
  arg2: string[],
  arg3?: string[],
): PortalsSnapshot {
  // Disambiguate: 3-arg (profileId, positive, negative) vs 2-arg (positive, negative).
  let profileId: string | undefined;
  let positive: string[];
  let negative: string[];
  if (Array.isArray(arg1)) {
    profileId = undefined;
    positive = arg1;
    negative = arg2;
  } else {
    profileId = arg1;
    positive = arg2;
    negative = arg3 ?? [];
  }
  const id = resolveId(profileId);
  ensureProfileDirs(id);
  const portalsPath = profilePath(id, 'portals-yml');

  const { doc, source } = readDoc(id);
  // Bootstrap from template if there's nothing yet.
  if (!doc || source === 'empty') {
    fs.writeFileSync(
      portalsPath,
      stringify({ title_filter: { positive, negative } }, { lineWidth: 100 }),
    );
    return readPortals(id);
  }
  // Bootstrap from template — copy so we keep the curated companies + queries.
  if (source === 'template') {
    fs.copyFileSync(PORTALS_TEMPLATE, portalsPath);
  }
  // Re-read from the now-existing portals.yml so we round-trip the same doc.
  let live: Record<string, unknown> = {};
  try {
    live = (parse(readSafe(portalsPath)) as Record<string, unknown>) ?? {};
  } catch {
    live = {};
  }
  const tf = (live.title_filter as Record<string, unknown>) ?? {};
  tf.positive = positive;
  tf.negative = negative;
  live.title_filter = tf;
  fs.writeFileSync(portalsPath, stringify(live, { lineWidth: 100 }));
  return readPortals(id);
}

// D18 — `writePortalsCompanies` removed: no caller. The "Add this company"
// flow it was anticipating doesn't exist yet; when it lands, reinstate
// from git history rather than carry dead surface in the meantime.
