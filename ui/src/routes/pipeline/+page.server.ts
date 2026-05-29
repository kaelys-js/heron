import { loadAllJobs, groupByStatus } from '$lib/server/parsers';
import { parseFilterFromUrl } from '$lib/server/projects';
import { getActiveProfileId } from '$lib/server/profiles';
import { listAllStageState } from '$lib/server/stage-state';
import type { JobStageState } from '$lib/server/stage-state';
import { STATUS_ORDER, DEFAULT_FILTER } from '$lib/types';
import type { TabFilter, Status, FilterState } from '$lib/types';

const PRESETS = new Set<TabFilter>(['all', 'ready', 'applied']);

function parseTab(raw: string | null): TabFilter {
  if (!raw) {
    return 'all';
  }
  if (PRESETS.has(raw as TabFilter)) {
    return raw as TabFilter;
  }
  if (raw.startsWith('s:')) {
    const s = raw.slice(2) as Status;
    if (STATUS_ORDER.includes(s)) {
      return ('s:' + s) as TabFilter;
    }
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
  // Stage-state map keyed by jobId so the page can render "days quiet"
  // + "next action due" badges per row without an extra fetch per card.
  // When `profile=all`, scan every profile and stitch into one map.
  const stageStateMap: Record<string, JobStageState> = {};
  if (profileId === 'all') {
    // For cross-profile views we'd need to walk every profile's sidecar.
    // listAllStageState reads the active-profile file by default, which
    // is the conservative behaviour here -- the page shows what's loaded
    // for the active profile and leaves cross-profile aggregation to a
    // separate phase.
    Object.assign(stageStateMap, listAllStageState(getActiveProfileId()));
  } else {
    Object.assign(stageStateMap, listAllStageState(profileId));
  }
  return {
    jobs,
    grouped,
    total: jobs.length,
    initialTab: parseTab(url.searchParams.get('tab')),
    initialFilter,
    fromProject: url.searchParams.get('from'),
    profileId,
    stageStateMap,
  };
}
