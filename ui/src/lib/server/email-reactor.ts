/**
 * email-reactor — classify inbound emails + auto-react.
 *
 * For an autonomous job-search pipeline, the gap between "applied" and
 * "interviewing" is bridged by recruiter emails. The system already
 * polls Gmail via IMAP for job-alert digests; this module adds the
 * complementary capability: when a per-job recruiter email arrives,
 * automatically detect what kind it is and react.
 *
 * Reactions:
 *   - Rejection            → flip status to Rejected + fire post-rejection
 *   - Interview-scheduling → flip status to the appropriate stage
 *                            (PhoneScreen / Technical / Onsite / Final)
 *                            + auto-trigger tech-prep generation
 *   - Offer                → flip status to Offer, surface to /comp-eval,
 *                            push a high-priority notification
 *   - Take-home             → flip status to TakeHome
 *   - Recruiter-reach-out (no prior application) → log as a lead in
 *                            inbound-leads.jsonl (the channel that
 *                            historically converts best for the user)
 *
 * Architecture: pure functions for classification + matching; side-
 * effects (markStatus, spawn tech-prep, etc.) are surfaced via the
 * returned `Action[]` so the caller decides when to execute them.
 * This keeps the module testable in isolation and keeps the
 * "apply automatically" decision in one place (the API endpoint).
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './files';
import { loadAllJobs } from './parsers';
import { markStatus } from './applications';
import { logEvent } from './events';

export type EmailInput = {
  /** ISO timestamp or ms epoch */
  ts: number | string;
  /** Sender display + address: "Jane Doe <jane@acme.com>" or just the address */
  from: string;
  /** Subject line */
  subject: string;
  /** Plain-text body. HTML should be stripped by the caller. */
  body: string;
  /** Optional Message-ID for dedup if the same email lands twice */
  messageId?: string;
};

export type EmailKind =
  | 'rejection'
  | 'interview-scheduling'
  | 'offer'
  | 'take-home'
  | 'recruiter-reach-out'
  | 'other';

export type InterviewStage = 'PhoneScreen' | 'Technical' | 'Onsite' | 'Final' | 'TakeHome';

export type Classification = {
  kind: EmailKind;
  confidence: 'high' | 'medium' | 'low';
  /** When kind === 'interview-scheduling', which stage. */
  stage?: InterviewStage;
  /** Sender domain — used by the matcher to pair with a tracker job */
  senderDomain: string;
  /** Excerpt of the matched phrase, for the audit trail */
  evidence?: string;
};

/** Action items the caller should run after classification. The reactor
 *  doesn't execute these directly — it returns them so the API endpoint
 *  can apply them and log a structured audit trail. */
export type EmailAction =
  | { type: 'mark-status'; jobId: string; profileId?: string; url: string; status: string; note: string }
  | { type: 'fire-tech-prep'; jobId: string; profileId?: string }
  | { type: 'fire-post-rejection'; jobId: string; profileId?: string }
  | { type: 'fire-takehome-scaffold'; jobId: string; profileId?: string }
  | { type: 'log-lead'; sender: string; subject: string; ts: number }
  | { type: 'flag-offer'; jobId: string; profileId?: string };

// ── Classification patterns ────────────────────────────────────────

