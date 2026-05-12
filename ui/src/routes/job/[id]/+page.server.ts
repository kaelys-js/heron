/**
 * /job/[id] route — single page that works for both single-profile and
 * cross-profile contexts.
 *
 * Two id formats accepted:
 *   - Raw urlId (e.g. "abc123def456")        → looked up in active profile
 *   - Suffixed  (e.g. "abc123def456:elec")   → looked up in named profile.
 *     This is the form emitted by `loadAllJobs('all')` to disambiguate
 *     URLs that appear in multiple profile pipelines.
 *
 * The optional `?profile=<slug>` query param overrides the suffix and
 * forces a specific profile lookup. Useful for direct deep-links from
 * the management page or per-profile inbox views.
 */

import path from 'node:path';
import { loadAllJobs } from '$lib/server/parsers';
import { readSafe } from '$lib/server/files';
import { profilePath } from '$lib/server/profile-paths';
import { getActiveProfileId, getProfile, listProfiles } from '$lib/server/profiles';
import { parseReportSummary } from '$lib/server/report-summary';
import { getStageState } from '$lib/server/stage-state';
import { listInterviewers } from '$lib/server/interviewers';
import { getOffer, currentRound, annualisedTc, batnaScore } from '$lib/server/offers';
import { error } from '@sveltejs/kit';

function splitId(rawId: string): { urlId: string; profileHint?: string } {
  const colon = rawId.indexOf(':');
  if (colon < 0) return { urlId: rawId };
  return {
    urlId: rawId.slice(0, colon),
    profileHint: rawId.slice(colon + 1),
  };
}

export async function load({ params, url }: { params: { id: string }; url: URL }) {
  const { urlId, profileHint } = splitId(params.id);

  // Resolve which profile to look up the job in. Precedence:
  //   1. explicit ?profile=<slug> query param
  //   2. embedded suffix on the id (from loadAllJobs('all'))
  //   3. active profile
  const queryProfile = url.searchParams.get('profile') ?? undefined;
  const profileId =
    queryProfile && getProfile(queryProfile)
      ? queryProfile
      : profileHint && getProfile(profileHint)
        ? profileHint
        : getActiveProfileId();

  // Single-profile lookup: load that profile's jobs and find by raw urlId.
  let jobs = loadAllJobs(profileId);
  let job = jobs.find((j) => j.id === urlId || j.id === params.id);

  // Fallback for legacy links / mixed-profile views: scan every profile
  // in case the user has the same urlId in multiple profiles.
  let resolvedProfileId = profileId;
  if (!job) {
    for (const p of listProfiles()) {
      if (p.id === profileId) continue;
      const found = loadAllJobs(p.id).find((j) => j.id === urlId);
      if (found) {
        job = found;
        resolvedProfileId = p.id;
        break;
      }
    }
  }
  if (!job) throw error(404, 'Job not found');

  const report = job.reportFile
    ? readSafe(path.join(profilePath(resolvedProfileId, 'reports-dir'), job.reportFile))
    : '';
  const summary = report ? parseReportSummary(report) : null;

  // Post-apply pipeline data — sidecars per job (stage history, interview
  // panel, offer rounds). Each is read-only; null when absent. These power
  // the new tabs on the job page (interviewers / offer / negotiation /
  // ready-gate). Cheap reads — sidecars are < 5KB each in practice.
  const stage = getStageState(job.id, resolvedProfileId) ?? null;
  const interviewers = listInterviewers(job.id, resolvedProfileId);
  const offer = getOffer(job.id, resolvedProfileId) ?? null;
  const offerCurrent = offer ? (currentRound(offer) ?? null) : null;
  const offerTc = offerCurrent ? annualisedTc(offerCurrent) : 0;
  const offerBatna = offer ? batnaScore(job.id, resolvedProfileId) : 0;
  return {
    job,
    report,
    summary,
    profileId: resolvedProfileId,
    stage,
    interviewers,
    offer,
    offerCurrent,
    offerTc,
    offerBatna,
  };
}
