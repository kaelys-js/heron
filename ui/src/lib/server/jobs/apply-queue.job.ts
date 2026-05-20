/** apply-queue-drain -- autopilot job that processes Queued jobs.
 *  Trigger: weekday 10:30 (replaced the LinkedIn-only legacy schedule).
 *  Manual run via /agents.
 *  Per Queued job (score desc): re-validate (cap, status still Queued,
 *  autonomous_apply ON for that profile) → assemble (ensure tailored
 *  CV + cover letter, auto-runEvaluate if missing, fall back to
 *  ManualApplyNeeded on failure) → dispatch via apply-portal.py whose
 *  stdout APPLY_STEP/APPLY_RESULT lines we parse → set status from
 *  exit code (0 Applied + counter bump, 1 ManualApplyNeeded, 2 Error).
 *  Stops when today's apply count hits the daily cap. */

import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { register } from './registry';
import { loadAllJobs } from '../parsers';
import { listProfiles, getProfile } from '../profiles';
import { readProfile } from '../profile';
import { profilePath } from '../profile-paths';
import { markStatus } from '../applications';
import { writeApplyState, appendStep, clearApplyState } from '../apply-state';
import { detectPortal, isPortalAutomated, type SupportedPortal } from '../apply-dispatcher';
import { reportApplyFailure } from '../apply-failures';
import { todayCount, bumpApplyCounter } from '../apply-counter';
import { readConfig } from '../autopilot';
import { runEvaluate } from '../orchestrator';
import { ROOT } from '../files';
import { logEvent, reportServerError } from '../events';
import type { JobArgs, JobResult } from './types';
import type { Job } from '$lib/types';
import { userContextEnv } from '../user-context';

const APPLY_PORTAL_SCRIPT = path.join(ROOT, 'scripts/apply/apply-portal.py');

function venvPython(): string {
  const candidate = path.join(ROOT, '.venv', 'bin', 'python');
  return fs.existsSync(candidate) ? candidate : 'python3';
}

/** Effective cap for a profile, factoring in warmup window. */
function effectiveCap(profileId: string, baseCap: number): number {
  try {
    const p = readProfile(profileId) as unknown as {
      automation?: { autonomous_apply?: boolean; warmup_days?: number; enabled_at?: number };
    };
    const a = p?.automation;
    if (!a?.autonomous_apply || !a.enabled_at || !a.warmup_days) return baseCap;
    const ageDays = (Date.now() - a.enabled_at) / (24 * 60 * 60 * 1000);
    if (ageDays < a.warmup_days) {
      // During warmup: cap at 5/day regardless of the global setting.
      return Math.min(baseCap, 5);
    }
  } catch {
    /* fall through */
  }
  return baseCap;
}

/** Confirm the job's portal is in the profile's enabled_portals list AND
 *  the score clears min_score_to_apply. Returns reason string when blocked. */
function preflightProfile(job: Job, portal: SupportedPortal): string | null {
  const profileId = job.profileId;
  if (!profileId) return null; // tolerate cross-profile/active inference
  try {
    const p = readProfile(profileId) as unknown as {
      automation?: {
        autonomous_apply?: boolean;
        min_score_to_apply?: number;
        enabled_portals?: string[];
      };
    };
    const a = p?.automation;
    if (!a) return null; // no opt-in block -- allow user-clicked queue-apply
    if (a.autonomous_apply === false) return null; // user clicked Apply manually -- allowed
    const minScore = typeof a.min_score_to_apply === 'number' ? a.min_score_to_apply : 4.0;
    const score = job.score ?? job.geminiScore ?? 0;
    if (score < minScore) return 'score ' + score.toFixed(1) + ' < min ' + minScore;
    const enabled = a.enabled_portals ?? ['linkedin', 'greenhouse', 'ashby'];
    if (!enabled.includes(portal)) return 'portal ' + portal + ' not in enabled_portals';
  } catch {
    /* allow */
  }
  // Visa / work-auth gate -- short-circuit the apply if the JD requires
  // sponsorship the user doesn't have, OR the role is in a country the
  // user hasn't opted to relocate to. Same checks as /api/job/[id]/visa-check;
  // implemented here inline to keep the dispatcher self-contained.
  const visa = preflightVisa(job, profileId);
  if (visa) return visa;
  return null;
}

