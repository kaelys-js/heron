/** GET /api/watch/prep-brief -- compact JSON for the Apple Watch
 *  complication (ring + "X hours" countdown) + tiny iOS widget.
 *  Fits ~500 bytes so a single Watch call suffices. Returns
 *  { hasUpcoming, nextStart, hoursAway, company, stage, interviewerName,
 *    hasDossier, ready, missingCount, topQuestion? }. */

import fs from 'node:fs';
import path from 'node:path';
import { wrap } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { findUpcomingInterviews } from '$lib/server/interviewers';
import { getActiveProfileId } from '$lib/server/profiles';

function firstBulletInQuestions(questionsPath?: string): string | undefined {
  if (!questionsPath) return undefined;
  try {
    const p = path.isAbsolute(questionsPath) ? questionsPath : path.join(ROOT, questionsPath);
    const text = fs.readFileSync(p, 'utf8');
    const m = text.match(/^(?:[-*]|\d+\.)\s+(.+)$/m);
    return m ? m[1].trim().slice(0, 140) : undefined;
  } catch {
    return undefined;
  }
}

export const GET = wrap('watch-prep-brief', async () => {
  const profileId = getActiveProfileId();
  const upcoming = findUpcomingInterviews(14, profileId);
  if (upcoming.length === 0) {
    return {
      ok: true,
      hasUpcoming: false,
    };
  }
  const next = upcoming[0];
  const hoursAway = Math.max(
    0,
    Math.round(((next.interviewer.scheduledAt ?? Date.now()) - Date.now()) / (60 * 60 * 1000)),
  );
  const topQuestion = firstBulletInQuestions(next.interviewer.questionsPath);
  return {
    ok: true,
    hasUpcoming: true,
    nextStart: next.interviewer.scheduledAt,
    hoursAway,
    jobId: next.jobId,
    interviewerName: next.interviewer.name,
    stage: next.interviewer.stage,
    hasDossier: !!next.interviewer.dossierPath,
    hasQuestions: !!next.interviewer.questionsPath,
    topQuestion,
  };
});
