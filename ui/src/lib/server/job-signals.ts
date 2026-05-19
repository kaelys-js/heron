/**
 * job-signals -- defensive heuristics over a job posting.
 *
 * Two checks ship here, both run cheaply over the job's metadata +
 * deep-evaluation report text:
 *
 *   1. dysfunctionSignal -- does this posting look like a long-open
 *      dysfunction marker? Signals: posting age > 60 days, re-listing
 *      pattern, "urgent hire" language combined with no recent updates.
 *      Real hiring orgs fill or close roles inside 6-8 weeks. Anything
 *      open longer is either (a) impossible spec, (b) internal politics
 *      blocking the hire, (c) phantom posting for resume harvesting,
 *      (d) hiring freeze that wasn't taken down. None of those are
 *      good for a candidate.
 *
 *   2. remoteReality -- when a posting claims "remote" or "remote-
 *      friendly", how truly remote is it? Many "remote" postings are
 *      hybrid-in-disguise (must live near hub, X days/week in office,
 *      US-only, must travel quarterly). Surfaces a verdict + the
 *      specific phrase that triggered the downgrade.
 *
 * Both are read-only pure functions over the job's text. No spawns,
 * no AGENT_CLI cost.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';
import { profilePath } from './profile-paths';
import type { Job } from '$lib/types';

export type DysfunctionVerdict = 'ok' | 'risk' | 'concern';

export type DysfunctionSignal = {
  verdict: DysfunctionVerdict;
  reasons: string[];
  /** Days since the posting first appeared in our scan history. */
  daysOpen?: number;
  /** Times this URL has appeared in scan-history (re-listings). */
  reListings?: number;
};

const DAY = 24 * 60 * 60 * 1000;