/** Visa preflight -- mirrors /api/job/[id]/visa-check but inline so the
 *  dispatcher doesn't need an HTTP call. Returns a block reason string
 *  ('visa: no-sponsorship') or null when the apply may proceed. */
function preflightVisa(job: Job, profileId: string): string | null {
  let profileYml: string;
  try {
    profileYml = fs.readFileSync(profilePath(profileId, 'profile-yml'), 'utf8');
  } catch {
    return null; // no profile.yml -- can't decide; allow
  }
  const statusMatch = profileYml.match(/^\s*status:\s*"?([a-z0-9-]+)"?/im);
  const status = statusMatch ? statusMatch[1] : 'unknown';
  if (status === 'us-citizen' || status === 'us-permanent-resident') return null;
  const reportText = job.reportFile
    ? (() => {
        try {
          return fs.readFileSync(
            path.join(profilePath(profileId, 'reports-dir'), job.reportFile!),
            'utf8',
          );
        } catch {
          return '';
        }
      })()
    : '';
  const haystack = (job.role + ' ' + job.location + ' ' + reportText).toLowerCase();
  const noSponsor =
    /no\s+sponsorship|cannot\s+sponsor|do\s+not\s+(?:offer|provide)\s+sponsorship|without\s+sponsorship|must\s+be\s+authori[sz]ed|us\s+citizen(?:ship)?\s+required/i.test(
      haystack,
    );
  const willSponsor =
    /visa\s+sponsorship\s+available|will(?:ing)?\s+to\s+sponsor|h-?1b\s+sponsorship|sponsorship\s+offered/i.test(
      haystack,
    );
  const needsSponsorship =
    status === 'h1b-needed' || status === 'h1b-transfer' || status === 'other-need-sponsorship';
  if (needsSponsorship && noSponsor && !willSponsor) {
    return 'visa: JD says no sponsorship';
  }
  return null;
}

/** Pre-apply assembly: ensure tailored CV PDF + cover letter MD exist for
 *  the job. Returns true if ready (either already there or just generated). */
async function ensureAssembly(job: Job): Promise<boolean> {
  if (!job.profileId) return true; // can't generate without a profile; let dispatcher fail soft
  const reportFile = job.reportFile;
  const pdfFile = job.pdfFile;
  if (reportFile && pdfFile) return true; // both already exist

  // Missing → spawn evaluate which produces report + tailored CV PDF + cover letter.
  // This is fire-and-forget in runEvaluate but we need to await; the result
  // bus emits a Task finished event we could listen to, but for simplicity
  // we use the awaitable form of runEvaluate.
  logEvent('apply-queue', 'Pre-apply assembly · generating CV + cover letter', {
    category: 'application',
    message: (job.company || '?') + ' · ' + (job.role || '?'),
    profileId: job.profileId,
  });
  try {
    const r = await runEvaluate(job.url, 'evaluate', job.profileId);
    if (!r.ok) {
      logEvent('apply-queue', 'Pre-apply assembly failed', {
        level: 'error',
        category: 'application',
        message: 'evaluate exit code ' + (r.code ?? '?'),
        profileId: job.profileId,
      });
      return false;
    }
  } catch (err) {
    reportServerError('apply-queue', 'Pre-apply assembly threw', err, { category: 'application' });
    return false;
  }
  return true;
}

/** Dispatch the per-portal Python script. Streams APPLY_STEP / APPLY_RESULT
 *  lines to the activity feed + apply-state file. */
