/**
 * /calendar loader — interview + prep-block + decision-deadline calendar.
 * Forward-window default 30d, configurable via ?days=N.
 */

import { findUpcomingInterviews } from '$lib/server/interviewers';
import { listActiveOffers } from '$lib/server/offers';
import { listAllStageState } from '$lib/server/stage-state';
import { getActiveProfileId } from '$lib/server/profiles';
import { resolveJobAndProfile } from '$lib/server/job-resolver';

const HOUR = 60 * 60 * 1000;
const HOURS_24 = 24 * HOUR;
const HOURS_48 = 48 * HOUR;

export type CalendarEntry = {
  id: string;
  kind: 'interview' | 'prep-block' | 'decision-deadline' | 'next-action';
  startAt: number;
  endAt?: number;
  title: string;
  jobId: string;
  company?: string;
  interviewerSlug?: string;
  hasResources?: boolean;
  href: string;
};

export async function load({ url }: { url: URL }) {
  const profileId = getActiveProfileId();
  const daysParam = Number.parseInt(url.searchParams.get('days') ?? '30', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 30;
  const entries: CalendarEntry[] = [];
  const now = Date.now();
  const horizon = now + days * 24 * HOUR;

  for (const { jobId, interviewer } of findUpcomingInterviews(days, profileId)) {
    if (!interviewer.scheduledAt) continue;
    const job = resolveJobAndProfile(jobId, url)?.job;
    entries.push({
      id: 'iv:' + jobId + ':' + interviewer.slug,
      kind: 'interview',
      startAt: interviewer.scheduledAt,
      endAt: interviewer.scheduledAt + HOUR,
      title: interviewer.stage + ' — ' + interviewer.name,
      company: job?.company,
      jobId,
      interviewerSlug: interviewer.slug,
      href: '/job/' + jobId + '#interviewer-' + interviewer.slug,
    });
    const leadMs =
      interviewer.stage === 'onsite' || interviewer.stage === 'final-round' ? HOURS_48 : HOURS_24;
    const prepAt = interviewer.scheduledAt - leadMs;
    if (prepAt > now && prepAt < horizon) {
      entries.push({
        id: 'prep:' + jobId + ':' + interviewer.slug,
        kind: 'prep-block',
        startAt: prepAt,
        endAt: prepAt + HOUR,
        title: (interviewer.dossierPath ? 'Prep · ' : 'Research + prep · ') + interviewer.name,
        company: job?.company,
        jobId,
        interviewerSlug: interviewer.slug,
        hasResources: !!interviewer.dossierPath,
        href: '/job/' + jobId + '#interviewer-' + interviewer.slug,
      });
    }
  }

  for (const offer of listActiveOffers(profileId)) {
    if (!offer.decisionDeadline) continue;
    if (offer.decisionDeadline < now || offer.decisionDeadline > horizon) continue;
    const job = resolveJobAndProfile(offer.jobId, url)?.job;
    entries.push({
      id: 'dd:' + offer.jobId,
      kind: 'decision-deadline',
      startAt: offer.decisionDeadline,
      title: 'Offer decision · ' + (job?.company ?? '?'),
      company: job?.company,
      jobId: offer.jobId,
      href: '/job/' + offer.jobId + '#offer',
    });
  }

  const stage = listAllStageState(profileId);
  for (const [jobId, state] of Object.entries(stage)) {
    if (!state.nextActionDue) continue;
    if (state.nextActionDue.dueAt < now || state.nextActionDue.dueAt > horizon) continue;
    const job = resolveJobAndProfile(jobId, url)?.job;
    entries.push({
      id: 'na:' + jobId + ':' + state.nextActionDue.kind,
      kind: 'next-action',
      startAt: state.nextActionDue.dueAt,
      title:
        state.nextActionDue.kind.replace('-', ' ') +
        (state.nextActionDue.interviewerName ? ' · ' + state.nextActionDue.interviewerName : ''),
      company: job?.company,
      jobId,
      href: '/job/' + jobId,
    });
  }
  entries.sort((a, b) => a.startAt - b.startAt);
  return { entries, days };
}