const REJECTION_PATTERNS = [
  /\bafter careful consideration\b/i,
  /\bmoved? forward with (?:other|another)\b/i,
  /\bdecided to (?:move on|move forward)\b/i,
  /\bwon't be moving forward\b/i,
  /\bno longer (?:considering|moving forward)\b/i,
  /\bregret to (?:inform|let you know)\b/i,
  /\bwe (?:will not|won't) be (?:proceeding|moving)\b/i,
  /\bwe've (?:decided|chosen) (?:to go|another)\b/i,
  /\bunfortunately, (?:we|after)\b/i,
  /\bnot (?:the right|a good) (?:fit|match) (?:at this time)?\b/i,
  /\bdecided (?:not to proceed|to pause)\b/i,
];

const OFFER_PATTERNS = [
  /\bwe('re| are) pleased to offer\b/i,
  /\bextend(?:ing)? (?:you )?an offer\b/i,
  /\bformal offer of employment\b/i,
  /\boffer letter\b/i,
  /\bbase salary of\b/i,
  /\bcompensation package\b/i,
  /\bwelcome to (?:the team|.+?)!?$/im,
];

const INTERVIEW_SCHEDULING_PATTERNS = [
  /\bwould like to schedule\b/i,
  /\bavailable (?:for a |to (?:chat|talk|connect))\b/i,
  /\bset up (?:a |the |an )?(?:call|chat|interview|phone screen|screen)\b/i,
  /\bnext step (?:in|of) (?:the |our )?(?:interview|process)\b/i,
  /\bnext steps?\b.{0,80}\binterview\b/i,
  /\binvite you to (?:a |the |an )?(?:phone screen|interview|onsite|panel)\b/i,
  /\bcalendly\.com\b/i,
  /\b(?:savvycal|cal\.com|chilipiper|gem\.com)\b/i,
  /\bschedule (?:a |the |your )?(?:call|interview|chat)\b/i,
  /\bavailable times?\b/i,
];

const TAKE_HOME_PATTERNS = [
  /\btake[- ]home (?:assignment|exercise|project|challenge|test)\b/i,
  /\bcoding (?:challenge|exercise|assignment)\b/i,
  /\bhomework\b.{0,40}\b(?:engineering|coding|technical)\b/i,
  /\battached (?:assignment|problem|exercise)\b/i,
];

const RECRUITER_REACH_OUT_PATTERNS = [
  /\bopen to (?:hearing about|chatting about|new opportunities)\b/i,
  /\bcame across your (?:profile|background|linkedin)\b/i,
  /\bI('m| am) a (?:recruiter|talent partner|sourcer) (?:at|for|with)\b/i,
  /\bopportunity at (?:our|a (?:fast-growing|stealth|series))\b/i,
  /\bwondering if you('d| would) be open\b/i,
];

// Interview-stage classification within a scheduling email.
const STAGE_PATTERNS: Array<[RegExp, InterviewStage]> = [
  [/\bonsite\b|\bon[- ]site\b|\bsuper day\b|\bsuperday\b|\bpanel\b/i, 'Onsite'],
  [/\bfinal (?:round|interview)\b|\bhiring (?:committee|manager) (?:final|interview)\b|\bvp interview\b/i, 'Final'],
  [/\btake[- ]home\b|\bcoding (?:test|challenge|exercise)\b/i, 'TakeHome'],
  [/\btechnical (?:interview|screen|round)\b|\bcoding (?:interview|round)\b|\bsystem design\b/i, 'Technical'],
  [/\bphone (?:screen|interview)\b|\brecruiter (?:call|screen)\b|\bhr screen\b|\bintro (?:call|chat)\b/i, 'PhoneScreen'],
];

function extractEvidence(text: string, patterns: RegExp[]): string | undefined {
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) return m[0].slice(0, 120);
  }
  return undefined;
}

function extractSenderDomain(from: string): string {
  const m = /<([^>]+)>/.exec(from);
  const addr = m ? m[1] : from;
  const at = addr.lastIndexOf('@');
  if (at < 0) return '';
  return addr.slice(at + 1).toLowerCase().trim();
}

/**
 * Classify an inbound email. Pure function — no I/O. Order of checks
 * matters: rejection patterns are matched FIRST because some rejection
 * emails also contain phrasing that looks like "we'll keep you in mind
 * for other opportunities" which could trigger recruiter-reach-out
 * false-positives.
 */
export function classifyEmail(email: EmailInput): Classification {
  const subj = email.subject || '';
  const body = email.body || '';
  const combined = subj + '\n' + body;
  const senderDomain = extractSenderDomain(email.from);

  // Offer FIRST — offer + take-home patterns can both appear in long emails
  const offerEvidence = extractEvidence(combined, OFFER_PATTERNS);
  if (offerEvidence) {
    return {
      kind: 'offer', confidence: 'high', senderDomain,
      evidence: offerEvidence,
    };
  }

  const rejectionEvidence = extractEvidence(combined, REJECTION_PATTERNS);
  if (rejectionEvidence) {
    return {
      kind: 'rejection',
      // "after careful consideration" is the single strongest signal
      confidence: /after careful consideration|regret to inform/i.test(rejectionEvidence) ? 'high' : 'medium',
      senderDomain,
      evidence: rejectionEvidence,
    };
  }

  const takeHomeEvidence = extractEvidence(combined, TAKE_HOME_PATTERNS);
  if (takeHomeEvidence) {
    return {
      kind: 'take-home', confidence: 'medium', stage: 'TakeHome',
      senderDomain, evidence: takeHomeEvidence,
    };
  }

  const schedulingEvidence = extractEvidence(combined, INTERVIEW_SCHEDULING_PATTERNS);
  if (schedulingEvidence) {
    // Determine which stage. Default to PhoneScreen for ambiguous "let's
    // chat" emails — they're almost always the first call.
    let stage: InterviewStage = 'PhoneScreen';
    for (const [pat, s] of STAGE_PATTERNS) {
      if (pat.test(combined)) { stage = s; break; }
    }
    return {
      kind: 'interview-scheduling',
      confidence: /calendly\.com|savvycal|cal\.com/i.test(combined) ? 'high' : 'medium',
      stage, senderDomain, evidence: schedulingEvidence,
    };
  }

  const recruiterEvidence = extractEvidence(combined, RECRUITER_REACH_OUT_PATTERNS);
  if (recruiterEvidence) {
    return {
      kind: 'recruiter-reach-out', confidence: 'medium', senderDomain,
      evidence: recruiterEvidence,
    };
  }

  return { kind: 'other', confidence: 'low', senderDomain };
}

// ── Match-to-job ───────────────────────────────────────────────────

/** Match an email to an existing tracker job by sender domain + company
 *  name. Returns the highest-confidence candidate. */
export function matchEmailToJob(
  email: EmailInput,
  cls: Classification,
): { jobId: string; profileId?: string; url: string; company: string; status: string } | null {
  const allJobs = loadAllJobs('all');
  if (allJobs.length === 0) return null;

  const senderDomain = cls.senderDomain;
  // Strip common ATS-relay prefixes (greenhouse-mail.io, hiring.team, etc.)
  const senderHost = senderDomain.replace(/^(mail\.|notifications?\.|recruiting\.|talent\.|hello@|jobs?@)/, '');

  // Score candidates by (a) company name in subject/body, (b) domain match.
  const candidates: Array<{ jobId: string; profileId?: string; url: string; company: string; status: string; score: number }> = [];
  const subj = (email.subject || '').toLowerCase();
  const body = (email.body || '').toLowerCase().slice(0, 4000);
  const combined = subj + ' ' + body;

  for (const j of allJobs) {
    if (!j.company || !j.url) continue;
    let score = 0;
    const companyLower = j.company.toLowerCase();
    // Direct mention in subject is the strongest signal.
    if (subj.includes(companyLower)) score += 5;
    else if (combined.includes(companyLower)) score += 2;
    // Sender domain contains the company name (e.g. recruiter@stripe.com)
    if (senderHost.includes(companyLower.replace(/\s+/g, ''))) score += 4;
    if (companyLower.replace(/\s+/g, '').includes(senderHost.split('.')[0])) score += 2;
    // Prefer jobs we've already applied to over not-yet-applied
    if (j.status === 'Applied' || j.status === 'Applying' || j.status === 'PhoneScreen' ||
        j.status === 'Technical' || j.status === 'Onsite' || j.status === 'TakeHome' ||
        j.status === 'Final' || j.status === 'Interview' || j.status === 'Screened') {
      score += 3;
    }
    if (score > 0) {
      candidates.push({ jobId: j.id, profileId: j.profileId, url: j.url, company: j.company, status: j.status, score });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  // Require a minimum score to avoid bad matches.
  if (candidates[0].score < 3) return null;
  return candidates[0];
}

// ── Build action list ──────────────────────────────────────────────

const LEADS_FILE = path.join(ROOT, 'data', 'inbound-leads.jsonl');

/**
 * Combine classification + match into a concrete action list. The caller
 * (API endpoint) decides whether to execute them based on confidence +
 * the user's per-profile auto-react setting.
 */
export function planActions(
  email: EmailInput,
  cls: Classification,
  match: ReturnType<typeof matchEmailToJob>,
): EmailAction[] {
  const actions: EmailAction[] = [];

  if (cls.kind === 'recruiter-reach-out') {
    // No existing job to match against — log as an inbound lead. These
    // are the channel that historically converts; surface them up.
    actions.push({
      type: 'log-lead',
      sender: email.from,
      subject: email.subject,
      ts: typeof email.ts === 'number' ? email.ts : Date.parse(email.ts as string) || Date.now(),
    });
    return actions;
  }

  if (!match) {
    // No tracker match — we can't take any per-job action. The caller
    // can still log this so the user sees it in the inbox.
    return actions;
  }

  const note = `Email-reactor: ${cls.kind}${cls.evidence ? ' — "' + cls.evidence.slice(0, 60) + '"' : ''}`;

  if (cls.kind === 'rejection') {
    actions.push({
      type: 'mark-status', jobId: match.jobId, profileId: match.profileId,
      url: match.url, status: 'Rejected', note,
    });
    actions.push({ type: 'fire-post-rejection', jobId: match.jobId, profileId: match.profileId });
  } else if (cls.kind === 'offer') {
    actions.push({
      type: 'mark-status', jobId: match.jobId, profileId: match.profileId,
      url: match.url, status: 'Offer', note,
    });
    actions.push({ type: 'flag-offer', jobId: match.jobId, profileId: match.profileId });
  } else if (cls.kind === 'interview-scheduling' && cls.stage) {
    actions.push({
      type: 'mark-status', jobId: match.jobId, profileId: match.profileId,
      url: match.url, status: cls.stage, note,
    });
    // Auto-fire tech-prep when transitioning to any technical stage.
    if (cls.stage === 'Technical' || cls.stage === 'Onsite' || cls.stage === 'Final' || cls.stage === 'TakeHome') {
      actions.push({ type: 'fire-tech-prep', jobId: match.jobId, profileId: match.profileId });
    }
  } else if (cls.kind === 'take-home') {
    actions.push({
      type: 'mark-status', jobId: match.jobId, profileId: match.profileId,
      url: match.url, status: 'TakeHome', note,
    });
    actions.push({ type: 'fire-tech-prep', jobId: match.jobId, profileId: match.profileId });
    // (#5) Scaffold the take-home working dir: README + CHECKLIST + state
    // with a default 4h budget. The user adjusts via the UI; reading the
    // CHECKLIST before starting is the single biggest predictor of a
    // good submission.
    actions.push({ type: 'fire-takehome-scaffold', jobId: match.jobId, profileId: match.profileId });
  }

  return actions;
}

// ── Side-effect runner ─────────────────────────────────────────────

export type ExecutionResult = {
  executed: number;
  skipped: number;
  errors: string[];
};

export function executeActions(actions: EmailAction[]): ExecutionResult {
  const result: ExecutionResult = { executed: 0, skipped: 0, errors: [] };

  for (const a of actions) {
    try {
      switch (a.type) {
        case 'mark-status':
          markStatus(a.profileId, a.url, a.status as never, a.note);
          logEvent('email-reactor', 'Status auto-update · ' + a.status, {
            level: 'success', category: 'application',
            message: a.note, profileId: a.profileId,
          });
          result.executed++;
          break;
        case 'log-lead':
          appendLead({ sender: a.sender, subject: a.subject, ts: a.ts });
          logEvent('email-reactor', 'Recruiter lead logged', {
            level: 'info', category: 'application',
            message: a.sender + ' · ' + a.subject.slice(0, 80),
          });
          result.executed++;
          break;
        case 'fire-tech-prep':
          // Fire-and-forget background spawn — keeps the email-reactor
          // hot-path fast. The actual generation is handled by the
          // existing /api/job/[id]/tech-prep endpoint logic.
          fireBackgroundTechPrep(a.jobId, a.profileId);
          logEvent('email-reactor', 'Tech-prep fired', {
            level: 'info', category: 'application',
            message: a.jobId, profileId: a.profileId,
          });
          result.executed++;
          break;
        case 'fire-post-rejection':
          fireBackgroundPostRejection(a.jobId, a.profileId);
          logEvent('email-reactor', 'Post-rejection capture fired', {
            level: 'info', category: 'application',
            message: a.jobId, profileId: a.profileId,
          });
          result.executed++;
          break;
        case 'fire-takehome-scaffold':
          fireBackgroundTakehomeScaffold(a.jobId, a.profileId);
          logEvent('email-reactor', 'Take-home scaffold fired', {
            level: 'info', category: 'application',
            message: 'Working dir + README + checklist + state.json created · open the job\'s tech-prep menu',
            profileId: a.profileId,
          });
          result.executed++;
          break;
        case 'flag-offer': {
          // (#4) "Don't accept verbally" auto-prompt. The reactor has
          // detected an offer email; immediately surface the playbook +
          // a do-not-screw-up checklist in the activity feed as a
          // success-level event (priority for OS notifications).
          //
          // The link drives the user to /negotiation where the full
          // structured wizard lives. We surface as a single event (the
          // bell catches it; PushNotificationsToggle bridges to OS
          // notification when tab isn't focused).
          logEvent('email-reactor', '🎉 OFFER detected · DON\'T accept verbally', {
            level: 'success', category: 'application',
            message:
              'Open /negotiation for the if-they-say-X-you-say-Y scripts + non-comp asks checklist. ' +
              'Plug numbers into /comp-eval before responding. 48h response window — buy yourself the time.',
            link: '/negotiation',
            profileId: a.profileId,
          });
          result.executed++;
          break;
        }
        default:
          result.skipped++;
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return result;
}

function appendLead(lead: { sender: string; subject: string; ts: number }): void {
  fs.mkdirSync(path.dirname(LEADS_FILE), { recursive: true });
  fs.appendFileSync(LEADS_FILE, JSON.stringify(lead) + '\n');
}

export function listLeads(): Array<{ sender: string; subject: string; ts: number }> {
  if (!fs.existsSync(LEADS_FILE)) return [];
  const txt = fs.readFileSync(LEADS_FILE, 'utf8');
  const out: Array<{ sender: string; subject: string; ts: number }> = [];
  for (const line of txt.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return out.sort((a, b) => b.ts - a.ts);
}

function fireBackgroundTechPrep(jobId: string, profileId?: string): void {
  // We hit our own endpoint via fetch() so we go through the standard
  // tech-prep generation path. The localhost URL is hard-coded; in
  // production this should be configurable.
  const url = '/api/job/' + encodeURIComponent(jobId) + '/tech-prep' +
    (profileId ? '?profile=' + encodeURIComponent(profileId) : '');
  // SvelteKit endpoints accept relative paths only from within the
  // server context — we use globalThis.fetch which routes through the
  // server runtime. Errors are surfaced via the activity feed inside
  // the tech-prep endpoint itself.
  void fetch('http://127.0.0.1:5174' + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    .catch((err) => logEvent('email-reactor', 'Background tech-prep failed', {
      level: 'warn', category: 'application',
      message: err instanceof Error ? err.message : String(err),
    }));
}

function fireBackgroundPostRejection(jobId: string, profileId?: string): void {
  const url = '/api/job/' + encodeURIComponent(jobId) + '/post-rejection' +
    (profileId ? '?profile=' + encodeURIComponent(profileId) : '');
  void fetch('http://127.0.0.1:5174' + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    .catch((err) => logEvent('email-reactor', 'Background post-rejection failed', {
      level: 'warn', category: 'application',
      message: err instanceof Error ? err.message : String(err),
    }));
}

function fireBackgroundTakehomeScaffold(jobId: string, profileId?: string): void {
  // Fire-and-forget POST to the takehome endpoint, which scaffolds the
  // working dir + README + CHECKLIST + state.json with a default 4h
  // budget. The user can adjust budget via PATCH from the UI.
  const url = '/api/job/' + encodeURIComponent(jobId) + '/takehome' +
    (profileId ? '?profile=' + encodeURIComponent(profileId) : '');
  void fetch('http://127.0.0.1:5174' + url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  }).catch((err) => logEvent('email-reactor', 'Background takehome-scaffold failed', {
    level: 'warn', category: 'application',
    message: err instanceof Error ? err.message : String(err),
  }));
}

/** Full pipeline: classify → match → plan → execute. Returns the audit
 *  payload so the API endpoint can show what happened. */
export function reactToEmail(email: EmailInput): {
  classification: Classification;
  match: ReturnType<typeof matchEmailToJob>;
  actions: EmailAction[];
  execution: ExecutionResult;
} {
  const classification = classifyEmail(email);
  const match = (classification.kind !== 'recruiter-reach-out' && classification.kind !== 'other')
    ? matchEmailToJob(email, classification)
    : null;
  const actions = planActions(email, classification, match);
  const execution = executeActions(actions);
  return { classification, match, actions, execution };
}
