/**
 * GET /api/job/[id]/ready-gate
 *
 * Returns a checklist of "are you ready for the upcoming interview" items:
 *
 *   - resume    — tailored CV PDF exists for this job
 *   - report    — deep-evaluation report exists
 *   - dossier   — job-wide pre-call dossier exists (in interview-prep/)
 *   - interviewers — at least one Interviewer record exists for this job
 *   - perInterviewerDossier — every Interviewer has a dossierPath
 *   - questions — every Interviewer has a questionsPath
 *   - drills    — has the user done a mock-interview drill in last 7 days
 *   - sleep     — interview is far enough away that there's time to prep
 *
 * Returns counts + a boolean "ready" verdict (every required item green).
 *
 * Used by:
 *   • Job-page Ready-to-interview gate widget (Phase III.3)
 *   • Apple Watch glance ("3 items missing for tomorrow's interview")
 */

import fs from 'node:fs';
import path from 'node:path';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { ROOT } from '$lib/server/files';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { listInterviewers, findUpcomingInterviews } from '$lib/server/interviewers';
import { profilePath } from '$lib/server/profile-paths';

const DRILL_RECENCY_DAYS = 7;

function fileExists(p?: string): boolean {
  if (!p) return false;
  try {
    return fs.existsSync(path.isAbsolute(p) ? p : path.join(ROOT, p));
  } catch {
    return false;
  }
}

function recentDrill(profileId: string, jobId: string): boolean {
  // Drill outputs are named `{company}-{stage}-drill-{date}.md` in interview-prep/.
  // We accept ANY file containing the jobId or company-slug as a drill marker.
  const dir = profilePath(profileId, 'interview-prep-dir');
  if (!fs.existsSync(dir)) return false;
  const cutoff = Date.now() - DRILL_RECENCY_DAYS * 24 * 60 * 60 * 1000;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.includes('drill')) continue;
      if (!f.includes(jobId.slice(0, 8))) continue;
      const stat = fs.statSync(path.join(dir, f));
      if (stat.mtimeMs >= cutoff) return true;
    }
  } catch {}
  return false;
}

export const GET = wrap(
  'ready-gate',
  async ({ params, url }: { params: { id: string }; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const interviewers = listInterviewers(job.id, profileId);
    const upcoming = findUpcomingInterviews(14, profileId)
      .filter((u) => u.jobId === job.id)
      .sort((a, b) => a.interviewer.scheduledAt! - b.interviewer.scheduledAt!);
    const next = upcoming[0];
    const hoursToNext = next
      ? Math.max(0, (next.interviewer.scheduledAt! - Date.now()) / (60 * 60 * 1000))
      : undefined;

    const resumeOk = fileExists(job.pdfFile);
    const reportOk = fileExists(job.reportFile);
    // Job-wide dossier — best-effort: any file in interview-prep/ matching
    // the company slug + 'dossier' counts.
    const ipDir = profilePath(profileId, 'interview-prep-dir');
    let dossierOk = false;
    if (fs.existsSync(ipDir)) {
      try {
        const files = fs.readdirSync(ipDir);
        const slug = (job.company || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        dossierOk = files.some(
          (f) =>
            f.toLowerCase().includes('dossier') && (slug ? f.toLowerCase().includes(slug) : true),
        );
      } catch {}
    }
    const interviewersOk = interviewers.length > 0;
    const perInterviewerDossierOk =
      interviewers.length > 0 && interviewers.every((i) => fileExists(i.dossierPath));
    const questionsOk =
      interviewers.length > 0 && interviewers.every((i) => fileExists(i.questionsPath));
    const drillsOk = recentDrill(profileId, job.id);
    const sleepOk = hoursToNext === undefined || hoursToNext >= 12;

    const checklist = [
      { key: 'resume', label: 'Tailored CV exists', ok: resumeOk, required: true },
      { key: 'report', label: 'Deep-evaluation report exists', ok: reportOk, required: true },
      { key: 'dossier', label: 'Job-wide pre-call dossier', ok: dossierOk, required: false },
      {
        key: 'interviewers',
        label: 'Interviewer panel logged',
        ok: interviewersOk,
        required: !!next,
      },
      {
        key: 'perInterviewerDossier',
        label: 'Per-interviewer dossiers',
        ok: perInterviewerDossierOk,
        required: !!next,
      },
      {
        key: 'questions',
        label: 'Per-interviewer questions to ask',
        ok: questionsOk,
        required: !!next,
      },
      {
        key: 'drills',
        label: 'Mock interview in last ' + DRILL_RECENCY_DAYS + 'd',
        ok: drillsOk,
        required: !!next,
      },
      {
        key: 'sleep',
        label: 'At least 12h to next interview',
        ok: sleepOk,
        required: !!next,
      },
    ];
    const ready = checklist.filter((c) => c.required).every((c) => c.ok);
    return {
      ok: true,
      ready,
      next: next
        ? {
            interviewerName: next.interviewer.name,
            stage: next.interviewer.stage,
            scheduledAt: next.interviewer.scheduledAt,
            hoursAway: hoursToNext,
          }
        : null,
      checklist,
    };
  },
);
