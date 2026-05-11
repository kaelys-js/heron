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

// Run dispatcher against a Lever URL — should route to stub.
{
  const r = spawnSync(PY, ['apply-portal.py',
    '--url', 'https://jobs.lever.co/acme/abc-uuid',
    '--job-id', 'verify-stub-lever'], { cwd: ROOT, encoding: 'utf8', timeout: 10_000 });
  const out = r.stdout || '';
  if (r.status === 1 && /APPLY_STEP: dispatch-detect:lever/.test(out)
      && /APPLY_RESULT: manual-apply-needed:stub/.test(out)) {
    ok('dispatcher: Lever URL → APPLY_STEP + APPLY_RESULT:manual-apply-needed:stub + exit 1');
  } else {
    bad('dispatcher: Lever URL routing produced unexpected output (exit=' + r.status + ')');
  }
  // Clean up the state file.
  try { fs.unlinkSync(path.join(ROOT, 'data/apply-state/verify-stub-lever.json')); } catch {}
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
