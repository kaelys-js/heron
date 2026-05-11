import { loadAllJobs, groupByStatus } from '$lib/server/parsers';
import { parseFilterFromUrl } from '$lib/server/projects';
import { getActiveProfileId } from '$lib/server/profiles';
import { STATUS_ORDER, DEFAULT_FILTER, type TabFilter, type Status, type FilterState } from '$lib/types';

const PRESETS = new Set<TabFilter>(['all', 'ready', 'applied']);

function parseTab(raw: string | null): TabFilter {
  if (!raw) return 'all';
  if (PRESETS.has(raw as TabFilter)) return raw as TabFilter;
  if (raw.startsWith('s:')) {
    const s = raw.slice(2) as Status;
    if (STATUS_ORDER.includes(s)) return ('s:' + s) as TabFilter;
  }
  return 'all';
}

export async function load({ url }: { url: URL }) {
  const profileParam = url.searchParams.get('profile') ?? undefined;
  const profileId = profileParam === 'all' ? 'all' : (profileParam ?? getActiveProfileId());
  const jobs = loadAllJobs(profileId);
  const grouped = groupByStatus(jobs);
  // Seed the filter from URL params (used by Projects "Open in Pipeline" deep links).
  const overrides = parseFilterFromUrl(url);
  const initialFilter: FilterState = {
    ...DEFAULT_FILTER,
    ...overrides,
    bgRisk: { ...DEFAULT_FILTER.bgRisk, ...(overrides.bgRisk ?? {}) },
  };
  return {
    jobs,
    grouped,
    total: jobs.length,
    initialTab: parseTab(url.searchParams.get('tab')),
    initialFilter,
    fromProject: url.searchParams.get('from'),
    profileId,
  };
}
