#!/usr/bin/env node
/**
 * verify-post-apply.mjs — Phase I-X + Gap-* post-apply pipeline verifier.
 *
 * Runs ~80 checks across:
 *   • Status union extensions + states.yml
 *   • Sidecar JSON paths (stage-state / interviewers / offers)
 *   • API endpoints (interviewers / offers / comparison / funnel / calendar /
 *     reality / referrals / visa-check / team-rep / cross-link-audit /
 *     ready-gate / first-90-days / resignation / EV / watch / inbox cards)
 *   • Mode markdown files (thank-you / interviewer-dossier / questions-to-ask /
 *     resignation / first-90-days / referral-discovery / team-rep /
 *     cross-link-audit + stage flags on interview-prep + mock-interview)
 *   • Cron job — auto-ghost registered
 *   • ai-detect-check.mjs integration into quality-checks.ts + cv-check +
 *     cover-letter endpoint
 *   • UI surfaces — /comparison, /calendar, /reality, JobStageBadge,
 *     InterviewerPanel, OfferPanel; inbox postApplyCards wired
 *   • Visa enforcement in apply-queue.job.ts
 *   • package.json scripts
 *
 * Exit:
 *   0 — every check passed
 *   1 — at least one check failed
 *   2 — environment / argument issue
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname);

const G = '\x1b[32m';
const R = '\x1b[31m';
const Y = '\x1b[33m';
const B = '\x1b[1m';
const N = '\x1b[0m';
const DIM = '\x1b[2m';

const checks = [];
const pass = (name, evidence = '') => checks.push({ status: 'pass', name, evidence });
const fail = (name, evidence = '') => checks.push({ status: 'fail', name, evidence });

function exists(rel) {
  return existsSync(join(ROOT, rel));
}

function read(rel) {
  try {
    return readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
}

function checkFileExists(rel, label = rel) {
  if (exists(rel)) pass(label);
  else fail(label, 'missing: ' + rel);
}

function checkContains(rel, needle, label) {
  const text = read(rel);
  const ok = typeof needle === 'string' ? text.includes(needle) : needle.test(text);
  if (ok) pass(label);
  else fail(label, 'not found in ' + rel + ': ' + needle);
}

// ── Phase I — Foundation ─────────────────────────────────────────────
checkFileExists('templates/states.yml', 'states.yml exists');
checkContains('templates/states.yml', 'negotiating', 'states.yml has negotiating');
checkContains('templates/states.yml', 'accepted', 'states.yml has accepted');
checkContains('templates/states.yml', 'declined', 'states.yml has declined');
checkContains('templates/states.yml', 'ghosted', 'states.yml has ghosted');

checkFileExists('ui/src/lib/types.ts', 'types.ts exists');
checkContains('ui/src/lib/types.ts', "'Negotiating'", 'Status union: Negotiating');
checkContains('ui/src/lib/types.ts', "'Accepted'", 'Status union: Accepted');
checkContains('ui/src/lib/types.ts', "'Declined'", 'Status union: Declined');
checkContains('ui/src/lib/types.ts', "'Ghosted'", 'Status union: Ghosted');
checkContains('ui/src/lib/types.ts', 'STATUS_EMPTY_COPY', 'STATUS_EMPTY_COPY present');

// Sidecar paths
checkFileExists('ui/src/lib/server/profile-paths.ts', 'profile-paths.ts exists');
checkContains('ui/src/lib/server/profile-paths.ts', "'stage-state-json'", 'stage-state-json kind');
checkContains(
  'ui/src/lib/server/profile-paths.ts',
  "'interviewers-json'",
  'interviewers-json kind',
);
checkContains('ui/src/lib/server/profile-paths.ts', "'offers-json'", 'offers-json kind');

// Sidecar implementations
checkFileExists('ui/src/lib/server/stage-state.ts', 'stage-state.ts');
checkContains('ui/src/lib/server/stage-state.ts', 'recordTransition', 'recordTransition export');
checkContains(
  'ui/src/lib/server/stage-state.ts',
  'computeFunnelStats',
  'computeFunnelStats export',
);
checkContains('ui/src/lib/server/stage-state.ts', 'listStaleJobs', 'listStaleJobs export');
checkContains('ui/src/lib/server/stage-state.ts', 'markGhosted', 'markGhosted export');

checkFileExists('ui/src/lib/server/interviewers.ts', 'interviewers.ts');
checkContains('ui/src/lib/server/interviewers.ts', 'findThankYousOwed', 'findThankYousOwed export');
checkContains(
  'ui/src/lib/server/interviewers.ts',
  'findUpcomingInterviews',
  'findUpcomingInterviews export',
);

checkFileExists('ui/src/lib/server/offers.ts', 'offers.ts');
checkContains('ui/src/lib/server/offers.ts', 'annualisedTc', 'annualisedTc export');
checkContains('ui/src/lib/server/offers.ts', 'batnaScore', 'batnaScore export');

checkFileExists('ui/src/lib/server/comp-benchmark.ts', 'comp-benchmark.ts');
checkContains('ui/src/lib/server/comp-benchmark.ts', 'fetchBenchmark', 'fetchBenchmark export');
checkContains('ui/src/lib/server/comp-benchmark.ts', 'manualBenchmark', 'manualBenchmark export');

// ── Phase II — Interviewer endpoints + modes ─────────────────────────
checkFileExists(
  'ui/src/routes/api/job/[id]/interviewers/+server.ts',
  'API /interviewers (list + upsert)',
);
checkFileExists(
  'ui/src/routes/api/job/[id]/interviewers/[slug]/+server.ts',
  'API /interviewers/[slug] (get + delete)',
);
checkFileExists(
  'ui/src/routes/api/job/[id]/interviewers/[slug]/dossier/+server.ts',
  'API per-interviewer dossier',
);
checkFileExists(
  'ui/src/routes/api/job/[id]/interviewers/[slug]/questions/+server.ts',
  'API per-interviewer questions',
);
checkFileExists(
  'ui/src/routes/api/job/[id]/interviewers/[slug]/thank-you/+server.ts',
  'API per-interviewer thank-you',
);
checkFileExists('modes/interviewer-dossier.md', 'mode: interviewer-dossier');
checkFileExists('modes/questions-to-ask.md', 'mode: questions-to-ask');
checkFileExists('modes/thank-you.md', 'mode: thank-you');

// ── Phase III — Stage-specific prep ──────────────────────────────────
checkContains('modes/interview-prep.md', '--stage', 'interview-prep mode has --stage flag');
checkContains('modes/mock-interview.md', '--stage', 'mock-interview mode has --stage flag');
checkContains(
  'modes/mock-interview.md',
  '--interviewer',
  'mock-interview mode has --interviewer flag',
);
checkFileExists('ui/src/routes/api/job/[id]/ready-gate/+server.ts', 'API /ready-gate');

// ── Phase IV — Thank-you + followup ──────────────────────────────────
// (thank-you already covered above)

// ── Phase V — Multi-offer comparison ─────────────────────────────────
checkFileExists('ui/src/routes/api/comparison/+server.ts', 'API /comparison');
checkFileExists('ui/src/routes/comparison/+page.svelte', 'page /comparison');
checkFileExists('ui/src/routes/comparison/+page.server.ts', 'loader /comparison');

// ── Phase VI — Negotiation surface ───────────────────────────────────
checkFileExists('ui/src/routes/api/job/[id]/offer/+server.ts', 'API /offer');
checkFileExists('ui/src/routes/api/job/[id]/offer/counter/+server.ts', 'API /offer/counter');
checkFileExists('ui/src/routes/api/job/[id]/offer/benchmark/+server.ts', 'API /offer/benchmark');
checkFileExists('ui/src/routes/api/job/[id]/offer/close/+server.ts', 'API /offer/close');
checkFileExists('ui/src/routes/api/job/[id]/offer/ev/+server.ts', 'API /offer/ev');

// ── Phase VII — Decision support ─────────────────────────────────────
checkFileExists('ui/src/routes/api/job/[id]/resignation/+server.ts', 'API /resignation');
checkFileExists('ui/src/routes/api/job/[id]/first-90-days/+server.ts', 'API /first-90-days');
checkFileExists('modes/resignation.md', 'mode: resignation');
checkFileExists('modes/first-90-days.md', 'mode: first-90-days');

// ── Phase VIII — Calendar + Watch ────────────────────────────────────
checkFileExists('ui/src/routes/api/calendar/+server.ts', 'API /calendar');
checkFileExists('ui/src/routes/api/calendar/sync/+server.ts', 'API /calendar/sync (iCal)');
checkFileExists('ui/src/routes/calendar/+page.svelte', 'page /calendar');
checkFileExists('ui/src/routes/api/watch/prep-brief/+server.ts', 'API watch prep-brief');
checkFileExists('ui/src/routes/api/watch/active-offers/+server.ts', 'API watch active-offers');

// ── Phase IX — Funnel + auto-ghost + reality ─────────────────────────
checkFileExists('ui/src/routes/api/funnel/+server.ts', 'API /funnel');
checkFileExists('ui/src/routes/api/reality/+server.ts', 'API /reality');
checkFileExists('ui/src/routes/reality/+page.svelte', 'page /reality');
checkFileExists('ui/src/lib/server/jobs/auto-ghost.job.ts', 'job: auto-ghost');
checkContains(
  'ui/src/lib/server/jobs/index.ts',
  "import './auto-ghost.job'",
  'auto-ghost registered',
);

// ── Phase X — Referrals ──────────────────────────────────────────────
checkFileExists('ui/src/routes/api/job/[id]/referrals/+server.ts', 'API /referrals');
checkFileExists('modes/referral-discovery.md', 'mode: referral-discovery');

// ── Gaps ──────────────────────────────────────────────────────────────
// Comp cross-reference — same module as VI.2 + comparison page covers this.
pass('Gap-Comp: covered via /offer/benchmark + /comparison');

checkFileExists('ui/src/routes/api/job/[id]/team-rep/+server.ts', 'API /team-rep');
checkFileExists('modes/team-rep.md', 'mode: team-rep');

checkFileExists('ui/src/routes/api/job/[id]/visa-check/+server.ts', 'API /visa-check');
checkContains(
  'ui/src/lib/server/jobs/apply-queue.job.ts',
  'preflightVisa',
  'apply-queue: visa preflight wired',
);

checkFileExists('ui/src/routes/api/profile/cross-link-audit/+server.ts', 'API /cross-link-audit');
checkFileExists('modes/cross-link-audit.md', 'mode: cross-link-audit');

// ai-detect-check integration
checkFileExists('ai-detect-check.mjs', 'ai-detect-check.mjs');
checkContains(
  'ui/src/lib/server/quality-checks.ts',
  'checkAiDetect',
  'quality-checks: checkAiDetect',
);
checkContains(
  'ui/src/routes/api/profile/cv-check/+server.ts',
  'checkAiDetect',
  'cv-check integrates ai-detect',
);
checkContains(
  'ui/src/routes/api/job/[id]/cover-letter/+server.ts',
  'checkAiDetect',
  'cover-letter integrates ai-detect',
);
checkContains('package.json', 'ai-detect:check', 'package.json has ai-detect:check script');
checkContains('package.json', 'verify-post-apply', 'package.json has verify:post-apply');

// ── Inbox cards UI ───────────────────────────────────────────────────
checkFileExists('ui/src/routes/api/inbox/cards/+server.ts', 'API /inbox/cards');
checkContains(
  'ui/src/routes/inbox/+page.server.ts',
  'postApplyCards',
  'inbox loader emits postApplyCards',
);
checkContains(
  'ui/src/routes/inbox/+page.svelte',
  'postApplyCards',
  'inbox page renders postApplyCards',
);

// ── Job-page tabs ────────────────────────────────────────────────────
checkFileExists('ui/src/lib/components/InterviewerPanel.svelte', 'InterviewerPanel component');
checkFileExists('ui/src/lib/components/OfferPanel.svelte', 'OfferPanel component');
checkFileExists('ui/src/lib/components/JobStageBadge.svelte', 'JobStageBadge component');
checkContains(
  'ui/src/routes/job/[id]/+page.svelte',
  'InterviewerPanel',
  'job-page renders InterviewerPanel',
);
checkContains('ui/src/routes/job/[id]/+page.svelte', 'OfferPanel', 'job-page renders OfferPanel');
checkContains(
  'ui/src/routes/job/[id]/+page.svelte',
  'JobStageBadge',
  'job-page renders JobStageBadge',
);
checkContains(
  'ui/src/routes/job/[id]/+page.server.ts',
  'getStageState',
  'job-page loader reads stage-state',
);
checkContains(
  'ui/src/routes/job/[id]/+page.server.ts',
  'listInterviewers',
  'job-page loader reads interviewers',
);
checkContains('ui/src/routes/job/[id]/+page.server.ts', 'getOffer', 'job-page loader reads offer');

// ── Stage API + transition logic ─────────────────────────────────────
checkFileExists('ui/src/routes/api/job/[id]/stage/+server.ts', 'API /stage');

// ── Round 2: 12 gap closures from the post-apply audit ──────────────
// Gap A — Semantic-match scorer (CV ↔ JD vector similarity)
checkFileExists('semantic-match.mjs', 'semantic-match.mjs (Gap A)');
checkContains(
  'ui/src/lib/server/quality-checks.ts',
  'checkSemanticMatch',
  'quality-checks: checkSemanticMatch wired',
);
checkContains('package.json', 'semantic:match', 'package.json semantic:match script');

// Gap C — CV template variants
checkFileExists('templates/cv-template-modern.html', 'cv-template-modern.html (Gap C)');
checkFileExists('templates/cv-template-executive.html', 'cv-template-executive.html (Gap C)');
checkContains('ui/src/lib/server/cv-pdf.ts', 'resolveTemplate', 'cv-pdf: resolveTemplate wired');

// Gap D — Narrative-arc validator
checkFileExists('narrative-arc.mjs', 'narrative-arc.mjs (Gap D)');
checkContains(
  'ui/src/lib/server/quality-checks.ts',
  'checkNarrativeArc',
  'quality-checks: checkNarrativeArc wired',
);
checkContains(
  'ui/src/routes/api/profile/cv-check/+server.ts',
  'checkNarrativeArc',
  'cv-check integrates narrative-arc',
);
checkContains('package.json', 'narrative:check', 'package.json narrative:check script');

// Gap F — Profile SEO (LinkedIn keyword-density optimiser)
checkFileExists('profile-seo.mjs', 'profile-seo.mjs (Gap F)');
checkFileExists('ui/src/routes/api/profile/seo/+server.ts', 'API /api/profile/seo (Gap F)');
checkContains('package.json', 'profile:seo', 'package.json profile:seo script');

// Role-dysfunction + remote-real
checkFileExists('ui/src/lib/server/job-signals.ts', 'job-signals.ts');
checkContains('ui/src/lib/server/job-signals.ts', 'dysfunctionSignal', 'dysfunctionSignal export');
checkContains('ui/src/lib/server/job-signals.ts', 'remoteReality', 'remoteReality export');
checkFileExists('ui/src/routes/api/job/[id]/signals/+server.ts', 'API /signals');

// Reference-prep mode + endpoint
checkFileExists('modes/reference-prep.md', 'mode: reference-prep');
checkFileExists('ui/src/routes/api/job/[id]/reference-prep/+server.ts', 'API /reference-prep');

// Fine-print extractor mode + endpoint
checkFileExists('modes/offer-fine-print.md', 'mode: offer-fine-print');
checkFileExists('ui/src/routes/api/job/[id]/offer/fine-print/+server.ts', 'API /offer/fine-print');

// Counter-from-current evaluator
checkFileExists('modes/counter-from-current.md', 'mode: counter-from-current');
checkFileExists(
  'ui/src/routes/api/job/[id]/counter-from-current/+server.ts',
  'API /counter-from-current',
);

// EV-of-waiting (extension of offer/ev)
checkContains(
  'ui/src/routes/api/job/[id]/offer/ev/+server.ts',
  'WaitInputs',
  'offer/ev: EV-of-waiting wired',
);

// Founders/leadership extractor
checkFileExists('modes/leadership-lookup.md', 'mode: leadership-lookup');
checkFileExists('ui/src/routes/api/job/[id]/leadership/+server.ts', 'API /leadership');

// ── Round 3: LinkedIn Reviewer+Fixer + Recruiter inbound + Psychometric ──
// LinkedIn audit (Phase A)
checkFileExists('linkedin-audit.py', 'linkedin-audit.py (Playwright scraper)');
checkFileExists('ui/src/lib/server/linkedin-audit.ts', 'linkedin-audit.ts lib');
checkContains('ui/src/lib/server/linkedin-audit.ts', 'classifySnapshot', 'classifySnapshot export');
checkContains(
  'ui/src/lib/server/linkedin-audit.ts',
  'markFindingResolved',
  'markFindingResolved export',
);
checkFileExists('ui/src/routes/api/linkedin/audit/+server.ts', 'API /linkedin/audit');
checkFileExists('ui/src/routes/api/linkedin/audit/fix/+server.ts', 'API /linkedin/audit/fix');
checkFileExists(
  'ui/src/routes/api/linkedin/audit/rewrite/+server.ts',
  'API /linkedin/audit/rewrite',
);
checkFileExists('modes/linkedin-rewrite.md', 'mode: linkedin-rewrite');
checkFileExists('ui/src/routes/linkedin-audit/+page.svelte', 'page /linkedin-audit');
checkFileExists('ui/src/lib/server/jobs/linkedin-audit.job.ts', 'job: linkedin-audit');
checkContains(
  'ui/src/lib/server/jobs/index.ts',
  "import './linkedin-audit.job'",
  'linkedin-audit job registered',
);

// Sidecar paths for round 3
checkContains(
  'ui/src/lib/server/profile-paths.ts',
  "'linkedin-audit-json'",
  'profile-paths: linkedin-audit-json kind',
);
checkContains(
  'ui/src/lib/server/profile-paths.ts',
  "'inbound-leads-jsonl'",
  'profile-paths: inbound-leads-jsonl kind',
);
checkContains(
  'ui/src/lib/server/profile-paths.ts',
  "'inbound-threads-json'",
  'profile-paths: inbound-threads-json kind',
);

// Recruiter inbound full automation (Phase B)
checkFileExists('linkedin-dm-scraper.py', 'linkedin-dm-scraper.py');
checkFileExists('ui/src/lib/server/inbound-leads.ts', 'inbound-leads.ts lib');
checkContains('ui/src/lib/server/inbound-leads.ts', 'classifyInbound', 'classifyInbound export');
checkContains(
  'ui/src/lib/server/inbound-leads.ts',
  'detectSilentRecruiters',
  'detectSilentRecruiters export',
);
checkContains('ui/src/lib/server/inbound-leads.ts', 'extractJdUrl', 'extractJdUrl export');
checkFileExists('ui/src/lib/server/jobs/linkedin-dm.job.ts', 'job: linkedin-dm');
checkContains(
  'ui/src/lib/server/jobs/index.ts',
  "import './linkedin-dm.job'",
  'linkedin-dm job registered',
);
checkFileExists('modes/recruiter-reply.md', 'mode: recruiter-reply');
checkFileExists('ui/src/routes/api/inbound/leads/+server.ts', 'API /inbound/leads (list)');
checkFileExists('ui/src/routes/api/inbound/leads/[id]/+server.ts', 'API /inbound/leads/[id]');
checkFileExists(
  'ui/src/routes/api/inbound/leads/[id]/reply/+server.ts',
  'API /inbound/leads/[id]/reply',
);
checkFileExists('ui/src/routes/inbound/+page.svelte', 'page /inbound');
checkFileExists('ui/src/routes/inbound/[id]/+page.svelte', 'page /inbound/[id]');

// Psychometric test prep (Phase C)
checkFileExists('modes/psychometric-prep.md', 'mode: psychometric-prep');
checkFileExists(
  'ui/src/routes/api/job/[id]/psychometric-prep/+server.ts',
  'API /psychometric-prep',
);

// ── Summary ──────────────────────────────────────────────────────────
const passed = checks.filter((c) => c.status === 'pass').length;
const failed = checks.filter((c) => c.status === 'fail').length;

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ passed, failed, total: checks.length, checks }, null, 2));
  process.exit(failed === 0 ? 0 : 1);
}

console.log();
console.log(`${B}verify-post-apply${N}  ${DIM}${ROOT}${N}`);
console.log();
for (const c of checks) {
  if (c.status === 'pass') {
    console.log(`  ${G}✓${N} ${c.name}`);
  } else {
    console.log(`  ${R}✗${N} ${c.name}  ${DIM}${c.evidence}${N}`);
  }
}
console.log();
const color = failed === 0 ? G : R;
console.log(`${B}Result${N}  ${color}${passed}/${checks.length} passed${N}`);
if (failed > 0) {
  console.log(`${R}${failed} failed${N}`);
}
process.exit(failed === 0 ? 0 : 1);
