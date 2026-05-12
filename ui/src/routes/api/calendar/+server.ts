/**
 * GET /api/calendar
 *
 * Returns the unified interview-and-prep calendar:
 *   • Every interview with a scheduledAt within the next `?days` (default 14)
 *   • A "prep block" entry 24h before each interview (or 48h for onsite/final)
 *     IF a dossier exists; otherwise the prep block is a "needs research" marker
 *   • Every offer with a decisionDeadline in the window
 *   • Every nextActionDue from stage-state
 *
 * Used by:
 *   • /calendar page
 *   • Capacitor Calendar plugin sync API (one-way push to iOS/macOS Calendar)
 *   • Apple Watch glance (next-event card)
 */

import { wrap } from '$lib/server/api-helpers';
import { findUpcomingInterviews } from '$lib/server/interviewers';
import { listActiveOffers } from '$lib/server/offers';
import { listAllStageState } from '$lib/server/stage-state';
import { getActiveProfileId } from '$lib/server/profiles';

export type CalendarEntry = {
  id: string;
  kind: 'interview' | 'prep-block' | 'decision-deadline' | 'next-action';
  startAt: number;
  endAt?: number;
  title: string;
  jobId: string;
  /** For interviews: the interviewer slug. For prep-blocks: the interviewer slug
   *  the block is preparing for. */
  interviewerSlug?: string;
  /** Optional location / Zoom link / meeting room. */
  location?: string;
  /** True for prep-blocks when a dossier is in place. */
  hasResources?: boolean;
  /** Where in the UI the user navigates to act on this entry. */
  href: string;
};

const HOURS_24 = 24 * 60 * 60 * 1000;
const HOURS_48 = 48 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export const GET = wrap('calendar', async ({ url }: { url: URL }) => {
  const profileId = getActiveProfileId();
  const daysParam = Number.parseInt(url.searchParams.get('days') ?? '14', 10);
  const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 14;
  const entries: CalendarEntry[] = [];
  const now = Date.now();
  const horizon = now + days * 24 * 60 * 60 * 1000;

  // 1. Interviews + prep-blocks
  for (const { jobId, interviewer } of findUpcomingInterviews(days, profileId)) {
    if (!interviewer.scheduledAt) continue;
    entries.push({
      id: 'iv:' + jobId + ':' + interviewer.slug,
      kind: 'interview',
      startAt: interviewer.scheduledAt,
      endAt: interviewer.scheduledAt + HOUR,
      title: interviewer.stage + ' — ' + interviewer.name,
      jobId,
      interviewerSlug: interviewer.slug,
      href: '/job/' + jobId + '#interviewer-' + interviewer.slug,
    });
    // Prep block: 24h before for screens, 48h before for onsite/final
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
        jobId,
        interviewerSlug: interviewer.slug,
        hasResources: !!interviewer.dossierPath,
        href: '/job/' + jobId + '#interviewer-' + interviewer.slug,
      });
    }
  }

  // 2. Offer decision deadlines
  for (const offer of listActiveOffers(profileId)) {
    if (!offer.decisionDeadline) continue;
    if (offer.decisionDeadline < now || offer.decisionDeadline > horizon) continue;
    entries.push({
      id: 'dd:' + offer.jobId,
      kind: 'decision-deadline',
      startAt: offer.decisionDeadline,
      title: 'Offer decision due',
      jobId: offer.jobId,
      href: '/job/' + offer.jobId + '#offer',
    });
  }

  // 3. nextActionDue
  const stage = listAllStageState(profileId);
  for (const [jobId, state] of Object.entries(stage)) {
    if (!state.nextActionDue) continue;
    if (state.nextActionDue.dueAt < now || state.nextActionDue.dueAt > horizon) continue;
    entries.push({
      id: 'na:' + jobId + ':' + state.nextActionDue.kind,
      kind: 'next-action',
      startAt: state.nextActionDue.dueAt,
      title:
        state.nextActionDue.kind.replace('-', ' ') +
        (state.nextActionDue.interviewerName ? ' · ' + state.nextActionDue.interviewerName : ''),
      jobId,
      href: '/job/' + jobId,
    });
  }
  entries.sort((a, b) => a.startAt - b.startAt);
  return { ok: true, entries };
});
