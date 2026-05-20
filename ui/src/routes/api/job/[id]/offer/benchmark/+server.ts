/** POST /api/job/[id]/offer/benchmark -- pull a comp benchmark (levels.fyi /
 *  Glassdoor) for this job's role + level + location and attach it to the
 *  OfferRecord. Auto mode (no manualValues): spawns the deep --benchmark-comp
 *  flow against public pages. Manual mode: body { manualValues: { medianTc,
 *  p25Tc?, p75Tc?, sourceUrl? } } -- paste a band already looked up, no
 *  agent spawn, instant. */

import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { attachBenchmark, getOffer } from '$lib/server/offers';
import { fetchBenchmark, manualBenchmark } from '$lib/server/comp-benchmark';
import { touchJob } from '$lib/server/stage-state';
import { logEvent } from '$lib/server/events';

export const POST = wrap(
  'offer-benchmark',
  async ({ params, url, request }: { params: { id: string }; url: URL; request: Request }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const existing = getOffer(job.id, profileId);
    if (!existing) badRequest('No offer exists yet — POST /api/job/[id]/offer first');
    const body = (await request.json().catch(() => ({}))) as {
      level?: string;
      manualValues?: { medianTc: number; p25Tc?: number; p75Tc?: number; sourceUrl?: string };
    };
    const query = {
      company: job.company ?? '',
      role: job.role ?? '',
      level: body.level,
      location: job.location ?? 'Remote',
      currency: existing.currency,
    };
    if (body.manualValues) {
      if (typeof body.manualValues.medianTc !== 'number')
        badRequest('manualValues.medianTc is required');
      const bench = manualBenchmark(query, body.manualValues);
      const saved = attachBenchmark(job.id, bench, profileId);
      touchJob(job.id, profileId);
      logEvent('offer-benchmark', 'Manual benchmark attached', {
        level: 'info',
        category: 'application',
        message: (job.company || '?') + ' · median ' + bench.medianTc + ' ' + bench.currency,
      });
      return { ok: true, offer: saved };
    }
    // Auto-pull mode -- spawn the agent CLI's deep-research path.
    const bench = await fetchBenchmark(query);
    if (!bench) {
      return { ok: false, error: 'Benchmark fetch returned no usable data — try the manual mode' };
    }
    const saved = attachBenchmark(job.id, bench, profileId);
    touchJob(job.id, profileId);
    logEvent('offer-benchmark', 'Auto benchmark attached', {
      level: 'success',
      category: 'application',
      message: (job.company || '?') + ' · median ' + bench.medianTc + ' ' + bench.currency,
    });
    return { ok: true, offer: saved };
  },
);
