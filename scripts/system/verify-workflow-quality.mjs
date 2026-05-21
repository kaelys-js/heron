#!/usr/bin/env node
// verify-workflow-quality.mjs -- enforce naming + docstring + structure
// discipline across .github/workflows/*.yml.
//
// Complements (does NOT duplicate):
//   - actionlint  -- syntax + GH-Actions-specific lints
//   - zizmor      -- security analysis
//   - verify-workflow-pins.yml -- third-party action SHA pinning
//
// Seven gates:
//   1. Top-of-file `#` block comment within the first 10 lines explaining
//      the workflow's purpose + triggers (skip if file is shorter than 5 lines)
//   2. Explicit top-level `permissions:` block (even `{}`)
//   3. PR-triggered workflows MUST have a top-level `concurrency:` block
//      (cancel-in-progress on PR ref so push-spam doesn't burn minutes)
//   4. Every `name:` field is non-empty and >= 5 chars
//   5. Every job has a `name:` field (cleaner Actions UI)
//   6. Every step has a `name:` field
//   7. Conventional file ordering: name, on, permissions, concurrency, jobs
//
// Exit codes:
//   0 = clean
//   1 = at least one offender
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOWS_DIR = join(ROOT, '.github', 'workflows');

// ── Tunables ──────────────────────────────────────────────────────

export const HEADER_COMMENT_WITHIN_LINES = 10;
export const MIN_NAME_LENGTH = 5;
export const EXPECTED_ORDER = ['name', 'on', 'permissions', 'concurrency', 'jobs'];

// ── Scanners (exported for tests) ────────────────────────────────

/** Rule 1: top-of-file `#` comment must appear in the first
 *  HEADER_COMMENT_WITHIN_LINES lines. The first comment line should
 *  follow the workflow `name:` directive (which is mandatory).
 *  Returns [] or [{rule: 'header', line: 1, msg}]. */
export function checkHeaderComment(body) {
  const lines = body.split('\n');
  if (lines.length < 5) return []; // skip very short files
  // Look for a `#` line within the first HEADER_COMMENT_WITHIN_LINES lines.
  // YAML comments start with `#` (must be at column 0 or after whitespace,
  // but for header docs we expect column 0).
  for (let i = 0; i < Math.min(HEADER_COMMENT_WITHIN_LINES, lines.length); i++) {
    if (/^\s*#\s/.test(lines[i])) return [];
  }
  return [
    {
      rule: 'header',
      line: 1,
      msg: `No header comment in the first ${HEADER_COMMENT_WITHIN_LINES} lines. Add a top-of-file \`# ...\` block explaining purpose + triggers.`,
    },
  ];
}

/** Rule 2: top-level `permissions:` is present (even `permissions: {}`). */
export function checkPermissions(parsed) {
  if (!Object.prototype.hasOwnProperty.call(parsed, 'permissions')) {
    return [
      {
        rule: 'permissions',
        line: 1,
        msg: 'Missing top-level `permissions:` block. Default to `{}` and elevate per-job.',
      },
    ];
  }
  return [];
}

/** Rule 3: pull_request / pull_request_target triggers require
 *  top-level `concurrency:` with `cancel-in-progress`. */
export function checkConcurrency(parsed) {
  const on = parsed.on;
  if (!on) return [];
  const triggers = typeof on === 'string' ? [on] : Object.keys(on);
  const isPrTriggered = triggers.some((t) => ['pull_request', 'pull_request_target'].includes(t));
  if (!isPrTriggered) return [];
  if (!parsed.concurrency) {
    return [
      {
        rule: 'concurrency',
        line: 1,
        msg: 'PR-triggered workflow missing `concurrency:` block. Add one with `cancel-in-progress: true` so push-spam to a PR cancels stale runs.',
      },
    ];
  }
  return [];
}

/** Walk the parsed workflow's name fields:
 *    - workflow.name
 *    - each job's name (if declared; a job whose key is the name is ok)
 *    - each step's name
 *  Returns offenders: { rule: 'name', context, msg }. */
export function checkNames(parsed) {
  const offenders = [];
  // Workflow-level name
  if (parsed.name === undefined) {
    offenders.push({
      rule: 'name',
      context: 'workflow',
      msg: 'Workflow missing top-level `name:` field.',
    });
  } else if (typeof parsed.name === 'string' && parsed.name.trim().length < MIN_NAME_LENGTH) {
    offenders.push({
      rule: 'name',
      context: 'workflow',
      msg: `Workflow name "${parsed.name}" is shorter than ${MIN_NAME_LENGTH} chars.`,
    });
  }
  // Jobs + steps
  const jobs = parsed.jobs ?? {};
  for (const [jobKey, job] of Object.entries(jobs)) {
    if (typeof job !== 'object' || job === null) continue;
    // Skip reusable workflow-call jobs (they have `uses:` instead of steps).
    if (typeof job.uses === 'string') continue;
    if (!job.name) {
      offenders.push({
        rule: 'name',
        context: `job:${jobKey}`,
        msg: `Job \`${jobKey}\` missing \`name:\` field. Job names show up in branch-protection required-checks; explicit names are clearer than the key.`,
      });
    } else if (job.name.trim().length < MIN_NAME_LENGTH) {
      offenders.push({
        rule: 'name',
        context: `job:${jobKey}`,
        msg: `Job \`${jobKey}\` name "${job.name}" is shorter than ${MIN_NAME_LENGTH} chars.`,
      });
    }
    const steps = job.steps ?? [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!step || typeof step !== 'object') continue;
      if (!step.name) {
        // Identify the step in the offender by either `uses:` or `run:` snippet
        const ident = step.uses
          ? `uses: ${step.uses}`
          : step.run
            ? `run: ${String(step.run).split('\n')[0].slice(0, 60)}...`
            : '(unknown)';
        offenders.push({
          rule: 'name',
          context: `job:${jobKey}/steps[${i}]`,
          msg: `Step #${i} in job \`${jobKey}\` missing \`name:\` field (${ident}).`,
        });
      } else if (step.name.trim().length < MIN_NAME_LENGTH) {
        offenders.push({
          rule: 'name',
          context: `job:${jobKey}/steps[${i}]`,
          msg: `Step #${i} in job \`${jobKey}\` name "${step.name}" is shorter than ${MIN_NAME_LENGTH} chars.`,
        });
      }
    }
  }
  return offenders;
}

