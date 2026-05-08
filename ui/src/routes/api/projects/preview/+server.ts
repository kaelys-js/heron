/**
 * Live filter-match count for the project editor's preview pane.
 * The editor POSTs a draft filter; we return how many pipeline jobs match
 * + a tiny breakdown by status so the user can see what they're carving out.
 */
import { wrap, badRequest } from '$lib/server/api-helpers';
import { loadAllJobs } from '$lib/server/parsers';
import { matchesProject } from '$lib/server/projects';
import { DEFAULT_FILTER, type FilterState, type Status } from '$lib/types';

type PreviewBody = { filter?: Partial<FilterState> };

export const POST = wrap('projects-preview', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as PreviewBody | null;
  const filter: FilterState = {
    ...DEFAULT_FILTER,
    ...body?.filter,
    bgRisk: { ...DEFAULT_FILTER.bgRisk, ...(body?.filter?.bgRisk ?? {}) },
    workMode: { ...DEFAULT_FILTER.workMode, ...(body?.filter?.workMode ?? {}) },
  };
  if (!body) badRequest('expected JSON body with { filter }');

  const jobs = loadAllJobs();
  // Build a fake project for the matcher to consume
  const fakeProject = {
    id: '_preview',
    name: '_preview',
    description: '',
    color: 'emerald' as const,
    filter,
    target: 0,
    createdAt: 0,
    updatedAt: 0,
  };
  let total = 0;
  let ready = 0;
  let applied = 0;
  let interview = 0;
  let offer = 0;
  let topScore: number | null = null;
  for (const j of jobs) {
    if (!matchesProject(j, fakeProject)) continue;
    total++;
    const s = j.score ?? j.geminiScore ?? null;
    if (s != null && (topScore == null || s > topScore)) topScore = s;
    const st: Status = j.status;
    if (st === 'Ready') ready++;
    else if (st === 'Applied' || st === 'Screened') applied++;
    else if (st === 'Interview') interview++;
    else if (st === 'Offer') offer++;
  }
  return { total, ready, applied, interview, offer, topScore };
});
