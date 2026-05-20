/** GET /api/job/[id]/visa-check -- visa / work-authorisation gate combining
 *  profile.yml (targeting.visa.status: us-citizen|eu-citizen|h1b-needed|
 *  h1b-transfer|green-card|permanent-resident|unknown + willingToRelocate)
 *  with JD heuristics (must-be-authorised, no-sponsorship, sponsorship-
 *  available, security-clearance, citizenship-required, location vs
 *  targeting.locations). Returns verdict ('ok'|'risk'|'block') + reasons +
 *  advice. Consumed by the apply gate, job-page badge, and Inbox card on
 *  visa-blocked apply. */

import fs from 'node:fs';
import { wrap, badRequest } from '$lib/server/api-helpers';
import { resolveJobAndProfile } from '$lib/server/job-resolver';
import { ROOT } from '$lib/server/files';
import path from 'node:path';
import { profilePath } from '$lib/server/profile-paths';

const NO_SPONSOR_RE =
  /(no\s+sponsorship|cannot\s+sponsor|do\s+not\s+(?:offer|provide)\s+sponsorship|without\s+sponsorship|must\s+be\s+authori[sz]ed|us\s+citizen(?:ship)?\s+required|security\s+clearance\s+required|must\s+hold\s+u\.s\.?\s+citizenship)/i;
const WILL_SPONSOR_RE =
  /(visa\s+sponsorship\s+available|will(?:ing)?\s+to\s+sponsor|h-?1b\s+sponsorship|sponsorship\s+offered)/i;
const REMOTE_OK_RE =
  /(fully\s+remote|remote-?friendly|work\s+from\s+anywhere|remote\s+\(global\))/i;

type VisaStatus =
  | 'us-citizen'
  | 'us-permanent-resident'
  | 'eu-citizen'
  | 'uk-citizen'
  | 'h1b-needed'
  | 'h1b-transfer'
  | 'tn-eligible'
  | 'other-need-sponsorship'
  | 'unknown';

function readProfileYaml(profileId: string): {
  visa?: { status?: VisaStatus; willingToRelocate?: boolean };
  locations?: string[];
} {
  const p = profilePath(profileId, 'profile-yml');
  if (!fs.existsSync(p)) return {};
  try {
    const text = fs.readFileSync(p, 'utf8');
    // We avoid pulling a YAML parser into this server file; we only need
    // two fields. Grep them out with line-level matches. This is
    // intentionally tolerant -- missing values just fall back to defaults.
    const statusMatch = text.match(/^\s*status:\s*"?([a-z0-9-]+)"?/im);
    const reloMatch = text.match(/^\s*willing(?:To)?[Rr]elocate:\s*(true|false)/m);
    const locationsBlock = text.match(/^locations:\s*([\s\S]+?)(?:\n[a-z]|$)/im);
    const locations = locationsBlock
      ? locationsBlock[1]
          .split('\n')
          .map((l) => l.trim().replace(/^-\s*/, '').replace(/^"|"$/g, ''))
          .filter(Boolean)
      : [];
    return {
      visa: {
        status: statusMatch ? (statusMatch[1] as VisaStatus) : 'unknown',
        willingToRelocate: reloMatch ? reloMatch[1] === 'true' : false,
      },
      locations,
    };
  } catch {
    return {};
  }
}

function readReport(reportFile?: string): string {
  if (!reportFile) return '';
  try {
    const p = path.isAbsolute(reportFile) ? reportFile : path.join(ROOT, reportFile);
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

export const GET = wrap(
  'visa-check',
  async ({ params, url }: { params: { id: string }; url: URL }) => {
    const resolved = resolveJobAndProfile(params.id, url);
    if (!resolved) badRequest('Job not found: ' + params.id);
    const { job, profileId } = resolved!;
    const profile = readProfileYaml(profileId);
    const reportText = readReport(job.reportFile);
    const haystack = (job.role + ' ' + job.location + ' ' + reportText).toLowerCase();
    const reasons: string[] = [];

    const noSponsor = NO_SPONSOR_RE.test(haystack);
    const willSponsor = WILL_SPONSOR_RE.test(haystack);
    const remote = REMOTE_OK_RE.test(haystack);

    const status: VisaStatus = profile.visa?.status ?? 'unknown';
    const willRelocate = !!profile.visa?.willingToRelocate;

    // US-citizen + permanent resident: no visa risk anywhere in the world,
    // EXCEPT when JD requires security clearance + you don't have one.
    if (status === 'us-citizen' || status === 'us-permanent-resident') {
      if (/security\s+clearance|secret\s+clearance|ts\/sci/i.test(haystack)) {
        reasons.push(
          'JD requires security clearance — verify your clearance status before applying.',
        );
      }
      return { ok: true, verdict: 'ok', reasons, advice: 'No visa risk for this profile.' };
    }

    // Sponsorship-needed paths
    const needsSponsorship =
      status === 'h1b-needed' || status === 'other-need-sponsorship' || status === 'h1b-transfer';
    if (needsSponsorship && noSponsor && !willSponsor) {
      reasons.push('JD explicitly states no sponsorship.');
      return {
        ok: true,
        verdict: 'block',
        reasons,
        advice: 'Skip this role — submitting will likely be auto-rejected on the visa filter.',
      };
    }
    if (needsSponsorship && !willSponsor && !remote) {
      reasons.push(
        'No sponsorship language in JD and role is not remote — silent rejection risk is high.',
      );
      return {
        ok: true,
        verdict: 'risk',
        reasons,
        advice:
          'Reach out to a recruiter or referral to confirm sponsorship before investing in a tailored CV.',
      };
    }

    // EU/UK candidate, role in US, etc.
    const jobLocation = (job.location || '').toLowerCase();
    const userLocations = (profile.locations ?? []).map((l) => l.toLowerCase());
    const remoteMatch = remote || /remote/i.test(jobLocation);
    if (!remoteMatch && userLocations.length) {
      const inAllowed = userLocations.some((loc) => jobLocation.includes(loc));
      if (!inAllowed && !willRelocate) {
        reasons.push('Job location (' + jobLocation + ') is outside your declared locations.');
        return {
          ok: true,
          verdict: 'risk',
          reasons,
          advice:
            'Either flip willingToRelocate in profile.yml or skip this role — long-distance applies without relocation rarely convert.',
        };
      }
    }

    return { ok: true, verdict: 'ok', reasons, advice: 'No visa flags raised for this job.' };
  },
);
