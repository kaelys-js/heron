/** POST /api/profile/cv-fix -- rewrite cv.md to pass the failing checks
 *  from /api/profile/cv-check. Preserves facts, removes AI-tells / cliches /
 *  missing sections. Original is backed up to cv.md.bak. By default returns
 *  the proposed content + diff for preview; only persists when
 *  `?apply=1` (or body.apply: true).
 *  Body:  { apply?, dryRun? }
 *  Reply: { ok, before, after, backedUp, atsScoreAfter?, qualityScoreAfter? } */

import fs from 'node:fs';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { activePath } from '$lib/server/profile-paths';
import { complete } from '$lib/server/ai';
import { logEvent } from '$lib/server/events';
import { checkAts, checkResumeQuality, type QualityResult } from '$lib/server/quality-checks';
import { generalCvStatus } from '$lib/server/cv-pdf';

const FIX_PROMPT =
  "You are revising a candidate's CV in markdown. The current CV failed several ATS / resume-quality checks. " +
  'Rewrite it so every check passes WITHOUT inventing or removing any factual content.\n\n' +
  'CORRECTNESS:\n' +
  '- Preserve every job, project, education entry, certification, skill, and date verbatim.\n' +
  '- Never invent new metrics. If a bullet had no number, you may add a vague qualifier ("significantly", "across the team") but NEVER a specific number that wasn\'t in the original.\n' +
  '- Never drop or summarise content; the rewrite must contain the same number of bullets, jobs, etc.\n\n' +
  'STYLE FIXES (the failures will tell you which to address):\n' +
  '- AI-detection: replace flagged phrases ("delve into", "leveraged", "passionate about", etc.) with plain English. Vary sentence length. Reduce em-dash count.\n' +
  '- Clichés: remove "team player", "fast learner", "go-getter", "results-driven", "detail-oriented", etc.\n' +
  '- Action verbs: rewrite bullet starts so each begins with a strong past-tense verb (built, led, shipped, reduced, etc.).\n' +
  '- Missing sections: if Education or Skills is missing, add an empty section header so the user can fill it in (do NOT invent education).\n' +
  '- First-person pronouns: replace "I built X" → "Built X" in body bullets. Summary paragraph may keep first-person.\n' +
  '- Buzzwords + superlatives: remove "world-class", "expert", "top-tier" unless backed by a specific number.\n\n' +
  'OUTPUT FORMAT:\n' +
  'Return ONLY the revised markdown. No code fences, no commentary, no preamble.\n' +
  'The first line must be a `# Full Name` header.';

export const POST = wrap('cv-fix', async ({ request }: { request: Request }) => {
  const body = (await request.json().catch(() => null)) as {
    apply?: boolean;
    dryRun?: boolean;
  } | null;
  const apply = body?.apply === true;

  const cvMd = activePath('cv-md');
  // CodeQL js/file-system-race: read directly. ENOENT means the user
  // hasn't onboarded yet -- surface the same badRequest as before
  // without racing existsSync against the read.
  let before: string;
  try {
    before = fs.readFileSync(cvMd, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      badRequest('No cv.md yet — paste your CV first via onboarding.');
    }
    throw e;
  }

  // Run a quality check first so we know what to fix.
  const quality = await checkResumeQuality(cvMd);
  if (quality.failCount === 0) {
    return {
      ok: true,
      noChange: true,
      message: 'CV already passes every check — no fix needed.',
      before,
      after: before,
      backedUp: false,
      qualityScoreAfter: quality.score,
    };
  }

  const failedList = quality.checks
    .filter((c) => c.status === 'fail')
    .map((c) => `- ${c.name}: ${c.evidence || '(no evidence)'}`)
    .join('\n');

  const userMessage = 'FAILED CHECKS:\n' + failedList + '\n\nCURRENT CV (markdown):\n\n' + before;

  logEvent('cv-fix', 'Rewriting CV to pass quality checks', {
    category: 'user',
    message: quality.failCount + ' failed checks',
  });

  let rewritten = await complete(FIX_PROMPT, userMessage, {
    maxTokens: 12_000,
    thinking: false,
  });
  rewritten = rewritten
    .trim()
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  if (!rewritten || !rewritten.startsWith('#')) {
    return {
      ok: false,
      error: 'AI returned an empty or malformed rewrite — try again.',
      before,
      after: before,
    };
  }

  // Sanity guard: AI should not have removed more than 20% of the content.
  // If it did, suspect summarisation and refuse to persist.
  const lenRatio = rewritten.length / before.length;
  if (lenRatio < 0.7) {
    return {
      ok: false,
      error:
        'AI shortened the CV by more than 30% — refusing to apply (sanity guard). ' +
        'Original is preserved. Try /api/profile/cv-fix again or hand-edit.',
      before,
      after: rewritten,
      backedUp: false,
    };
  }

  let backedUp = false;
  let qualityAfter: QualityResult | null = null;
  let atsAfter: QualityResult | null = null;

  if (apply) {
    // Backup the original (mirror the writeSiblingFile convention).
    try {
      fs.copyFileSync(cvMd, cvMd + '.bak');
      backedUp = true;
    } catch {
      /* non-fatal -- proceed with the write */
    }
    fs.writeFileSync(cvMd, rewritten);

    // Re-run checks on the new file so the response includes the new
    // score. Don't regenerate the PDF here -- that's a separate step.
    qualityAfter = await checkResumeQuality(cvMd);
    const status = generalCvStatus();
    if (status.exists) atsAfter = await checkAts(status.path);

    logEvent('cv-fix', `CV rewritten · quality ${qualityAfter.score.toFixed(1)}%`, {
      level:
        qualityAfter.failCount === 0 ? 'success' : qualityAfter.failCount <= 2 ? 'info' : 'warn',
      category: 'user',
      message:
        qualityAfter.failSummary ||
        `${qualityAfter.passCount}/${qualityAfter.total} passes after rewrite`,
    });
  }

  return {
    ok: true,
    noChange: false,
    before,
    after: rewritten,
    applied: apply,
    backedUp,
    qualityScoreBefore: quality.score,
    qualityScoreAfter: qualityAfter?.score,
    atsScoreAfter: atsAfter?.score,
    qualityFailSummaryBefore: quality.failSummary,
    qualityFailSummaryAfter: qualityAfter?.failSummary,
  };
});