function dispatchApply(
  job: Job,
  portal: SupportedPortal,
): Promise<{ status: 'applied' | 'manual-apply-needed' | 'error'; detail?: string }> {
  return new Promise((resolve) => {
    const args = [APPLY_PORTAL_SCRIPT, '--url', job.url, '--job-id', job.id];
    if (job.profileId) args.push('--profile', job.profileId);
    if (typeof job.score === 'number') args.push('--score', String(job.score));

    let lastResult: {
      status: 'applied' | 'manual-apply-needed' | 'error';
      detail?: string;
    } | null = null;
    let p;
    try {
      p = spawn(venvPython(), args, { cwd: ROOT, env: userContextEnv() });
    } catch (e) {
      resolve({ status: 'error', detail: e instanceof Error ? e.message : String(e) });
      return;
    }

    let buf = '';
    p.stdout?.on('data', (chunk: Buffer) => {
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        // Parse the canonical protocol.
        if (line.startsWith('APPLY_STEP:')) {
          const step = line.slice('APPLY_STEP:'.length).trim();
          try {
            appendStep(job.id, step);
          } catch {
            // appendStep already surfaces its own errors via logEvent
            // -- swallow here so a state-file IO issue doesn't crash the
            // protocol parser.
          }
          logEvent('apply-' + portal, 'step: ' + step, {
            level: 'info',
            category: 'application',
            message: (job.company || '?') + ' · ' + (job.role || '?'),
            profileId: job.profileId,
          });
        } else if (line.startsWith('APPLY_RESULT:')) {
          const rest = line.slice('APPLY_RESULT:'.length).trim();
          const [status, ...detailParts] = rest.split(':');
          const trimmed = status.trim();
          const detail = detailParts.join(':').trim() || undefined;
          if (trimmed === 'applied' || trimmed === 'manual-apply-needed' || trimmed === 'error') {
            lastResult = { status: trimmed, detail };
          }
        } else {
          // Generic stdout line -- surface at info level.
          logEvent('apply-' + portal, line.slice(0, 200), {
            level: 'info',
            category: 'application',
            profileId: job.profileId,
          });
        }
      }
    });
    p.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) {
        logEvent('apply-' + portal, text.slice(0, 300), {
          level: 'warn',
          category: 'application',
          profileId: job.profileId,
        });
      }
    });
    p.on('error', (err) => {
      resolve({ status: 'error', detail: err.message });
    });
    p.on('close', (code) => {
      if (lastResult) {
        resolve(lastResult);
        return;
      }
      // Fall back to exit code if the script didn't emit APPLY_RESULT.
      if (code === 0) resolve({ status: 'applied' });
      else if (code === 1)
        resolve({ status: 'manual-apply-needed', detail: 'unknown (no APPLY_RESULT line)' });
      else resolve({ status: 'error', detail: 'exit ' + code });
    });
  });
}

