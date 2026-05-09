/**
 * Read/write `portals.yml` — the scanner's source of truth for tracked
 * companies, title filters, and search queries.
 *
 * Onboarding's targeting step uses this to seed `title_filter.positive` and
 * `title_filter.negative` from the user's chosen target roles + defaults.
 * The rest of the file (tracked_companies, search_queries, sources) is
 * preserved verbatim so existing scanner setups aren't clobbered.
 *
 * On first run, if portals.yml doesn't exist, we copy the canonical template
 * from `templates/portals.example.yml` so the user inherits the curated
 * 100+-company starter list.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { ROOT, readSafe } from './files';

const PORTALS_PATH = path.join(ROOT, 'portals.yml');
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

/** Load the YAML doc preferring the user's portals.yml, falling back to the
 *  bundled template. Returns `null` when neither exists. */
function readDoc(): { doc: Record<string, unknown> | null; source: PortalsSnapshot['source'] } {
  if (fs.existsSync(PORTALS_PATH)) {
    try {
      const doc = parse(readSafe(PORTALS_PATH)) as Record<string, unknown>;
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

export function readPortals(): PortalsSnapshot {
  const { doc, source } = readDoc();
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
 * Patch `title_filter.positive` and `title_filter.negative` in portals.yml,
 * preserving every other field (tracked_companies, search_queries, sources,
 * seniority_boost, etc.) verbatim. If portals.yml doesn't exist yet, the
 * template is copied first so the user inherits the curated starter list.
 *
 * Returns the new on-disk snapshot.
 */
export function writePortalsTitleFilter(positive: string[], negative: string[]): PortalsSnapshot {
  const { doc, source } = readDoc();
  // Bootstrap from template if there's nothing yet.
  if (!doc || source === 'empty') {
    fs.mkdirSync(path.dirname(PORTALS_PATH), { recursive: true });
    fs.writeFileSync(
      PORTALS_PATH,
      stringify({ title_filter: { positive, negative } }, { lineWidth: 100 }),
    );
    return readPortals();
  }
  // Bootstrap from template — copy so we keep the curated companies + queries.
  if (source === 'template') {
    fs.copyFileSync(PORTALS_TEMPLATE, PORTALS_PATH);
  }
  // Re-read from the now-existing portals.yml so we round-trip the same doc.
  let live: Record<string, unknown> = {};
  try {
    live = (parse(readSafe(PORTALS_PATH)) as Record<string, unknown>) ?? {};
  } catch {
    live = {};
  }
  const tf = (live.title_filter as Record<string, unknown>) ?? {};
  tf.positive = positive;
  tf.negative = negative;
  live.title_filter = tf;
  fs.writeFileSync(PORTALS_PATH, stringify(live, { lineWidth: 100 }));
  return readPortals();
}

/**
 * Append/replace tracked companies. Used by the future "Add this company"
 * flow on /sources. Companies are matched by case-insensitive name.
 */
export function writePortalsCompanies(companies: TrackedCompany[]): PortalsSnapshot {
  const { doc, source } = readDoc();
  let live: Record<string, unknown>;
  if (!doc || source === 'empty') {
    fs.mkdirSync(path.dirname(PORTALS_PATH), { recursive: true });
    live = {};
  } else if (source === 'template') {
    fs.copyFileSync(PORTALS_TEMPLATE, PORTALS_PATH);
    live = (parse(readSafe(PORTALS_PATH)) as Record<string, unknown>) ?? {};
  } else {
    live = doc as Record<string, unknown>;
  }
  const existing = Array.isArray(live.tracked_companies)
    ? (live.tracked_companies as TrackedCompany[])
    : [];
  const byName = new Map<string, TrackedCompany>();
  for (const c of existing) byName.set(c.name.toLowerCase(), c);
  for (const c of companies) byName.set(c.name.toLowerCase(), { ...byName.get(c.name.toLowerCase()), ...c });
  live.tracked_companies = [...byName.values()];
  fs.writeFileSync(PORTALS_PATH, stringify(live, { lineWidth: 100 }));
  return readPortals();
}