function readScanHistory(profileId: string): { url: string; ts: number }[] {
  const p = profilePath(profileId, 'scan-history');
  if (!fs.existsSync(p)) return [];
  try {
    const text = fs.readFileSync(p, 'utf8');
    return text
      .split('\n')
      .map((line) => {
        const parts = line.split('\t');
        if (parts.length < 2) return null;
        const ts = Date.parse(parts[0]);
        const url = parts[1]?.trim();
        if (!ts || !url) return null;
        return { url, ts };
      })
      .filter((x): x is { url: string; ts: number } => x !== null);
  } catch {
    return [];
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

/** Compute the dysfunction signal for one job. Heuristic only -- never
 *  blocks an apply; just shows the user "this might be a flag". */
export function dysfunctionSignal(job: Job, profileId: string): DysfunctionSignal {
  const history = readScanHistory(profileId);
  const matches = history.filter((h) => h.url === job.url);
  const reasons: string[] = [];
  let verdict: DysfunctionVerdict = 'ok';

  let daysOpen: number | undefined;
  if (matches.length > 0) {
    const earliest = Math.min(...matches.map((m) => m.ts));
    daysOpen = Math.floor((Date.now() - earliest) / DAY);
  }

  if (daysOpen !== undefined && daysOpen >= 90) {
    reasons.push(
      'Posting has been live for ' +
        daysOpen +
        ' days. Real hiring closes inside 6-8 weeks — long-open postings are often dysfunctional, frozen, or phantom listings.',
    );
    verdict = 'concern';
  } else if (daysOpen !== undefined && daysOpen >= 60) {
    reasons.push(
      'Posting has been live for ' +
        daysOpen +
        ' days. Reaching that 60-day mark is a yellow flag — ask the recruiter why the role is still open.',
    );
    verdict = verdict === 'ok' ? 'risk' : verdict;
  }

  const reListings = matches.length;
  if (reListings >= 3) {
    reasons.push(
      'Posting has been re-listed ' +
        reListings +
        ' times. Re-listing pattern usually means a hire was made + lost (bad fit / bad culture) OR the spec keeps shifting.',
    );
    verdict = 'concern';
  } else if (reListings === 2) {
    reasons.push(
      'Posting has been re-listed once. Often benign (refresh for visibility) but worth asking the recruiter about turnover.',
    );
    verdict = verdict === 'ok' ? 'risk' : verdict;
  }

  // Report-text signals
  const report = readReport(job.reportFile);
  const haystack = (job.role + ' ' + job.location + ' ' + report).toLowerCase();
  if (
    /urgently hiring|immediate start|asap|need to fill quickly/i.test(haystack) &&
    daysOpen &&
    daysOpen > 30
  ) {
    reasons.push(
      'JD says "urgent" but the role is already ' +
        daysOpen +
        ' days old. Mismatch = manager not actually empowered to close.',
    );
    verdict = verdict === 'ok' ? 'risk' : verdict;
  }
  if (/the team has been waiting/i.test(haystack)) {
    reasons.push(
      'JD says "the team has been waiting" — usually code for an unfilled-too-long role.',
    );
    verdict = verdict === 'ok' ? 'risk' : verdict;
  }

  return { verdict, reasons, daysOpen, reListings };
}

// ── Remote-reality detector ─────────────────────────────────────────

export type RemoteVerdict = 'fully-remote' | 'mostly-remote' | 'hybrid' | 'onsite' | 'unclear';

export type RemoteRealityCheck = {
  verdict: RemoteVerdict;
  /** Phrases from the JD / report that triggered the verdict. */
  evidence: string[];
  /** When the JD says "remote" but evidence points to hybrid, this flag
   *  trips so the dashboard can show a warning. */
  remoteFalsePositive: boolean;
};

const HYBRID_DISGUISES = [
  {
    pattern:
      /\d+\s*(?:days?|x|times?)\s*(?:per\s*)?(?:a\s*)?week\s*(?:in\s*the?\s*)?(?:office|hq|hub)/i,
    severity: 'hybrid' as const,
  },
  {
    pattern:
      /must (?:live|reside|be based|be located).{0,80}(?:within|near|close to|metro|area|of) /i,
    severity: 'hybrid' as const,
  },
  { pattern: /(?:co-located|colocated|colocation|in-person)\s+team/i, severity: 'hybrid' as const },
  {
    pattern:
      /(?:periodically|quarterly|monthly|regularly)\s+(?:travel|visit|fly|come).{0,40}(?:office|hq|hub|team)/i,
    severity: 'hybrid' as const,
  },
  {
    pattern: /us[- ]only|usa[- ]only|americas[- ]only|north america[- ]only/i,
    severity: 'mostly-remote' as const,
  },
  {
    pattern:
      /(?:must|need to)\s+(?:be|reside|live)\s+in\s+(?:the\s+)?(?:us|usa|united states|uk|eu|europe)/i,
    severity: 'mostly-remote' as const,
  },
  {
    pattern: /eligible\s+to\s+work\s+in\s+(?:the\s+)?(?:us|uk|eu)(?:\s+without\s+sponsorship)?/i,
    severity: 'mostly-remote' as const,
  },
  {
    pattern:
      /must\s+(?:be\s+)?available\s+during\s+(?:east|west|central|pacific|eastern|gmt|cet|cst|pst|est)/i,
    severity: 'mostly-remote' as const,
  },
  { pattern: /\bhybrid\b/i, severity: 'hybrid' as const },
];

const FULLY_REMOTE_MARKERS = [
  /fully\s+remote/i,
  /work\s+from\s+anywhere/i,
  /async[- ]first/i,
  /remote[- ]first/i,
  /distributed\s+(?:team|company)/i,
  /globally\s+distributed/i,
  /remote\s+\(global\)/i,
];

const ONSITE_MARKERS = [
  /on[- ]?site\s+only/i,
  /no\s+remote/i,
  /5\s+days\s+(?:per\s*)?(?:a\s*)?week\s+in/i,
  /in\s+office\s+full[- ]?time/i,
];

export function remoteReality(job: Job, profileId?: string): RemoteRealityCheck {
  const report = readReport(job.reportFile);
  const haystack = (job.role + ' ' + job.location + ' ' + report).toLowerCase();
  const evidence: string[] = [];
  let verdict: RemoteVerdict = 'unclear';
  let downgraded = false;
  let jdClaimsRemote = false;

  // Does the JD self-claim "remote"?
  if (/\bremote\b|work from home|wfh|telecommute/i.test(haystack)) {
    jdClaimsRemote = true;
    verdict = 'fully-remote';
  }

  for (const marker of FULLY_REMOTE_MARKERS) {
    if (marker.test(haystack)) {
      verdict = 'fully-remote';
      evidence.push('Fully-remote marker: ' + marker.source);
      break;
    }
  }

  for (const marker of ONSITE_MARKERS) {
    if (marker.test(haystack)) {
      verdict = 'onsite';
      evidence.push('On-site marker: ' + marker.source);
    }
  }

  // Hybrid-disguise detection -- overrides "remote" claim when found
  for (const { pattern, severity } of HYBRID_DISGUISES) {
    if (pattern.test(haystack)) {
      const matched = haystack.match(pattern)?.[0];
      if (matched) evidence.push('Hybrid hint: "' + matched.trim().slice(0, 80) + '"');
      // Pick the most-restrictive verdict
      if (severity === 'hybrid') {
        verdict = 'hybrid';
        downgraded = true;
      } else if (severity === 'mostly-remote' && verdict === 'fully-remote') {
        verdict = 'mostly-remote';
        downgraded = true;
      }
    }
  }

  if (verdict === 'unclear' && !jdClaimsRemote && job.location && !/remote/i.test(job.location)) {
    // No remote claim + location specified → onsite assumed
    verdict = 'onsite';
    evidence.push('Location field specifies a city — no remote signal');
  }

  return {
    verdict,
    evidence,
    remoteFalsePositive: jdClaimsRemote && (verdict === 'hybrid' || verdict === 'mostly-remote'),
  };
}
