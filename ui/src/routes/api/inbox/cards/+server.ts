/** GET /api/inbox/cards -- auto-derived "next action" cards for the current
 *  user. Kinds: thank-you-owed (interviews <48h, no thank-you), follow-up-due
 *  (past cadence), prep-block-recommended (interview <5d, no dossier),
 *  offer-decision-due (deadline <72h), ghosted-flagged (silent >=21d),
 *  next-action-due (from stage-state). Stateless -- derived on every call
 *  from sidecar JSON. */

import { wrap } from '$lib/server/api-helpers';
import { findThankYousOwed, findUpcomingInterviews } from '$lib/server/interviewers';
import { listAllStageState, listStaleJobs } from '$lib/server/stage-state';
import { listActiveOffers } from '$lib/server/offers';
import { getActiveProfileId } from '$lib/server/profiles';

const DAYS_TO_GHOST = 21;
const DAYS_PREP_REQUIRED = 5;
const HOURS_TO_DECIDE = 72;

export type InboxCard = {
  /** Stable card id -- derived from kind + jobId + secondary key so the
   *  client can de-dupe across polls. */
  id: string;
  kind:
    | 'thank-you-owed'
    | 'follow-up-due'
    | 'prep-block-recommended'
    | 'offer-decision-due'
    | 'ghosted-flagged'
    | 'next-action-due';
  jobId: string;
  title: string;
  description: string;
  /** ISO ms -- when this card became actionable. */
  dueAt: number;
  /** Optional secondary action -- what the user should do next. */
  cta?: { label: string; href: string };
};

export const GET = wrap('inbox-cards', async () => {
  const profileId = getActiveProfileId();
  const cards: InboxCard[] = [];
  const now = Date.now();

  // 1. Thank-you-owed
  for (const { jobId, interviewer } of findThankYousOwed(profileId)) {
    if (!interviewer.scheduledAt) {
      continue;
    }
    const hoursAgo = Math.floor((now - interviewer.scheduledAt) / (60 * 60 * 1000));
    cards.push({
      id: `thank-you:${jobId}:${interviewer.slug}`,
      kind: 'thank-you-owed',
      jobId,
      title: `Thank-you note owed: ${interviewer.name}`,
      description: `Interviewed ${hoursAgo}h ago. Send a thank-you within 48h.`,
      dueAt: interviewer.scheduledAt + 48 * 60 * 60 * 1000,
      cta: { label: 'Draft thank-you', href: `/job/${jobId}#thank-you-${interviewer.slug}` },
    });
  }

  // 2. Prep-block recommended (interview in <5d, no dossierPath)
  for (const { jobId, interviewer, daysAway } of findUpcomingInterviews(
    DAYS_PREP_REQUIRED,
    profileId,
  )) {
    if (interviewer.dossierPath) {
      continue;
    }
    cards.push({
      id: `prep:${jobId}:${interviewer.slug}`,
      kind: 'prep-block-recommended',
      jobId,
      title: `Prep ${interviewer.name} (${daysAway}d away)`,
      description: `No dossier yet for ${interviewer.title || 'interviewer'}. Run deep research.`,
      dueAt: interviewer.scheduledAt!,
      cta: {
        label: 'Generate dossier',
        href: `/job/${jobId}#interviewer-${interviewer.slug}`,
      },
    });
  }

  // 3. Ghosted-flagged
  for (const { jobId, daysSinceLastTouch } of listStaleJobs(DAYS_TO_GHOST, profileId)) {
    cards.push({
      id: `ghost:${jobId}`,
      kind: 'ghosted-flagged',
      jobId,
      title: `Silent for ${daysSinceLastTouch}d`,
      description: `No activity for ${daysSinceLastTouch} days. Mark as Ghosted or send a final follow-up.`,
      dueAt: now,
      cta: { label: 'Decide', href: `/job/${jobId}#followup` },
    });
  }

  // 4. Offer-decision-due
  for (const offer of listActiveOffers(profileId)) {
    if (!offer.decisionDeadline) {
      continue;
    }
    const msToDeadline = offer.decisionDeadline - now;
    if (msToDeadline < 0 || msToDeadline > HOURS_TO_DECIDE * 60 * 60 * 1000) {
      continue;
    }
    cards.push({
      id: `offer-decide:${offer.jobId}`,
      kind: 'offer-decision-due',
      jobId: offer.jobId,
      title: `Offer decision in ${Math.ceil(msToDeadline / (60 * 60 * 1000))}h`,
      description: `Recruiter wants an answer by ${new Date(offer.decisionDeadline).toLocaleString()}.`,
      dueAt: offer.decisionDeadline,
      cta: { label: 'Open offer', href: `/job/${offer.jobId}#offer` },
    });
  }

  // 5. Explicit nextActionDue from stage-state
  const stageState = listAllStageState(profileId);
  for (const [jobId, state] of Object.entries(stageState)) {
    if (!state.nextActionDue) {
      continue;
    }
    cards.push({
      id: `next:${jobId}:${state.nextActionDue.kind}`,
      kind: 'next-action-due',
      jobId,
      title: `${state.nextActionDue.kind.replace('-', ' ')} due`,
      description: state.nextActionDue.note ?? 'Manual action you scheduled.',
      dueAt: state.nextActionDue.dueAt,
      cta: { label: 'Open job', href: `/job/${jobId}` },
    });
  }

  cards.sort((a, b) => a.dueAt - b.dueAt);
  return { ok: true, cards };
});