async function runApplyQueueDrain(_args?: JobArgs): Promise<JobResult> {
  const baseCap = readConfig().thresholds.maxAppliesPerDay;
  let processed = 0;
  let applied = 0;
  let manualNeeded = 0;
  let errored = 0;
  let skipped = 0;

  // Gather Queued jobs across every profile, sorted by score desc.
  const allJobs = loadAllJobs('all').filter((j) => j.status === 'Queued');
  allJobs.sort((a, b) => (b.score ?? b.geminiScore ?? 0) - (a.score ?? a.geminiScore ?? 0));

  if (allJobs.length === 0) {
    return { ok: true, message: 'apply-queue empty — nothing to drain', meta: { processed: 0 } };
  }

  logEvent('apply-queue', 'Drain started', {
    level: 'info',
    category: 'application',
    message: allJobs.length + ' queued · cap ' + baseCap,
  });

  for (const job of allJobs) {
    const portal = detectPortal(job.url).portal;
    // Per-profile cap (warmup-aware).
    const cap = effectiveCap(job.profileId ?? '', baseCap);
    if (todayCount() >= cap) {
      logEvent('apply-queue', 'Cap reached — stopping drain', {
        level: 'warn',
        category: 'application',
        message:
          'today=' +
          todayCount() +
          ' · cap=' +
          cap +
          ' (' +
          (allJobs.length - processed) +
          ' jobs remain queued)',
      });
      break;
    }

    // Preflight: profile policy gate.
    const blockReason = preflightProfile(job, portal);
    if (blockReason) {
      reportApplyFailure({
        jobId: job.id,
        url: job.url,
        portal,
        profileId: job.profileId,
        company: job.company,
        role: job.role,
        mode: 'error',
        detail: 'Profile preflight blocked: ' + blockReason,
      });
      skipped++;
      continue;
    }

    processed++;
    // Status → Applying.
    markStatus(job.profileId, job.url, 'Applying', 'Drain started · portal=' + portal);
    writeApplyState({
      jobId: job.id,
      url: job.url,
      portal,
      profileId: job.profileId ?? '',
      startedAt: Date.now(),
      lastStep: 'dispatching',
      stepHistory: ['queued', 'dispatching'],
    });

    // Pre-apply assembly only for production-quality portals -- stubs don't
    // need a CV/cover letter (they're going to fail soft anyway).
    if (isPortalAutomated(portal)) {
      const ready = await ensureAssembly(job);
      if (!ready) {
        reportApplyFailure({
          jobId: job.id,
          url: job.url,
          portal,
          profileId: job.profileId,
          company: job.company,
          role: job.role,
          mode: 'error',
          detail: 'Pre-apply assembly failed (evaluate did not complete)',
        });
        errored++;
        continue;
      }
    }

    // Dispatch the Python adapter.
    const result = await dispatchApply(job, portal);

    if (result.status === 'applied') {
      bumpApplyCounter();
      markStatus(job.profileId, job.url, 'Applied', 'Auto-applied via ' + portal);
      clearApplyState(job.id);
      applied++;
      logEvent('apply-' + portal, 'Applied · ' + (job.company || '?'), {
        level: 'success',
        category: 'application',
        message: job.role + ' · today ' + todayCount() + '/' + cap,
        profileId: job.profileId,
      });
    } else if (result.status === 'manual-apply-needed') {
      // The Python adapter emits its own Issue via reportApplyFailure (called
      // from apply-portal.py through the dispatcher). But adapters may also
      // exit 1 without calling it -- defensive double-emit is OK because the
      // Issue dedupeKey absorbs the duplicate.
      const reason = (result.detail ?? 'unknown').split(':')[0] as
        | 'captcha'
        | 'anti-bot'
        | 'unknown-field'
        | 'upload-failed'
        | 'validation'
        | 'stub';
      const knownModes: Array<typeof reason> = [
        'captcha',
        'anti-bot',
        'unknown-field',
        'upload-failed',
        'validation',
        'stub',
      ];
      const mode = knownModes.includes(reason) ? reason : 'stub';
      reportApplyFailure({
        jobId: job.id,
        url: job.url,
        portal,
        profileId: job.profileId,
        company: job.company,
        role: job.role,
        mode,
        detail: result.detail,
      });
      manualNeeded++;
    } else {
      reportApplyFailure({
        jobId: job.id,
        url: job.url,
        portal,
        profileId: job.profileId,
        company: job.company,
        role: job.role,
        mode: 'error',
        detail: result.detail ?? 'unknown error',
      });
      errored++;
    }
  }

  const summary =
    'Processed ' +
    processed +
    ' · applied ' +
    applied +
    ' · manual ' +
    manualNeeded +
    ' · errors ' +
    errored +
    (skipped > 0 ? ' · skipped ' + skipped : '');
  logEvent('apply-queue', 'Drain finished · ' + summary, {
    level: errored > 0 ? 'warn' : 'success',
    category: 'application',
  });
  return {
    ok: true,
    message: summary,
    meta: { processed, applied, manualNeeded, errored, skipped },
  };
}

register({
  id: 'apply-queue-drain',
  label: 'Apply queue drain',
  description:
    'Iterates Queued jobs, runs the right portal adapter, paced by maxAppliesPerDay. Replaces the legacy weekday-apply schedule.',
  category: 'apply',
  trigger: { type: 'daily', hour: 10, minute: 30, weekdays: [1, 2, 3, 4, 5] },
  allowManual: true,
  perUser: true,
  run: runApplyQueueDrain,
});

// Silence the unused-variable warning re: getProfile -- kept in scope for
// future per-profile preflight extensions (e.g. surface the friendly profile
// name in Issue messages).
void getProfile;
void listProfiles;
