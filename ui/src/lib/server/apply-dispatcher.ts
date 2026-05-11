/**
 * apply-dispatcher — URL → portal detection + Python adapter dispatch.
 *
 * Single source of truth for "which ATS is this URL on?" — used by the
 * apply-queue drain to route each job to the right per-portal Playwright
 * adapter. Mirrors the logic in `lib_apply.py:detect_portal` (the Python
 * adapters call that one).
 *
 * Patterns extracted from scan.mjs:detectApi where overlap exists.
 *
 * Production-quality concerns:
 *  - Greenhouse migrated from boards.greenhouse.io → job-boards.greenhouse.io
 *    in 2025. Both must match.
 *  - Iframe-embedded boards on careers.{company}.com aren't detectable from
 *    URL alone — the adapter handles that case after navigating.
 *  - LinkedIn jobs use /jobs/view/{id} or /jobs/collections/.../?currentJobId=.
 *  - Workday is identified by *.myworkdayjobs.com (every customer has its
 *    own subdomain).
 */

export type SupportedPortal =
  | 'linkedin'
  | 'greenhouse'
  | 'ashby'
  | 'lever'
  | 'workable'
  | 'personio'
  | 'smartrecruiters'
  | 'recruitee'
  | 'teamtailor'
  | 'workday'
  | 'indeed'
  | 'unknown';

/** Portals with production-quality automation this session. Everything else
 *  routes to the stub adapter. Update this list when a follow-up portal lands. */
export const PRODUCTION_PORTALS: ReadonlySet<SupportedPortal> = new Set([
  'linkedin',
  'greenhouse',
  'ashby',
  'lever',
  'workday',
  // Second-round graduations — Workable/Personio/SmartRecruiters/Recruitee/
  // Teamtailor/Indeed are all production via the lib_portal scaffold.
  'workable',
  'personio',
  'smartrecruiters',
  'recruitee',
  'teamtailor',
  'indeed',
]);

export type DetectResult = {
  portal: SupportedPortal;
  meta?: { company?: string; jobId?: string };
};

export function detectPortal(url: string): DetectResult {
  if (!url) return { portal: 'unknown' };
  let u: URL;
  try { u = new URL(url); }
  catch { return { portal: 'unknown' }; }

  const h = u.hostname.toLowerCase();
  const p = u.pathname;

  // LinkedIn — /jobs/view/{id} or ?currentJobId=N
  if (/(^|\.)linkedin\.com$/.test(h)) {
    const idMatch = p.match(/\/jobs\/view\/(\d+)/);
    const currentJobId = u.searchParams.get('currentJobId');
    return { portal: 'linkedin', meta: { jobId: idMatch?.[1] ?? currentJobId ?? undefined } };
  }

  // Greenhouse — both domain variants + the EU regional shard.
  // boards.greenhouse.io/{company}/jobs/{id}
  // job-boards.greenhouse.io/{company}/jobs/{id}
  // job-boards.eu.greenhouse.io/{company}/jobs/{id}
  {
    const m = h.match(/(^|\.)((?:job-)?boards)(?:\.eu)?\.greenhouse\.io$/);
    if (m) {
      const parts = p.split('/').filter(Boolean);
      const company = parts[0];
      const jobsIdx = parts.indexOf('jobs');
      const jobId = jobsIdx >= 0 ? parts[jobsIdx + 1] : undefined;
      return { portal: 'greenhouse', meta: { company, jobId } };
    }
  }

  // Ashby — jobs.ashbyhq.com/{company}/{uuid}
  if (/(^|\.)ashbyhq\.com$/.test(h) || h === 'jobs.ashbyhq.com') {
    const parts = p.split('/').filter(Boolean);
    return { portal: 'ashby', meta: { company: parts[0], jobId: parts[1] } };
  }

  // Lever — jobs.lever.co/{company}/{uuid} (apply page is /apply suffix)
  if (h === 'jobs.lever.co' || /(^|\.)lever\.co$/.test(h)) {
    const parts = p.split('/').filter(Boolean);
    return { portal: 'lever', meta: { company: parts[0], jobId: parts[1] } };
  }

  // Workable — apply.workable.com/{company}/j/{id}
  if (/(^|\.)workable\.com$/.test(h)) {
    const parts = p.split('/').filter(Boolean);
    return { portal: 'workable', meta: { company: parts[0], jobId: parts[parts.length - 1] } };
  }

  // Personio — *.jobs.personio.{com|de|eu}
  if (/(^|\.)jobs\.personio\.(com|de|eu)$/.test(h) || /(^|\.)personio\.(com|de|eu)$/.test(h)) {
    return { portal: 'personio' };
  }

  // SmartRecruiters — jobs.smartrecruiters.com/{company} OR careers.smartrecruiters.com
  if (/(^|\.)smartrecruiters\.com$/.test(h)) {
    const parts = p.split('/').filter(Boolean);
    return { portal: 'smartrecruiters', meta: { company: parts[0] } };
  }

  // Recruitee — {company}.recruitee.com
  if (/(^|\.)recruitee\.com$/.test(h)) {
    const sub = h.split('.')[0];
    return { portal: 'recruitee', meta: { company: sub } };
  }

  // Teamtailor — {company}.teamtailor.com
  if (/(^|\.)teamtailor\.com$/.test(h)) {
    const sub = h.split('.')[0];
    return { portal: 'teamtailor', meta: { company: sub } };
  }

  // Workday — every customer has its own *.myworkdayjobs.com subdomain.
  if (/(^|\.)myworkdayjobs\.com$/.test(h)) {
    return { portal: 'workday' };
  }

  // Indeed — *.indeed.com — both the listing pages and apply.indeed.com
  if (/(^|\.)indeed\.com$/.test(h)) {
    return { portal: 'indeed' };
  }

  return { portal: 'unknown' };
}

/** True if the portal has a production-quality adapter in this build. The
 *  apply-queue drain uses this to decide whether to dispatch the portal
 *  script or fall through to the stub (which emits ManualApplyNeeded). */
export function isPortalAutomated(portal: SupportedPortal): boolean {
  return PRODUCTION_PORTALS.has(portal);
}
