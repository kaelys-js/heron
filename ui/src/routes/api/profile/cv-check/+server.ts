/**
 * POST /api/profile/cv-check
 *
 * Strict quality + ATS lint for the user's base CV.
 *
 * Runs (in parallel):
 *   • resume-quality.mjs against `data/users/{userId}/profiles/{slug}/cv.md`
 *   • ats-check.mjs against the latest generated CV PDF (if it exists)
 *
 * Used by:
 *   • Onboarding step 3 (post-CV-paste) -- surfaces issues before the user
 *     moves on, so the first apply attempt doesn't fail recruiter scans.
 *   • Profile page "Verify CV" button -- re-runs anytime.
 *   • The CV-PDF generator (auto-fires after every render -- see cv-pdf.ts).
 *
 * Response: { ok, hasCv, atsScore?, qualityScore?, atsFailSummary?,
 *             qualityFailSummary?, atsFailedChecks, qualityFailedChecks }
 *
 * Non-destructive -- never modifies any file. Use POST /api/profile/cv-fix
 * to apply auto-fix suggestions.
 */

import fs from 'node:fs';
import { wrap } from '$lib/server/api-helpers';
import { activePath } from '$lib/server/profile-paths';
import {
  checkAts,
  checkResumeQuality,
  checkAiDetect,
  checkNarrativeArc,
  type QualityResult,
  type AiDetectResult,
  type NarrativeResult,
} from '$lib/server/quality-checks';
import { logEvent } from '$lib/server/events';
import { generalCvStatus } from '$lib/server/cv-pdf';

export const POST = wrap('cv-check', async () => {
  const cvMd = activePath('cv-md');
  const hasCv = fs.existsSync(cvMd);
  if (!hasCv) {
    return {
      ok: true,
      hasCv: false,
      message: 'No cv.md yet — paste your CV first via onboarding or the profile editor.',
    };
  }

  // Run four checks in parallel. resume-quality + ai-detect + narrative-arc
  // are cheap (~50ms each over local markdown). ats-check needs an existing
  // PDF; if there isn't one yet, we skip it.
  const status = generalCvStatus();
  const resumeTask: Promise<QualityResult | null> = checkResumeQuality(cvMd);
  const atsTask: Promise<QualityResult | null> = status.exists
    ? checkAts(status.path)
    : Promise.resolve(null);
  const aiDetectTask: Promise<AiDetectResult | null> = checkAiDetect(cvMd);
  const narrativeTask: Promise<NarrativeResult | null> = checkNarrativeArc(cvMd);

  const [resume, ats, aiDetect, narrative] = await Promise.all([
    resumeTask,
    atsTask,
    aiDetectTask,
    narrativeTask,
  ]);

  // Log the scores so the activity feed shows them too.
  if (resume) {
    logEvent('cv-check', `Resume-quality score ${resume.score.toFixed(1)}%`, {
      level: resume.score === 100 ? 'success' : resume.score >= 85 ? 'info' : 'warn',
      category: 'user',
      message: resume.failSummary || `${resume.passCount}/${resume.total} quality checks passed`,
    });
  }
  if (ats) {
    logEvent('cv-check', `ATS score ${ats.score.toFixed(1)}%`, {
      level: ats.score === 100 ? 'success' : ats.score >= 80 ? 'info' : 'warn',
      category: 'user',
      message: ats.failSummary || `${ats.passCount}/${ats.total} ATS checks passed`,
    });
  }
  if (aiDetect) {
    logEvent('cv-check', `AI-detection risk ${aiDetect.aiScore}/100`, {
      level: aiDetect.aiScore < 50 ? 'success' : aiDetect.aiScore < 75 ? 'warn' : 'error',
      category: 'user',
      message:
        aiDetect.aiScore < 50
          ? 'Reads like a human wrote it'
          : aiDetect.aiScore < 75
            ? 'Rewrite for more burstiness + rare-word variety'
            : 'Modern AI detectors will flag this — significant rewrite needed',
    });
  }
  if (narrative) {
    logEvent('cv-check', `Narrative-arc score ${narrative.score}/100`, {
      level: narrative.score >= 80 ? 'success' : narrative.score >= 50 ? 'warn' : 'error',
      category: 'user',
      message:
        narrative.findings.length === 0
          ? 'Clean career narrative'
          : narrative.findings
              .filter((f) => f.severity !== 'info' || f.kind !== 'ok')
              .map((f) => f.kind)
              .join(', ') || 'no findings',
    });
  }

  return {
    ok: true,
    hasCv: true,
    hasPdf: status.exists,
    atsScore: ats?.score,
    qualityScore: resume?.score,
    aiDetectScore: aiDetect?.aiScore,
    aiDetectSignals: aiDetect?.signals,
    narrativeScore: narrative?.score,
    narrativeFindings: narrative?.findings ?? [],
    atsFailSummary: ats?.failSummary,
    qualityFailSummary: resume?.failSummary,
    atsFailedChecks: ats?.checks.filter((c) => c.status === 'fail') ?? [],
    qualityFailedChecks: resume?.checks.filter((c) => c.status === 'fail') ?? [],
    atsAllChecks: ats?.checks ?? [],
    qualityAllChecks: resume?.checks ?? [],
  };
});
