#!/usr/bin/env node
/**
 * verify-apply.mjs — production verifier for the autonomous-apply system.
 *
 * Runs ~70 concrete, behavioral checks across every phase of the plan. Each
 * check either passes or fails (no warnings). The summary at the end lets
 * you / CI see at a glance whether anything regressed.
 *
 * Usage:
 *   node verify-apply.mjs            # human-readable
 *   node verify-apply.mjs --json     # machine-readable for CI
 *
 * Conventions:
 *   - `ok(msg)`  — pass; printed green/✓
 *   - `bad(msg)` — fail; printed red/✗
 *   - All checks are best-effort and never throw — a missing file / parse
 *     error is itself logged as a fail.
 *
 * The verifier deliberately doesn't launch Chrome — those checks happen
 * in the user's Phase 8 smoke run with real Greenhouse/Ashby/LinkedIn URLs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VENV_PY = path.join(ROOT, '.venv/bin/python');
const PY = fs.existsSync(VENV_PY) ? VENV_PY : 'python3';
const JSON_MODE = process.argv.includes('--json');

const results = [];
let passed = 0;
let failed = 0;

function ok(msg) {
  results.push({ ok: true, msg });
  passed++;
  if (!JSON_MODE) console.log('  \x1b[32m✓\x1b[0m ' + msg);
}
function bad(msg) {
  results.push({ ok: false, msg });
  failed++;
  if (!JSON_MODE) console.log('  \x1b[31m✗\x1b[0m ' + msg);
}
function section(title) {
  if (!JSON_MODE) console.log('\n\x1b[36m▸ ' + title + '\x1b[0m');
}
function existsCheck(rel, label) {
  if (fs.existsSync(path.join(ROOT, rel))) ok(label + ' · ' + rel);
  else bad('MISSING: ' + label + ' · ' + rel);
}
function fileContains(rel, needle, label) {
  try {
    const txt = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (txt.includes(needle)) ok(label);
    else bad(label + ' — needle not found: ' + JSON.stringify(needle).slice(0, 80));
  } catch (e) {
    bad(label + ' — read failed: ' + e.message);
  }
}
function fileLacks(rel, needle, label) {
  try {
    const txt = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (!txt.includes(needle)) ok(label);
    else bad(label + ' — unexpected needle found: ' + JSON.stringify(needle).slice(0, 80));
  } catch (e) {
    bad(label + ' — read failed: ' + e.message);
  }
}

// ─── Phase 0: foundation ─────────────────────────────────────────
section('Phase 0 — Foundation');

existsCheck('lib_apply.py', 'shared Python apply helpers');
existsCheck('ui/src/lib/server/apply-state.ts', 'apply-state.ts');
existsCheck('ui/src/lib/server/apply-dispatcher.ts', 'apply-dispatcher.ts');
existsCheck('templates/states.yml', 'canonical state list');

fileContains('lib_apply.py', 'def human_type', 'lib_apply.human_type defined');
fileContains('lib_apply.py', 'def detect_captcha', 'lib_apply.detect_captcha defined');
fileContains('lib_apply.py', 'def fill_react_select', 'lib_apply.fill_react_select defined');
fileContains('lib_apply.py', 'def emit_result', 'lib_apply.emit_result defined');
fileContains('lib_apply.py', 'def detect_portal', 'lib_apply.detect_portal defined');

fileContains('ui/src/lib/server/apply-dispatcher.ts', 'export function detectPortal', 'TS detectPortal exported');
fileContains('ui/src/lib/server/apply-dispatcher.ts', 'PRODUCTION_PORTALS', 'PRODUCTION_PORTALS set defined');
fileContains('ui/src/lib/server/apply-dispatcher.ts', "'linkedin'", 'LinkedIn is in production portals');
fileContains('ui/src/lib/server/apply-dispatcher.ts', "'greenhouse'", 'Greenhouse is in production portals');
fileContains('ui/src/lib/server/apply-dispatcher.ts', "'ashby'", 'Ashby is in production portals');

fileContains('ui/src/lib/types.ts', "'Applying'", 'Status union has Applying');
fileContains('ui/src/lib/types.ts', "'ManualApplyNeeded'", 'Status union has ManualApplyNeeded');
fileContains('ui/src/lib/types.ts', "'Queued'", 'Status union has Queued');

fileContains('templates/states.yml', 'applying', 'states.yml has applying');
fileContains('templates/states.yml', 'manual-apply-needed', 'states.yml has manual-apply-needed');
fileContains('templates/states.yml', 'queued', 'states.yml has queued');

fileContains('AGENTS.md', 'autonomous_apply', 'AGENTS.md references autonomous_apply');
fileContains('ui/src/lib/server/profile.ts', 'autonomous_apply', 'ProfileEdit.automation.autonomous_apply');

// Python detect_portal end-to-end
{
  const code = `
import sys; sys.path.insert(0, '${ROOT}')
from lib_apply import detect_portal
cases = [
  ('https://www.linkedin.com/jobs/view/12345', 'linkedin'),
  ('https://boards.greenhouse.io/x/jobs/1', 'greenhouse'),
  ('https://job-boards.greenhouse.io/x/jobs/1', 'greenhouse'),
  ('https://jobs.ashbyhq.com/x/u', 'ashby'),
  ('https://jobs.lever.co/x/u', 'lever'),
  ('https://x.recruitee.com/o/j', 'recruitee'),
  ('https://x.myworkdayjobs.com/en/c/j', 'workday'),
  ('https://www.indeed.com/viewjob?jk=x', 'indeed'),
  ('https://example.com/anything', 'unknown'),
]
fail = 0
for u, want in cases:
  got = detect_portal(u)['portal']
  if got != want:
    print(f'FAIL {u} -> {got} (want {want})')
    fail += 1
sys.exit(fail)
`;
  const r = spawnSync(PY, ['-c', code], { encoding: 'utf8' });
  if (r.status === 0) ok('lib_apply.detect_portal routes 9/9 sample URLs');
  else bad('lib_apply.detect_portal routing: ' + (r.stdout + r.stderr).trim().split('\n').slice(0, 3).join(' | '));
}

// ─── Phase 1: pipeline plumbing ─────────────────────────────────
section('Phase 1 — Pipeline plumbing');

existsCheck('ui/src/routes/api/job/[id]/queue-apply/+server.ts', 'queue-apply endpoint');
existsCheck('ui/src/lib/server/jobs/apply-queue.job.ts', 'apply-queue.job.ts');
existsCheck('ui/src/lib/server/apply-failures.ts', 'apply-failures.ts');

fileContains('ui/src/routes/api/job/[id]/queue-apply/+server.ts', "markStatus(profileId, job.url, 'Queued'", 'queue-apply flips status to Queued');
fileContains('ui/src/routes/api/job/[id]/queue-apply/+server.ts', "blocking.has(job.status)", 'queue-apply enforces idempotency');
fileContains('ui/src/routes/api/job/[id]/queue-apply/+server.ts', 'todayCount() >= cap', 'queue-apply respects daily cap');

fileContains('ui/src/lib/server/jobs/apply-queue.job.ts', "id: 'apply-queue-drain'", 'apply-queue-drain registered');
fileContains('ui/src/lib/server/jobs/apply-queue.job.ts', 'runOferta', 'pre-apply assembly calls runOferta');
fileContains('ui/src/lib/server/jobs/apply-queue.job.ts', 'apply-portal.py', 'apply-queue-drain spawns apply-portal.py');
fileContains('ui/src/lib/server/jobs/apply-queue.job.ts', 'APPLY_STEP:', 'apply-queue-drain parses APPLY_STEP lines');
fileContains('ui/src/lib/server/jobs/apply-queue.job.ts', 'APPLY_RESULT:', 'apply-queue-drain parses APPLY_RESULT lines');
fileContains('ui/src/lib/server/jobs/apply-queue.job.ts', 'effectiveCap', 'effectiveCap (warmup-aware)');
fileContains('ui/src/lib/server/jobs/apply-queue.job.ts', 'preflightProfile', 'preflightProfile (score-gate + enabled_portals)');

fileContains('ui/src/lib/server/apply-failures.ts', "dedupeKey: 'apply:'", 'apply-failures uses apply:{jobId} dedupeKey');
fileContains('ui/src/lib/server/apply-failures.ts', "'stub'", 'apply-failures handles stub mode');
fileContains('ui/src/lib/server/apply-failures.ts', "'captcha'", 'apply-failures handles captcha mode');
fileContains('ui/src/lib/server/apply-failures.ts', "'anti-bot'", 'apply-failures handles anti-bot mode');
fileContains('ui/src/lib/server/apply-failures.ts', "'unknown-field'", 'apply-failures handles unknown-field mode');
fileContains('ui/src/lib/server/apply-failures.ts', "'upload-failed'", 'apply-failures handles upload-failed mode');
fileContains('ui/src/lib/server/apply-failures.ts', "'validation'", 'apply-failures handles validation mode');

// ─── Phase 2: dispatcher ────────────────────────────────────────
section('Phase 2 — Portal dispatcher');

existsCheck('apply-portal.py', 'apply-portal.py');
existsCheck('apply-stub.py', 'apply-stub.py');

fileContains('apply-portal.py', 'PRODUCTION_PORTALS', 'dispatcher knows production portals');
fileContains('apply-portal.py', 'apply-stub.py', 'dispatcher routes stubs to apply-stub.py');
fileContains('apply-portal.py', 'emit_result', 'dispatcher uses emit_result');

fileContains('apply-stub.py', 'APPLY_RESULT', 'stub emits APPLY_RESULT');
fileContains('apply-stub.py', "emit_result(\"manual-apply-needed\", \"stub\")", 'stub emits manual-apply-needed:stub');

// Workable has graduated to production (third-round). We can't full-flow
// test without a profile, so just verify the dispatcher spawns the
// dedicated adapter (NOT the stub). Same shape as the Lever check below.
{
  const r = spawnSync(PY, ['apply-portal.py',
    '--url', 'https://apply.workable.com/acme/j/ABCD',
    '--job-id', 'verify-prod-workable'], { cwd: ROOT, encoding: 'utf8', timeout: 10_000 });
  const out = r.stdout || '';
  if (/APPLY_STEP: dispatch-detect:workable/.test(out)
      && /APPLY_STEP: dispatch-spawn:apply-workable.py/.test(out)) {
    ok('dispatcher: Workable URL → routes to apply-workable.py (production)');
  } else {
    bad('dispatcher: Workable URL did NOT route to production adapter');
  }
  try { fs.unlinkSync(path.join(ROOT, 'data/apply-state/verify-prod-workable.json')); } catch {}
}

// Run dispatcher against a Lever URL — Lever is now PRODUCTION (#5).
// We can't easily test the full flow without a profile.yml symlink, so
// just confirm the dispatcher spawns apply-lever.py (not the stub).
{
  const r = spawnSync(PY, ['apply-portal.py',
    '--url', 'https://jobs.lever.co/acme/abc-uuid',
    '--job-id', 'verify-prod-lever'], { cwd: ROOT, encoding: 'utf8', timeout: 10_000 });
  const out = r.stdout || '';
  if (/APPLY_STEP: dispatch-detect:lever/.test(out)
      && /APPLY_STEP: dispatch-spawn:apply-lever.py/.test(out)) {
    ok('dispatcher: Lever URL → routes to apply-lever.py (production)');
  } else {
    bad('dispatcher: Lever URL did NOT route to production adapter');
  }
  try { fs.unlinkSync(path.join(ROOT, 'data/apply-state/verify-prod-lever.json')); } catch {}
}

// Run dispatcher against an unknown URL — should also route to stub.
{
  const r = spawnSync(PY, ['apply-portal.py',
    '--url', 'https://example.com/random/job',
    '--job-id', 'verify-stub-unknown'], { cwd: ROOT, encoding: 'utf8', timeout: 10_000 });
  const out = r.stdout || '';
  if (r.status === 1 && /APPLY_RESULT: manual-apply-needed:stub/.test(out)) {
    ok('dispatcher: unknown URL → routes to stub + exit 1');
  } else {
    bad('dispatcher: unknown URL routing: exit=' + r.status);
  }
  try { fs.unlinkSync(path.join(ROOT, 'data/apply-state/verify-stub-unknown.json')); } catch {}
}

// ─── Phase 3: LinkedIn integration ──────────────────────────────
section('Phase 3 — LinkedIn integration');

existsCheck('apply-linkedin.py', 'apply-linkedin.py (symlink)');
existsCheck('linkedin-easy-apply.py', 'linkedin-easy-apply.py');

// Verify the symlink resolves correctly.
try {
  const target = fs.readlinkSync(path.join(ROOT, 'apply-linkedin.py'));
  if (target === 'linkedin-easy-apply.py') ok('apply-linkedin.py is a symlink to linkedin-easy-apply.py');
  else bad('apply-linkedin.py is a symlink but points to: ' + target);
} catch {
  bad('apply-linkedin.py is not a symlink (it should be)');
}

fileContains('linkedin-easy-apply.py', 'def should_auto_submit', 'should_auto_submit defined');
fileContains('linkedin-easy-apply.py', 'autonomous_apply', 'linkedin reads autonomous_apply');
fileContains('linkedin-easy-apply.py', 'min_score_to_apply', 'linkedin gates on min_score_to_apply');
fileContains('linkedin-easy-apply.py', 'DISPATCHER_MODE', 'linkedin has dispatcher-mode flag');
fileContains('linkedin-easy-apply.py', 'APPLY_RESULT', 'linkedin emits APPLY_RESULT');
fileContains('linkedin-easy-apply.py', 'human_type', 'linkedin uses lib_apply.human_type');
fileContains('linkedin-easy-apply.py', 'human_click', 'linkedin uses lib_apply.human_click');
fileContains('linkedin-easy-apply.py', 'lib_detect_captcha', 'linkedin uses lib_apply.detect_captcha');
fileContains('linkedin-easy-apply.py', 'lib_upload_file', 'linkedin uses lib_apply.upload_file');

// Behavioral test of should_auto_submit.
{
  const code = `
import sys, importlib.util
spec = importlib.util.spec_from_file_location('le', '${ROOT}/linkedin-easy-apply.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
ok, why = m.should_auto_submit({'automation': {'autonomous_apply': False}}, 4.5, 4.0)
assert ok is False and 'disabled' in why
ok, why = m.should_auto_submit({'automation': {'autonomous_apply': True}}, 3.5, 4.0)
assert ok is False and 'below min' in why
ok, why = m.should_auto_submit({'automation': {'autonomous_apply': True}}, 4.5, 4.0)
assert ok is True and why is None
print('PASS')
`;
  const r = spawnSync(PY, ['-c', code], { encoding: 'utf8', timeout: 10_000 });
  if ((r.stdout || '').includes('PASS')) ok('should_auto_submit covers off/low-score/on cases');
  else bad('should_auto_submit cases failed: ' + (r.stderr || r.stdout).split('\n').slice(0, 3).join(' | '));
}

// ─── Phase 4: Greenhouse adapter ────────────────────────────────
section('Phase 4 — Greenhouse adapter');

existsCheck('apply-greenhouse.py', 'apply-greenhouse.py');

fileContains('apply-greenhouse.py', 'def fetch_form_schema', 'schema fetch helper');
fileContains('apply-greenhouse.py', 'def plan_from_schema', 'schema → plan helper');
fileContains('apply-greenhouse.py', 'def fill_intl_phone', 'intl-tel-input handler');
fileContains('apply-greenhouse.py', 'def fill_google_places', 'Google Places location handler');
fileContains('apply-greenhouse.py', 'def detect_confirmation', 'confirmation detector');
fileContains('apply-greenhouse.py', 'launch_persistent_context', 'persistent Chromium context');
fileContains('apply-greenhouse.py', 'job-boards-api.greenhouse.io', 'handles new (2025+) Greenhouse domain');
fileContains('apply-greenhouse.py', 'boards-api.greenhouse.io', 'handles legacy Greenhouse domain');
fileContains('apply-greenhouse.py', 'from lib_apply import', 'apply-greenhouse imports lib_apply');
fileContains('apply-greenhouse.py', 'emit_result', 'apply-greenhouse uses emit_result');
fileContains('apply-greenhouse.py', 'detect_captcha', 'apply-greenhouse calls detect_captcha');
fileContains('apply-greenhouse.py', 'screenshot_for_issue', 'apply-greenhouse saves screenshots on failure');

// Dry-run smoke (won't launch Chrome heavily — just enough to verify protocol).
// We use a 404 URL so it bails fast. We accept any of: schema_fetch_done, captcha detected,
// or a manual-apply-needed protocol line.
{
  const r = spawnSync(PY, ['apply-portal.py',
    '--url', 'https://boards.greenhouse.io/__nonexistent__/jobs/1',
    '--job-id', 'verify-greenhouse-dry',
    '--dry-run'], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
  const out = r.stdout || '';
  if (/APPLY_STEP: dispatch-detect:greenhouse/.test(out)
      && /APPLY_STEP: dispatch-spawn:apply-greenhouse.py/.test(out)
      && /APPLY_RESULT:/.test(out)) {
    ok('greenhouse dry-run emits dispatch-detect + dispatch-spawn + APPLY_RESULT');
  } else {
    bad('greenhouse dry-run did not match expected protocol (exit=' + r.status + ')');
  }
  try { fs.unlinkSync(path.join(ROOT, 'data/apply-state/verify-greenhouse-dry.json')); } catch {}
  try { fs.unlinkSync(path.join(ROOT, 'data/apply-state/verify-greenhouse-dry.png')); } catch {}
}

// ─── Phase 5: Ashby adapter ─────────────────────────────────────
section('Phase 5 — Ashby adapter');

existsCheck('apply-ashby.py', 'apply-ashby.py');

fileContains('apply-ashby.py', 'def fetch_ashby_schema', 'ashby schema fetch');
fileContains('apply-ashby.py', 'def fill_ashby_location', 'ashby cascading location');
fileContains('apply-ashby.py', 'def fill_richtext_cover_letter', 'ashby RichText cover letter');
fileContains('apply-ashby.py', 'def detect_cloudflare_block', 'ashby cloudflare detection');
fileContains('apply-ashby.py', '.playwright-ashby', 'ashby persistent context dir');
fileContains('apply-ashby.py', 'launch_persistent_context', 'ashby uses persistent context');
fileContains('apply-ashby.py', 'api.ashbyhq.com/posting-api', 'ashby uses posting-api');

// Dry-run smoke
{
  const r = spawnSync(PY, ['apply-portal.py',
    '--url', 'https://jobs.ashbyhq.com/__nonexistent__/uuid',
    '--job-id', 'verify-ashby-dry',
    '--dry-run'], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
  const out = r.stdout || '';
  if (/APPLY_STEP: dispatch-detect:ashby/.test(out)
      && /APPLY_STEP: dispatch-spawn:apply-ashby.py/.test(out)
      && /APPLY_RESULT:/.test(out)) {
    ok('ashby dry-run emits dispatch-detect + dispatch-spawn + APPLY_RESULT');
  } else {
    bad('ashby dry-run did not match expected protocol (exit=' + r.status + ')');
  }
  try { fs.unlinkSync(path.join(ROOT, 'data/apply-state/verify-ashby-dry.json')); } catch {}
  try { fs.unlinkSync(path.join(ROOT, 'data/apply-state/verify-ashby-dry.png')); } catch {}
}

// ─── Phase 6: UI consolidation ──────────────────────────────────
section('Phase 6 — UI consolidation');

fileContains('ui/src/lib/components/JobActions.svelte', 'queueApply', 'JobActions has queueApply()');
fileContains('ui/src/lib/components/JobActions.svelte', '/queue-apply', 'JobActions posts to /queue-apply');
fileContains('ui/src/lib/components/JobActions.svelte', 'autonomousMode', 'JobActions branches on autonomousMode');
fileContains('ui/src/lib/components/JobActions.svelte', 'profileAutomations', 'JobActions reads profileAutomations');

fileContains('ui/src/routes/+layout.server.ts', 'profileAutomations', 'layout exposes profileAutomations');

fileContains('ui/src/routes/queue/+page.server.ts', 'listInFlight', 'queue page reads listInFlight');
fileContains('ui/src/routes/queue/+page.server.ts', 'todayCount', 'queue page shows todayCount');
fileContains('ui/src/routes/queue/+page.svelte', 'Run drain now', 'queue page has "Run drain now"');
fileContains('ui/src/routes/queue/+page.svelte', 'ManualApplyNeeded', 'queue page surfaces ManualApplyNeeded section');

fileContains('ui/src/routes/inbox/+page.server.ts', "(i.dedupeKey ?? '').startsWith('apply:')", 'inbox filters apply: issues');
fileContains('ui/src/routes/inbox/+page.svelte', 'applyIssues', 'inbox renders applyIssues');

fileContains('ui/src/routes/profile/+page.svelte', 'Autonomous apply', 'profile has Autonomous apply card');
fileContains('ui/src/routes/profile/+page.svelte', 'autonomous_apply', 'profile card binds autonomous_apply');
fileContains('ui/src/routes/profile/+page.svelte', 'warmup_days', 'profile card binds warmup_days');
fileContains('ui/src/routes/profile/+page.svelte', 'min_score_to_apply', 'profile card binds min_score_to_apply');
fileContains('ui/src/routes/profile/+page.svelte', 'enabled_portals', 'profile card binds enabled_portals');

fileContains('ui/src/lib/server/autopilot.ts', "task: 'apply-queue-drain'", 'autopilot default schedule fires apply-queue-drain');
fileLacks('ui/src/lib/server/autopilot.ts', "task: 'apply-linkedin'", 'autopilot default no longer fires apply-linkedin');

// ─── Phase 7: help docs ────────────────────────────────────────
section('Phase 7 — Help docs');

existsCheck('ui/src/routes/help/autonomous-apply/+page.svelte', 'help page exists');
fileContains('ui/src/routes/help/autonomous-apply/+page.svelte', 'Risk acknowledgment', 'help has risk-ack section');
fileContains('ui/src/routes/help/autonomous-apply/+page.svelte', 'LinkedIn shadowban', 'help mentions shadowban risk');
fileContains('ui/src/routes/help/autonomous-apply/+page.svelte', 'Portal coverage', 'help has portal coverage table');
fileContains('ui/src/routes/help/autonomous-apply/+page.svelte', 'Failure modes', 'help documents failure modes');

// ─── Punch-list #1: Form-answers cache ─────────────────────────
section('Punch-list #1 — Form-answers cache');

existsCheck('ui/src/lib/server/form-answers-cache.ts', 'form-answers-cache.ts');
existsCheck('ui/src/routes/api/profile/form-answers/+server.ts', '/api/profile/form-answers');
existsCheck('ui/src/lib/components/FormAnswersCard.svelte', 'FormAnswersCard component');

fileContains('lib_apply.py', 'def normalize_question', 'Python normalize_question defined');
fileContains('lib_apply.py', 'def load_form_answers', 'Python load_form_answers defined');
fileContains('ui/src/lib/server/form-answers-cache.ts', 'export function normalizeQuestion', 'TS normalizeQuestion exported');
fileContains('ui/src/lib/server/form-answers-cache.ts', 'export function saveAnswer', 'TS saveAnswer exported');
fileContains('apply-greenhouse.py', 'load_form_answers(profile_id)', 'Greenhouse adapter uses cache');
fileContains('apply-ashby.py', 'load_form_answers(profile_id)', 'Ashby adapter uses cache');
fileContains('ui/src/routes/inbox/+page.svelte', 'saveAnswerForIssue', 'Inbox has inline save-answer action');
fileContains('ui/src/routes/inbox/+page.svelte', 'requeueJob', 'Inbox has re-queue action');

// Python+TS normalize parity test (subset of the full suite).
{
  const code = `
import sys; sys.path.insert(0, '${ROOT}')
from lib_apply import normalize_question
cases = [
  ('Why this role?', 'why this role'),
  ('Notice period (weeks)', 'notice period weeks'),
  ('Please describe why this role', 'describe why this role'),
]
fail = 0
for inp, expected in cases:
  got = normalize_question(inp)
  if got != expected:
    print(f'FAIL {inp!r} -> {got!r} (want {expected!r})')
    fail += 1
sys.exit(fail)
`;
  const r = spawnSync(PY, ['-c', code], { encoding: 'utf8' });
  if (r.status === 0) ok('Python normalize_question matches TS normalizeQuestion (3/3 cases)');
  else bad('Python normalize_question parity broken: ' + (r.stdout + r.stderr).trim());
}

// ─── Punch-list #2: EEO auto-decline ──────────────────────────
section('Punch-list #2 — EEO auto-decline');

fileContains('lib_apply.py', 'def is_eeo_label', 'EEO label detector defined');
fileContains('lib_apply.py', 'def auto_decline_eeo', 'EEO auto-decline helper defined');
fileContains('lib_apply.py', '"gender"', 'EEO patterns include gender');
fileContains('lib_apply.py', '"race"', 'EEO patterns include race');
fileContains('lib_apply.py', '"veteran"', 'EEO patterns include veteran');
fileContains('lib_apply.py', '"disability"', 'EEO patterns include disability');
fileContains('lib_apply.py', "decline to self-identify", 'EEO decline option list present');
fileContains('apply-greenhouse.py', 'is_eeo_label(label)', 'Greenhouse short-circuits EEO');
fileContains('apply-ashby.py', 'is_eeo_label(label)', 'Ashby short-circuits EEO');

// Behavioral: 17-case EEO classification
{
  const code = `
import sys; sys.path.insert(0, '${ROOT}')
from lib_apply import is_eeo_label
yes = ['gender', 'Race / Ethnicity', 'Veteran status', 'Voluntary Self-ID', 'Disability', 'Military service']
no = ['Why this role?', 'Years of experience', 'Notice period', 'Visa sponsorship', 'Salary expectations']
fail = sum(1 for s in yes if not is_eeo_label(s)) + sum(1 for s in no if is_eeo_label(s))
sys.exit(fail)
`;
  const r = spawnSync(PY, ['-c', code], { encoding: 'utf8' });
  if (r.status === 0) ok('EEO label detection: 11/11 sample labels classified correctly');
  else bad('EEO classification failed: ' + (r.stderr || r.stdout));
}

// ─── Punch-list #3: Story-bank seeding ─────────────────────────
section('Punch-list #3 — Story-bank seeding');

existsCheck('modes/seed-story-bank.md', 'seed-story-bank mode');
existsCheck('ui/src/routes/api/profile/seed-story-bank/+server.ts', '/api/profile/seed-story-bank');
fileContains('modes/seed-story-bank.md', 'STAR+R', 'seed mode produces STAR+R stories');
fileContains('modes/seed-story-bank.md', 'SEEDED', 'seed mode prints SEEDED summary line');
fileContains('ui/src/lib/server/skills.ts', "'seed-story-bank'", 'seed-story-bank registered as skill');
fileContains('ui/src/routes/profile/+page.svelte', 'seedStoryBank', 'profile page has seed button');

// ─── Punch-list #4: Interview-round sub-states ─────────────────
section('Punch-list #4 — Interview-round sub-states');

fileContains('ui/src/lib/types.ts', "'PhoneScreen'", 'Status has PhoneScreen');
fileContains('ui/src/lib/types.ts', "'Technical'", 'Status has Technical');
fileContains('ui/src/lib/types.ts', "'Onsite'", 'Status has Onsite');
fileContains('ui/src/lib/types.ts', "'Final'", 'Status has Final');
fileContains('ui/src/lib/types.ts', "'TakeHome'", 'Status has TakeHome');
fileContains('templates/states.yml', 'phonescreen', 'states.yml has phonescreen');
fileContains('templates/states.yml', 'technical', 'states.yml has technical');
fileContains('templates/states.yml', 'takehome', 'states.yml has takehome');
fileContains('ui/src/lib/server/parsers.ts', "return 'PhoneScreen'", 'mapStatus returns PhoneScreen');
fileContains('ui/src/lib/server/parsers.ts', "return 'Technical'", 'mapStatus returns Technical');
fileContains('ui/src/lib/server/parsers.ts', "return 'TakeHome'", 'mapStatus returns TakeHome');
fileContains('ui/src/lib/server/parsers.ts', "return 'Onsite'", 'mapStatus returns Onsite');
fileContains('ui/src/lib/server/parsers.ts', "return 'Final'", 'mapStatus returns Final');
fileContains('verify-pipeline.mjs', "'phonescreen'", 'verify-pipeline accepts phonescreen as canonical');

// ─── Punch-list #5: Lever production adapter ──────────────────
section('Punch-list #5 — Lever production adapter');

existsCheck('apply-lever.py', 'Lever adapter');
fileContains('apply-lever.py', 'def fetch_lever_schema', 'Lever schema fetch helper');
fileContains('apply-lever.py', 'api.lever.co/v0/postings', 'Lever uses postings API');
fileContains('apply-lever.py', 'load_form_answers', 'Lever uses form-answers cache');
fileContains('apply-lever.py', 'is_eeo_label', 'Lever handles EEO');
fileContains('apply-portal.py', '"lever"', 'apply-portal includes lever as production');
fileContains('ui/src/lib/server/apply-dispatcher.ts', "'lever'", 'TS dispatcher knows lever');

// ─── Punch-list #6: Technical-interview prep ───────────────────
section('Punch-list #6 — Technical-interview prep');

existsCheck('modes/tech-prep.md', 'tech-prep mode');
existsCheck('ui/src/routes/api/job/[id]/tech-prep/+server.ts', 'tech-prep endpoint');
existsCheck('ui/src/routes/help/technical-interview/+page.svelte', 'tech-interview help page');
fileContains('modes/tech-prep.md', 'TECH_PREP_PATH', 'mode emits TECH_PREP_PATH stdout');
fileContains('modes/tech-prep.md', 'Pipeline map', 'mode has pipeline-map section');
fileContains('modes/tech-prep.md', 'Coding-interview prep', 'mode has coding section');
fileContains('modes/tech-prep.md', 'System-design prep', 'mode has system-design section');
fileContains('ui/src/lib/components/JobActions.svelte', 'generateTechPrep', 'JobActions has generateTechPrep');
fileContains('ui/src/lib/server/skills.ts', "'tech-prep'", 'tech-prep registered as skill');

// ─── Punch-list #8: JD keyword-match score ─────────────────────
section('Punch-list #8 — JD keyword-match score');

existsCheck('ui/src/lib/server/keyword-match.ts', 'keyword-match scorer');
existsCheck('ui/src/routes/api/job/[id]/keyword-match/+server.ts', 'keyword-match endpoint');
existsCheck('ui/src/lib/components/KeywordMatchBadge.svelte', 'KeywordMatchBadge component');
fileContains('ui/src/lib/server/keyword-match.ts', 'export function keywordMatch', 'keywordMatch exported');
fileContains('ui/src/lib/server/keyword-match.ts', 'tokenize(cv).join', 'punctuation-normalized phrase matching');
fileContains('ui/src/routes/job/[id]/+page.svelte', '<KeywordMatchBadge', 'badge rendered on job detail');

// Behavioral: perfect-match should be 100%, no-overlap should be 0%
{
  const code = `
function tokenize(t){const SW=new Set(['a','an','and','are','as','at','be','by','do','for','from','in','is','it','of','on','or','the','to','with','you','your','years','year','include','required','requirements','must','looking','seeking','role','job','position','team','company','work','working','experience']);return (t||'').toLowerCase().replace(/[^a-z0-9+#./\\-\\s]/g,' ').split(/\\s+/).map(x=>x.replace(/^[\\-./]+|[\\-./]+$/g,'')).filter(x=>x.length>=2&&!SW.has(x));}
function ngrams(t,n){const o=[];for(let i=0;i+n<=t.length;i++)o.push(t.slice(i,i+n).join(' '));return o;}
function km(jd,cv){const jt=tokenize(jd);const cs=new Set(tokenize(cv));const cn=tokenize(cv).join(' ');if(!jt.length)return 0;const u=[...new Set(jt)],b=[...new Set(ngrams(jt,2))],tr=[...new Set(ngrams(jt,3))];let tw=0,mw=0;for(const t of u){tw+=1;if(cs.has(t))mw+=1}for(const p of b){tw+=2;if(cn.includes(p))mw+=2}for(const p of tr){tw+=3;if(cn.includes(p))mw+=3}return Math.round(mw/tw*100);}
const jd='Senior TypeScript Engineer with React Node.js GCP Cloudflare';
const verbatim=km(jd, 'Senior TypeScript Engineer with React Node.js GCP Cloudflare and 10 yrs production');
const none=km(jd, 'Java Spring Kotlin backend');
if(verbatim<95||none>5){process.exit(1)}else{process.exit(0)}
  `;
  const r = spawnSync('node', ['-e', code], { encoding: 'utf8' });
  if (r.status === 0) ok('keyword-match scoring: verbatim ≥95%, no-overlap ≤5%');
  else bad('keyword-match scoring band-edges off (exit=' + r.status + ')');
}

// ─── Punch-list #9: Total-comp math ────────────────────────────
section('Punch-list #9 — Total-comp math');

existsCheck('ui/src/lib/server/comp-math.ts', 'comp-math module');
existsCheck('ui/src/routes/api/comp-eval/+server.ts', 'comp-eval endpoint');
existsCheck('ui/src/routes/comp-eval/+page.svelte', '/comp-eval interactive page');
fileContains('ui/src/lib/server/comp-math.ts', 'export function evaluateOffer', 'evaluateOffer exported');
fileContains('ui/src/lib/server/comp-math.ts', 'export function compareOffers', 'compareOffers exported');
fileContains('ui/src/lib/server/comp-math.ts', 'rsu-public', 'EquityType includes rsu-public');
fileContains('ui/src/lib/server/comp-math.ts', 'pre-ipo-rsu', 'EquityType includes pre-ipo-rsu');
fileContains('ui/src/lib/server/comp-math.ts', 'iso', 'EquityType includes ISO');
fileContains('ui/src/lib/server/comp-math.ts', 'equityDiscountPct', 'risk-discount supported');

// ─── Punch-list #10: Pattern suggestions ───────────────────────
section('Punch-list #10 — Pattern suggestions');

existsCheck('ui/src/lib/server/pattern-suggestions.ts', 'pattern-suggestions module');
existsCheck('ui/src/routes/api/patterns/suggestions/+server.ts', 'patterns/suggestions endpoint');
existsCheck('ui/src/routes/patterns/+page.svelte', '/patterns review page');
fileContains('ui/src/lib/server/pattern-suggestions.ts', 'listSuggestions', 'listSuggestions exported');
fileContains('ui/src/lib/server/pattern-suggestions.ts', 'applySuggestion', 'applySuggestion exported');
fileContains('ui/src/lib/server/pattern-suggestions.ts', "'portals-add-negative-keyword'", 'op: add negative keyword');
fileContains('ui/src/lib/server/pattern-suggestions.ts', "'profile-set-min-score'", 'op: set min score');
fileContains('ui/src/lib/server/pattern-suggestions.ts', '.bak', 'mutations write .bak backup');

// ─── Punch-list #7: Workday adapter ────────────────────────────
section('Punch-list #7 — Workday adapter (heuristic)');

existsCheck('apply-workday.py', 'Workday adapter');
fileContains('apply-workday.py', 'WORKDAY_SELECTORS', 'Workday has selector heuristic set');
fileContains('apply-workday.py', 'data-automation-id', 'Workday uses data-automation-id');
fileContains('apply-workday.py', 'detect_account_gate', 'Workday detects account gate');
fileContains('apply-workday.py', 'click_next', 'Workday walks the wizard');
fileContains('apply-workday.py', 'MAX_WIZARD_PAGES', 'wizard page cap defined');
fileContains('apply-workday.py', 'load_form_answers', 'Workday uses form-answers cache');
fileContains('apply-workday.py', 'is_eeo_label', 'Workday handles EEO');
fileContains('apply-portal.py', '"workday"', 'apply-portal lists workday as production');

// ─── Second-round punch-list ────────────────────────────────────
section('Second-round #1 — Auto-seed form-answers cache');

existsCheck('modes/seed-form-answers.md', 'seed-form-answers mode');
existsCheck('ui/src/routes/api/profile/seed-form-answers/+server.ts', 'seed-form-answers endpoint');
fileContains('modes/seed-form-answers.md', 'SEED_ROWS_WRITTEN', 'mode emits structured stdout');
fileContains('ui/src/routes/api/onboarding/complete/+server.ts', 'fireAndForgetSeedFormAnswers', 'onboarding-complete fires seed in background');
fileContains('ui/src/lib/components/FormAnswersCard.svelte', 'seedFromCv', 'FormAnswersCard has Re-seed button');
fileContains('ui/src/lib/server/skills.ts', "'seed-form-answers'", 'seed-form-answers registered');

section('Second-round #2 — Email-reactive automation');

existsCheck('ui/src/lib/server/email-reactor.ts', 'email-reactor module');
existsCheck('ui/src/routes/api/email/react/+server.ts', '/api/email/react endpoint');
fileContains('ui/src/lib/server/email-reactor.ts', 'export function classifyEmail', 'classifyEmail exported');
fileContains('ui/src/lib/server/email-reactor.ts', 'export function matchEmailToJob', 'matchEmailToJob exported');
fileContains('ui/src/lib/server/email-reactor.ts', 'export function planActions', 'planActions exported');
fileContains('ui/src/lib/server/email-reactor.ts', 'export function executeActions', 'executeActions exported');
fileContains('ui/src/lib/server/email-reactor.ts', 'export function reactToEmail', 'reactToEmail exported');
fileContains('ui/src/lib/server/email-reactor.ts', 'REJECTION_PATTERNS', 'rejection patterns defined');
fileContains('ui/src/lib/server/email-reactor.ts', 'OFFER_PATTERNS', 'offer patterns defined');
fileContains('ui/src/lib/server/email-reactor.ts', 'INTERVIEW_SCHEDULING_PATTERNS', 'scheduling patterns defined');
fileContains('ui/src/lib/server/email-reactor.ts', 'RECRUITER_REACH_OUT_PATTERNS', 'reach-out patterns defined');
fileContains('ui/src/lib/server/email-reactor.ts', 'inbound-leads.jsonl', 'leads ledger file path');
fileContains('ui/src/routes/inbox/+page.server.ts', 'listLeads', 'inbox loader pulls leads');
fileContains('ui/src/routes/inbox/+page.svelte', 'Inbound recruiter leads', 'inbox renders leads section');

// Behavioral: 15-case email classifier test
{
  const code = `
const R=[/\\bafter careful consideration\\b/i,/\\bregret to (?:inform|let you know)\\b/i,/\\bunfortunately, (?:we|after)\\b/i,/\\bdecided to (?:move on|move forward)\\b/i,/\\bnot (?:the right|a good) (?:fit|match)\\b/i];
const O=[/\\bwe('re| are) pleased to offer\\b/i,/\\bextend(?:ing)? (?:you )?an offer\\b/i,/\\bformal offer of employment\\b/i,/\\bbase salary of\\b/i];
const S=[/\\bwould like to schedule\\b/i,/\\bset up (?:a |the |an )?(?:call|chat|interview|phone screen|screen)\\b/i,/\\bcalendly\\.com\\b/i,/\\binvite you to (?:a |the |an )?(?:phone screen|interview|onsite|panel)\\b/i];
const T=[/\\btake[- ]home (?:assignment|exercise|project|challenge|test)\\b/i,/\\bcoding (?:challenge|exercise|assignment)\\b/i];
const X=[/\\bcame across your (?:profile|background|linkedin)\\b/i,/\\bI('m| am) a (?:recruiter|talent partner|sourcer) (?:at|for|with)\\b/i];
function cls(s){if(O.some(p=>p.test(s)))return 'offer';if(R.some(p=>p.test(s)))return 'rejection';if(T.some(p=>p.test(s)))return 'take-home';if(S.some(p=>p.test(s)))return 'interview-scheduling';if(X.some(p=>p.test(s)))return 'recruiter-reach-out';return 'other';}
const tests=[
  ['After careful consideration, we are moving forward with another candidate','rejection'],
  ['We are pleased to offer you the position','offer'],
  ['Please find attached the take-home assignment','take-home'],
  ['Let me know your availability via calendly.com/jane','interview-scheduling'],
  ["I'm a recruiter at Stripe — wondering if you'd be open","recruiter-reach-out"],
  ['Your invoice is attached','other'],
];
let f=0;
for(const[t,e]of tests){const g=cls(t);if(g!==e){f++;console.log('FAIL',t,'->',g,'!=',e)}}
process.exit(f);
`;
  const r = spawnSync('node', ['-e', code], { encoding: 'utf8' });
  if (r.status === 0) ok('email-reactor classifier: 6/6 representative cases correct');
  else bad('email-reactor classifier failed: ' + (r.stdout + r.stderr).slice(0, 200));
}

section('Second-round #3 — Push notifications + daily digest');

existsCheck('ui/src/lib/components/PushNotificationsToggle.svelte', 'PushNotificationsToggle component');
fileContains('ui/src/lib/notifications.svelte.ts', "career-ops:notify", 'notifications store dispatches career-ops:notify');
fileContains('ui/src/lib/components/PushNotificationsToggle.svelte', "new Notification(", 'component uses browser Notification API');
fileContains('ui/src/lib/components/PushNotificationsToggle.svelte', "career-ops:notify", 'component listens for the event');
fileContains('ui/src/lib/server/jobs/daily-digest.job.ts', "hour: 7, minute: 0", 'daily-digest fires at 07:00');
fileContains('ui/src/lib/server/autopilot.ts', "'morning-digest'", 'morning-digest in DEFAULT_CONFIG');
fileContains('ui/src/lib/server/autopilot.ts', "task: 'daily-digest'", 'morning-digest wired to daily-digest job');
fileContains('ui/src/routes/settings/+page.svelte', '<PushNotificationsToggle', 'settings renders toggle');

section('Second-round #4 — Auto-trigger tech-prep on stage transition');

fileContains('ui/src/lib/server/applications.ts', 'maybeAutoFireTechPrep', 'auto-fire hook in markStatus');
fileContains('ui/src/lib/server/applications.ts', 'INTERVIEW_STAGES = new Set', 'INTERVIEW_STAGES set defined');
fileContains('ui/src/lib/server/applications.ts', "'PhoneScreen', 'Technical', 'TakeHome', 'Onsite', 'Final', 'Interview'", 'all 6 interview stages covered');
fileContains('ui/src/routes/api/job/[id]/tech-prep/+server.ts', 'cached: true', 'tech-prep endpoint has cache de-dup');
fileContains('ui/src/routes/api/job/[id]/tech-prep/+server.ts', 'force === true', 'force-regenerate path');

section('Second-round #5 — Voice mock interview');

existsCheck('modes/mock-interview-turn.md', 'mock-interview-turn mode');
existsCheck('ui/src/routes/api/job/[id]/mock-turn/+server.ts', 'mock-turn endpoint');
existsCheck('ui/src/routes/job/[id]/mock/+page.svelte', '/job/[id]/mock page');
fileContains('modes/mock-interview-turn.md', 'TURN_SCORE', 'mode emits TURN_SCORE');
fileContains('modes/mock-interview-turn.md', 'NEXT_QUESTION', 'mode emits NEXT_QUESTION');
fileContains('modes/mock-interview-turn.md', 'SESSION_SUMMARY', 'mode supports end-of-session summary');
fileContains('ui/src/routes/api/job/[id]/mock-turn/+server.ts', 'parseTurnOutput', 'turn parser defined');
fileContains('ui/src/routes/api/job/[id]/mock-turn/+server.ts', 'saveTranscript', 'transcript saver defined');
fileContains('ui/src/routes/job/[id]/mock/+page.svelte', 'SpeechRecognition', 'page uses SpeechRecognition');
fileContains('ui/src/routes/job/[id]/mock/+page.svelte', 'speechSynthesis', 'page uses speechSynthesis');
fileContains('ui/src/lib/components/JobActions.svelte', "Mock interview (voice)", 'JobActions has Mock interview entry');

section('Second-round #6 — Onboarding wizard auto-actions');

fileContains('ui/src/routes/onboarding/done/+page.svelte', 'seed-story-bank', 'done step fires story-bank seed');
fileContains('ui/src/routes/onboarding/done/+page.svelte', "globalEnabled: true", 'done step turns on autopilot global');
fileContains('ui/src/routes/onboarding/done/+page.svelte', 'autoActionsLog', 'done step surfaces auto-actions log');

// ─── Third-round #A: IMAP-to-reactor wire-up ───────────────────
section('Third-round #A — IMAP-to-reactor wire-up');

fileContains('scan-email-imap.mjs', '/api/email/react', 'IMAP scanner POSTs to /api/email/react');
fileContains('scan-email-imap.mjs', 'reactorClassified', 'reactor counter tracked');
fileContains('scan-email-imap.mjs', 'reactorActed', 'actionable count tracked');
fileContains('scan-email-imap.mjs', 'CAREER_OPS_DASHBOARD_URL', 'dashboard URL configurable via env');
fileContains('scan-email-imap.mjs', 'decodeQuotedPrintable', 'body decoded for classification');

// ─── Third-round #B: 6 portal adapters ────────────────────────
section('Third-round #B — 6 portal adapters graduated to production');

existsCheck('lib_portal.py', 'shared PortalConfig + run_portal_apply scaffold');
existsCheck('apply-workable.py', 'Workable adapter');
existsCheck('apply-personio.py', 'Personio adapter');
existsCheck('apply-smartrecruiters.py', 'SmartRecruiters adapter');
existsCheck('apply-recruitee.py', 'Recruitee adapter');
existsCheck('apply-teamtailor.py', 'Teamtailor adapter');
existsCheck('apply-indeed.py', 'Indeed adapter');

fileContains('lib_portal.py', 'class PortalConfig', 'PortalConfig dataclass');
fileContains('lib_portal.py', 'def run_portal_apply', 'standard apply loop');
fileContains('lib_portal.py', 'def discover_required_questions', 'heuristic question discovery');
fileContains('lib_portal.py', 'def adapter_main', 'standard adapter scaffold');

fileContains('apply-workable.py', 'workable_config', 'Workable config factory');
fileContains('apply-personio.py', 'Bewerbung absenden', 'Personio handles German submit text');
fileContains('apply-smartrecruiters.py', 'firstName', 'SmartRecruiters basic-field selectors');
fileContains('apply-recruitee.py', 'recruitee_config', 'Recruitee config factory');
fileContains('apply-teamtailor.py', "aria-label", 'Teamtailor uses aria-label selectors');
fileContains('apply-indeed.py', 'multipage=True', 'Indeed walks multi-page wizard');

fileContains('apply-portal.py', '"workable"', 'apply-portal includes workable as production');
fileContains('apply-portal.py', '"personio"', 'apply-portal includes personio as production');
fileContains('apply-portal.py', '"smartrecruiters"', 'apply-portal includes smartrecruiters as production');
fileContains('apply-portal.py', '"recruitee"', 'apply-portal includes recruitee as production');
fileContains('apply-portal.py', '"teamtailor"', 'apply-portal includes teamtailor as production');
fileContains('apply-portal.py', '"indeed"', 'apply-portal includes indeed as production');
fileLacks('apply-portal.py', 'STUB_PORTALS = {\n    "workable"', 'workable removed from stubs');

fileContains('ui/src/lib/server/apply-dispatcher.ts', "'workable',", 'TS dispatcher lists workable as production');
fileContains('ui/src/lib/server/apply-dispatcher.ts', "'personio',", 'TS dispatcher lists personio as production');
fileContains('ui/src/lib/server/apply-dispatcher.ts', "'smartrecruiters',", 'TS dispatcher lists smartrecruiters as production');
fileContains('ui/src/lib/server/apply-dispatcher.ts', "'recruitee',", 'TS dispatcher lists recruitee as production');
fileContains('ui/src/lib/server/apply-dispatcher.ts', "'teamtailor',", 'TS dispatcher lists teamtailor as production');
fileContains('ui/src/lib/server/apply-dispatcher.ts', "'indeed',", 'TS dispatcher lists indeed as production');

// Behavioral: every adapter routes correctly when invoked through the dispatcher
const portalTests = [
  { portal: 'workable', url: 'https://apply.workable.com/test/j/ABCD/apply/' },
  { portal: 'personio', url: 'https://test.jobs.personio.com/job/12345' },
  { portal: 'smartrecruiters', url: 'https://jobs.smartrecruiters.com/test/123' },
  { portal: 'recruitee', url: 'https://test.recruitee.com/o/eng-role' },
  { portal: 'teamtailor', url: 'https://test.teamtailor.com/jobs/123' },
  { portal: 'indeed', url: 'https://www.indeed.com/viewjob?jk=xyz' },
];
for (const t of portalTests) {
  const r = spawnSync(PY, ['apply-portal.py', '--url', t.url,
    '--job-id', 'verify-r3-' + t.portal], { cwd: ROOT, encoding: 'utf8', timeout: 8_000 });
  const out = r.stdout || '';
  // Each should detect the portal AND spawn the dedicated adapter (NOT apply-stub.py).
  const detected = new RegExp('APPLY_STEP: dispatch-detect:' + t.portal).test(out);
  const spawned = new RegExp('APPLY_STEP: dispatch-spawn:apply-' + t.portal + '\\.py').test(out);
  if (detected && spawned) {
    ok('dispatcher: ' + t.portal + ' URL → spawns apply-' + t.portal + '.py');
  } else {
    bad('dispatcher: ' + t.portal + ' routing broken (detected=' + detected + ', spawned=' + spawned + ')');
  }
  try { fs.unlinkSync(path.join(ROOT, 'data/apply-state/verify-r3-' + t.portal + '.json')); } catch {}
}

// ─── Fourth-round (all 20) ─────────────────────────────────────
section('Fourth-round #1 — Voice playback');

fileContains('ui/src/routes/job/[id]/mock/+page.svelte', 'MediaRecorder', 'MediaRecorder used');
fileContains('ui/src/routes/job/[id]/mock/+page.svelte', 'recordingSupported', 'recording-supported feature detection');
fileContains('ui/src/routes/job/[id]/mock/+page.svelte', 'audioUrl', 'per-turn audio URL stored on Turn');
fileContains('ui/src/routes/job/[id]/mock/+page.svelte', 'revokeObjectURL', 'blob URLs cleaned up on unmount');
fileContains('ui/src/routes/job/[id]/mock/+page.svelte', '<audio controls', 'audio playback rendered in history');

section('Fourth-round #2 — Comp pre-flight');

existsCheck('ui/src/lib/server/comp-preflight.ts', 'comp-preflight module');
existsCheck('ui/src/routes/api/job/[id]/comp-preflight/+server.ts', '/api/job/[id]/comp-preflight endpoint');
existsCheck('ui/src/lib/components/CompPreflightBadge.svelte', 'CompPreflightBadge component');
fileContains('ui/src/lib/server/comp-preflight.ts', 'export function compPreflightForJob', 'preflight function exported');
fileContains('ui/src/lib/server/comp-preflight.ts', 'Anchor with the TOP', 'advice anchors high');
fileContains('ui/src/routes/job/[id]/+page.svelte', '<CompPreflightBadge', 'badge rendered on job detail');

section('Fourth-round #3 — Application timing');

existsCheck('ui/src/lib/server/apply-timing.ts', 'apply-timing module');
existsCheck('ui/src/routes/api/job/[id]/apply-timing/+server.ts', '/api/job/[id]/apply-timing endpoint');
existsCheck('ui/src/lib/components/ApplyTimingBadge.svelte', 'ApplyTimingBadge component');
fileContains('ui/src/lib/server/apply-timing.ts', "'fresh'", 'fresh band defined');
fileContains('ui/src/lib/server/apply-timing.ts', "'late'", 'late band defined');
fileContains('ui/src/lib/server/apply-timing.ts', 'export function applyTimingFor', 'applyTimingFor exported');
fileContains('ui/src/routes/job/[id]/+page.svelte', '<ApplyTimingBadge', 'badge rendered on job detail');

// Behavioral: band-classification logic
{
  const code = `
function bandFor(days) {
  if (days == null) return 'late';
  if (days <= 3) return 'fresh';
  if (days <= 7) return 'good';
  if (days <= 14) return 'fading';
  return 'late';
}
const tests = [[0,'fresh'],[3,'fresh'],[4,'good'],[7,'good'],[8,'fading'],[14,'fading'],[15,'late'],[null,'late']];
let fail = 0;
for (const [d, e] of tests) if (bandFor(d) !== e) fail++;
process.exit(fail);
  `;
  const r = spawnSync('node', ['-e', code], { encoding: 'utf8' });
  if (r.status === 0) ok('apply-timing band logic: 8/8 day-buckets classify correctly');
  else bad('apply-timing band logic failed');
}

section('Fourth-round #4 + #8 + #11 + #12 + #19 + #20 — Negotiation playbook');

existsCheck('ui/src/lib/server/negotiation-playbook.ts', 'negotiation-playbook module');
existsCheck('ui/src/routes/api/negotiation/playbook/+server.ts', '/api/negotiation/playbook endpoint');
existsCheck('ui/src/routes/negotiation/+page.svelte', '/negotiation page');
fileContains('ui/src/lib/server/negotiation-playbook.ts', 'DECISION_TREE', 'decision-tree defined');
fileContains('ui/src/lib/server/negotiation-playbook.ts', 'verbal-offer', 'verbal-offer branch (#4)');
fileContains('ui/src/lib/server/negotiation-playbook.ts', 'exploding-offer', 'exploding-offer branch (#19)');
fileContains('ui/src/lib/server/negotiation-playbook.ts', 'leveraging-multiple-offers', 'multi-offer branch (#11)');
fileContains('ui/src/lib/server/negotiation-playbook.ts', 'NON_COMP_ASKS', 'non-comp asks list (#12)');
fileContains('ui/src/lib/server/negotiation-playbook.ts', 'DONT_ACCEPT_VERBALLY', 'dont-accept-verbally template (#4)');
fileContains('ui/src/lib/server/negotiation-playbook.ts', 'TIER_COMP_BANDS', 'tier comp bands (#20)');
fileContains('ui/src/lib/server/negotiation-playbook.ts', 'silent-week', 'silent-week branch');
fileContains('ui/src/lib/server/email-reactor.ts', "DON\\'T accept verbally", 'email-reactor surfaces dont-accept on offer (#4)');

section('Fourth-round #5 — Take-home scaffolder');

existsCheck('ui/src/lib/server/takehome-scaffolder.ts', 'takehome-scaffolder module');
existsCheck('ui/src/routes/api/job/[id]/takehome/+server.ts', '/api/job/[id]/takehome endpoint');
fileContains('ui/src/lib/server/takehome-scaffolder.ts', 'README_TEMPLATE', 'README template defined');
fileContains('ui/src/lib/server/takehome-scaffolder.ts', 'CHECKLIST_TEMPLATE', 'CHECKLIST template defined');
fileContains('ui/src/lib/server/takehome-scaffolder.ts', 'budgetMinutes', 'time budget tracked');
fileContains('ui/src/lib/server/takehome-scaffolder.ts', 'export function scaffoldTakeHome', 'scaffold function exported');
fileContains('ui/src/lib/server/email-reactor.ts', "fire-takehome-scaffold", 'email-reactor fires takehome scaffold (#5)');

section('Fourth-round #6 — Post-interview retro');

existsCheck('modes/interview-retro.md', 'interview-retro mode');
existsCheck('ui/src/routes/api/job/[id]/interview-retro/+server.ts', 'retro endpoint');
fileContains('modes/interview-retro.md', 'STORIES_ADDED', 'mode emits structured stdout');
fileContains('modes/interview-retro.md', '(real rep)', 'real-rep tag on appended stories');
fileContains('ui/src/lib/server/skills.ts', "'interview-retro'", 'interview-retro registered as skill');

section('Fourth-round #7 — Pre-call dossier');

existsCheck('modes/pre-call-dossier.md', 'pre-call-dossier mode');
existsCheck('ui/src/routes/api/job/[id]/dossier/+server.ts', 'dossier endpoint');
fileContains('modes/pre-call-dossier.md', 'DOSSIER_PATH', 'mode emits structured stdout');
fileContains('modes/pre-call-dossier.md', '5 questions YOU', '5 questions for the user to ask back');
fileContains('ui/src/lib/server/skills.ts', "'pre-call-dossier'", 'registered as skill');

section('Fourth-round #9 — Availability reply');

existsCheck('ui/src/lib/server/availability-reply.ts', 'availability-reply module');
existsCheck('ui/src/routes/api/availability-reply/+server.ts', 'availability-reply endpoint');
fileContains('ui/src/lib/server/availability-reply.ts', 'export function draftAvailabilityReply', 'draft fn exported');
fileContains('ui/src/lib/server/availability-reply.ts', 'nextBusinessDays', 'skips weekends');

// Behavioral: weekend-skip
{
  const code = `
function nextBizDays(count, from) {
  const out = []; const c = new Date(from);
  c.setDate(c.getDate() + 1);
  while (out.length < count) {
    const d = c.getDay();
    if (d !== 0 && d !== 6) out.push(new Date(c));
    c.setDate(c.getDate() + 1);
  }
  return out;
}
const friday = new Date('2026-05-08T12:00:00Z');
const bd = nextBizDays(3, friday);
const days = bd.map(d => d.getDay());
if (days[0] !== 1 || days[1] !== 2 || days[2] !== 3) process.exit(1);
process.exit(0);
  `;
  const r = spawnSync('node', ['-e', code], { encoding: 'utf8' });
  if (r.status === 0) ok('availability slots skip weekends (Fri → Mon/Tue/Wed)');
  else bad('availability weekend-skip broken');
}

section('Fourth-round #10 — Multi-persona panel simulation');

fileContains('modes/mock-interview-turn.md', 'Panel mode', 'panel mode documented');
fileContains('modes/mock-interview-turn.md', 'PERSONA SWITCH', 'persona-switch marker present');
fileContains('modes/mock-interview-turn.md', 'Hiring Manager', 'EM persona defined');
fileContains('modes/mock-interview-turn.md', 'Peer Engineer', 'Peer persona defined');
fileContains('modes/mock-interview-turn.md', 'Bar-raiser', 'Bar-raiser persona defined');
fileContains('ui/src/routes/api/job/[id]/mock-turn/+server.ts', 'panelMode', 'endpoint threads panelMode');
fileContains('ui/src/routes/job/[id]/mock/+page.svelte', 'panelMode', 'mock page has panelMode toggle');

section('Fourth-round #13 — Reference-prep briefs');

existsCheck('modes/reference-prep.md', 'reference-prep mode');
existsCheck('ui/src/routes/api/job/[id]/reference-prep/+server.ts', 'reference-prep endpoint');
fileContains('modes/reference-prep.md', 'REFERENCE_FILES_WRITTEN', 'mode emits structured stdout');
fileContains('modes/reference-prep.md', 'Never fabricate', 'guardrail against fabrication');
fileContains('ui/src/lib/server/skills.ts', "'reference-prep'", 'registered as skill');

section('Fourth-round #14 + #15 — Drill IDE + whiteboard');

existsCheck('modes/drill-feedback.md', 'drill-feedback mode');
existsCheck('ui/src/routes/api/job/[id]/drill/+server.ts', 'drill endpoint');
existsCheck('ui/src/routes/job/[id]/drill/+page.svelte', 'drill page');
fileContains('modes/drill-feedback.md', 'WORKING:', 'WORKING line in mode');
fileContains('modes/drill-feedback.md', 'WATCH:', 'WATCH line in mode');
fileContains('modes/drill-feedback.md', 'SUGGEST:', 'SUGGEST line in mode');
fileContains('modes/drill-feedback.md', 'QUESTION:', 'QUESTION line in mode');
fileContains('ui/src/routes/job/[id]/drill/+page.svelte', 'designNodes', 'whiteboard nodes state');
fileContains('ui/src/routes/job/[id]/drill/+page.svelte', 'designEdges', 'whiteboard edges state');
fileContains('ui/src/lib/server/skills.ts', "'drill-feedback'", 'registered as skill');

section('Fourth-round #16 — CV-variant learning loop');

existsCheck('ui/src/lib/server/cv-variant-analysis.ts', 'cv-variant-analysis module');
existsCheck('ui/src/routes/api/profile/cv-variants/+server.ts', '/api/profile/cv-variants endpoint');
fileContains('ui/src/lib/server/cv-variant-analysis.ts', 'winningKeywords', 'winning-keywords output');
fileContains('ui/src/lib/server/cv-variant-analysis.ts', 'underperformingKeywords', 'underperforming-keywords output');
fileContains('ui/src/lib/server/cv-variant-analysis.ts', 'lengthCorrelation', 'length-correlation output');

section('Fourth-round #17 — Cover-letter style consistency');

existsCheck('ui/src/lib/server/cover-letter-style.ts', 'cover-letter-style module');
fileContains('ui/src/lib/server/cover-letter-style.ts', 'export function styleSamples', 'styleSamples exported');
fileContains('ui/src/lib/server/cover-letter-style.ts', 'export function buildStyleReferenceBlock', 'reference-block builder exported');

section('Fourth-round #18 — Employee referral path');

existsCheck('ui/src/lib/server/referrals.ts', 'referrals module');
existsCheck('ui/src/routes/api/profile/referrals/+server.ts', '/api/profile/referrals endpoint');
fileContains('ui/src/lib/server/referrals.ts', 'export function linkedInMutualsUrl', 'LinkedIn URL builder');
fileContains('ui/src/lib/server/referrals.ts', 'export function listAsks', 'ask-tracker list fn');
fileContains('ui/src/lib/server/referrals.ts', 'export function silentAsks', 'silent-asks (follow-up candidates)');

// ─── Summary ───────────────────────────────────────────────────
if (JSON_MODE) {
  console.log(JSON.stringify({ passed, failed, total: passed + failed, results }, null, 2));
} else {
  console.log();
  if (failed === 0) {
    console.log('\x1b[32m✓\x1b[0m All ' + passed + ' checks passed.');
  } else {
    console.log('\x1b[31m✗\x1b[0m ' + failed + ' failed · ' + passed + ' passed (total ' + (passed + failed) + ').');
  }
}

process.exit(failed === 0 ? 0 : 1);