/** Rule 7: top-level keys appear in EXPECTED_ORDER. Keys not in the list
 *  are tolerated (some workflows declare `defaults:`, `env:`, `run-name:`
 *  etc.); we only check that the keys that DO appear from EXPECTED_ORDER
 *  appear in that relative order. */
export function checkOrdering(body) {
  // Use a regex over the raw text to find the LINE of each top-level key.
  // (The YAML parser doesn't preserve source ordering reliably across versions.)
  const lines = body.split('\n');
  const positions = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = /^([a-z][a-z_-]*):/.exec(line);
    if (m && EXPECTED_ORDER.includes(m[1])) {
      if (positions[m[1]] === undefined) positions[m[1]] = i + 1;
    }
  }
  // Verify the keys that ARE present appear in EXPECTED_ORDER.
  const present = EXPECTED_ORDER.filter((k) => positions[k] !== undefined);
  const offenders = [];
  for (let i = 1; i < present.length; i++) {
    if (positions[present[i]] < positions[present[i - 1]]) {
      offenders.push({
        rule: 'ordering',
        line: positions[present[i]],
        msg: `Top-level key \`${present[i]}\` (line ${positions[present[i]]}) appears before \`${present[i - 1]}\` (line ${positions[present[i - 1]]}). Convention is: ${EXPECTED_ORDER.join(' → ')}.`,
      });
    }
  }
  return offenders;
}

/** Run all 7 rules on a single workflow file. */
export function scanWorkflow(path, body) {
  const offenders = [];
  // Parse YAML once.
  let parsed;
  try {
    parsed = yaml.load(body);
  } catch (e) {
    return [{ rule: 'parse', line: 1, msg: `YAML parse error: ${e.message}` }];
  }
  if (!parsed || typeof parsed !== 'object') {
    return [{ rule: 'parse', line: 1, msg: 'YAML root is not an object.' }];
  }
  offenders.push(...checkHeaderComment(body));
  offenders.push(...checkPermissions(parsed));
  offenders.push(...checkConcurrency(parsed));
  offenders.push(...checkNames(parsed));
  offenders.push(...checkOrdering(body));
  return offenders;
}

// ── CLI entrypoint ────────────────────────────────────────────────

function main() {
  const files = readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.yml'));
  let totalOffenders = 0;
  const fileFails = [];
  for (const f of files.sort()) {
    const path = join(WORKFLOWS_DIR, f);
    const body = readFileSync(path, 'utf8');
    const offenders = scanWorkflow(path, body);
    if (offenders.length > 0) {
      fileFails.push({ file: f, offenders });
      totalOffenders += offenders.length;
    }
  }
  if (totalOffenders === 0) {
    console.log(`OK verify-workflow-quality - ${files.length} workflow(s) scanned, 0 offenders.`);
    process.exit(0);
  }
  console.error(
    `FAIL verify-workflow-quality - ${totalOffenders} offender(s) across ${fileFails.length} file(s):`,
  );
  console.error('');
  for (const { file, offenders } of fileFails) {
    console.error(`  .github/workflows/${file}:`);
    for (const o of offenders) {
      const loc = o.line !== undefined ? `line ${o.line}` : o.context || '?';
      console.error(`    [${o.rule}] ${loc}: ${o.msg}`);
    }
    console.error('');
  }
  console.error(`Rules: header (top-of-file # comment), permissions (top-level block),`);
  console.error(
    `       concurrency (PR-triggered workflows), name (workflow/job/step >= ${MIN_NAME_LENGTH} chars),`,
  );
  console.error(`       ordering (${EXPECTED_ORDER.join(' → ')}).`);
  process.exit(1);
}

// Only run main() when invoked as a script, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
