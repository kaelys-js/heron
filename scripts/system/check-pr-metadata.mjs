#!/usr/bin/env node
/** Shared PR-metadata validator -- the single source of truth for the
 *  title / body / size / lockfile rules enforced by
 *  .github/workflows/pr-quality.yml. Both that workflow (server) and the
 *  lefthook `pr-preflight` pre-push hook (local) call this, so the local
 *  gate can't drift from CI: a title/body/size violation fails on `git
 *  push` instead of after a remote round-trip.
 *
 *  Each check is a pure function so the .test.mjs twin can pin every limit
 *  boundary. The CLI at the bottom dispatches a mode and reads inputs from
 *  flags or PR_* env vars (env is preferred for multi-line bodies).
 *
 *  Usage:
 *    node check-pr-metadata.mjs title-length   --title "..."
 *    node check-pr-metadata.mjs title-grammar  --title "..."
 *    node check-pr-metadata.mjs body           --title "..." --body "..."
 *    node check-pr-metadata.mjs size           --additions N --deletions N --labels a,b
 *    node check-pr-metadata.mjs lockfile       --dep-touch 1 --lock-changed 0
 *    node check-pr-metadata.mjs local          (title+grammar+body[+size]) -- for the hook
 */

// Conventional Commits types -- MUST match pr-quality.yml's
// action-semantic-pull-request `types:` list + release-please-config.json.
export const TYPES = [
  'feat',
  'fix',
  'chore',
  'docs',
  'refactor',
  'test',
  'ci',
  'build',
  'style',
  'perf',
  'revert',
];
// `<type>(scope)?!?: <subject>` with a lowercase subject -- mirrors the
// action's grammar + `subjectPattern: ^(?![A-Z]).+$`.
const TITLE_GRAMMAR = new RegExp(`^(${TYPES.join('|')})(\\([^)]+\\))?!?: (?![A-Z]).+$`);
const TITLE_MAX = 72;
const SUMMARY_MIN = 50;
const TEST_PLAN_MIN = 50;
const SECTION_MIN = 30;
const SIZE_MAX = 2000;
// Standard issue-closing keywords (case-insensitive) -- mirrors feat-needs-issue.
const ISSUE_RE = /\b(fix(es)?|close[sd]?|resolve[sd]?|refs?)\s+([a-z0-9._/-]+)?#[0-9]+/i;

export function stripComments(s) {
  return String(s ?? '').replace(/<!--[\s\S]*?-->/g, '');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Extract the lines of a `## <heading>` section, up to the next `## `
 *  heading (a `###` subheading does NOT terminate it). Mirrors the awk in
 *  pr-quality.yml. */
export function extractSection(body, heading) {
  const lines = stripComments(body).split('\n');
  const headingRe = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`);
  const terminatorRe = /^##\s/;
  const out = [];
  let inSection = false;
  for (const line of lines) {
    if (!inSection) {
      if (headingRe.test(line)) inSection = true;
      continue;
    }
    if (terminatorRe.test(line)) {
      inSection = false;
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function nonSpaceLen(s) {
  return String(s ?? '').replace(/\s/g, '').length;
}

export function checkTitleLength(title, limit = TITLE_MAX) {
  const len = String(title ?? '').length;
  return {
    ok: len <= limit,
    len,
    limit,
    message:
      len <= limit ? null : `PR title is ${len} chars, over the ${limit}-char budget. Trim it.`,
  };
}

export function checkTitleGrammar(title) {
  const t = String(title ?? '');
  const ok = TITLE_GRAMMAR.test(t);
  return {
    ok,
    message: ok
      ? null
      : `PR title "${t}" must be Conventional Commits with a lowercase subject, e.g. "feat(api): add retry helper".`,
  };
}

export function checkBodySections(body) {
  const summaryChars = nonSpaceLen(extractSection(body, 'Summary'));
  const testPlan = extractSection(body, 'Test plan');
  const testPlanChars = nonSpaceLen(testPlan);
  const checkedItems = (testPlan.match(/^\s*-\s+\[[xX]\]/gm) || []).length;
  const errors = [];
  if (summaryChars < SUMMARY_MIN)
    errors.push(`## Summary is ${summaryChars} chars (need >= ${SUMMARY_MIN}).`);
  if (testPlanChars < TEST_PLAN_MIN)
    errors.push(`## Test plan is ${testPlanChars} chars (need >= ${TEST_PLAN_MIN}).`);
  if (checkedItems < 1) errors.push('## Test plan has no completed checkbox (`- [x]`).');
  return { ok: errors.length === 0, summaryChars, testPlanChars, checkedItems, errors };
}

export function checkFeatIssue(title, body, labels = []) {
  if (!String(title ?? '').startsWith('feat')) return { ok: true, applicable: false };
  if (ISSUE_RE.test(String(body ?? ''))) return { ok: true, applicable: true };
  if (labels.includes('no-issue')) return { ok: true, applicable: true, bypassed: true };
  return {
    ok: false,
    applicable: true,
    message:
      'feat PR must reference an issue (Fixes/Closes/Resolves/Refs #N) or carry the `no-issue` label.',
  };
}

export function checkFeatMotivation(title, body) {
  if (!String(title ?? '').startsWith('feat')) return { ok: true, applicable: false };
  for (const h of ['Motivation', 'Why']) {
    if (nonSpaceLen(extractSection(body, h)) >= SECTION_MIN) return { ok: true, applicable: true };
  }
  return {
    ok: false,
    applicable: true,
    message: `feat PR needs a ## Motivation (or ## Why) section with >= ${SECTION_MIN} chars.`,
  };
}

export function checkBreakingBody(title, body) {
  if (!String(title ?? '').includes('!:')) return { ok: true, applicable: false };
  if (/^BREAKING[ -]CHANGE:/m.test(String(body ?? ''))) return { ok: true, applicable: true };
  return {
    ok: false,
    applicable: true,
    message: '<type>!: requires a `BREAKING CHANGE:` block in the body.',
  };
}

export function checkBreakingMigration(title, body) {
  if (!String(title ?? '').includes('!:')) return { ok: true, applicable: false };
  for (const h of ['Migration', 'Rollback plan', 'Upgrade']) {
    if (nonSpaceLen(extractSection(body, h)) >= SECTION_MIN) return { ok: true, applicable: true };
  }
  return {
    ok: false,
    applicable: true,
    message: `<type>!: needs a ## Migration (or ## Rollback plan / ## Upgrade) section with >= ${SECTION_MIN} chars.`,
  };
}

export function checkSize(additions, deletions, labels = [], limit = SIZE_MAX) {
  const total = Number(additions || 0) + Number(deletions || 0);
  if (total <= limit) return { ok: true, total, limit };
  if (labels.includes('oversize-ok')) return { ok: true, total, limit, bypassed: true };
  return {
    ok: false,
    total,
    limit,
    message: `PR is ${total} LOC, over the ${limit} budget. Split it, or add the \`oversize-ok\` label.`,
  };
}

export function checkLockfile(depTouch, lockChanged) {
  const ok = !(depTouch && !lockChanged);
  return {
    ok,
    message: ok
      ? null
      : 'A package.json dependency section changed but pnpm-lock.yaml did not. Run `pnpm install` + commit the lockfile.',
  };
}

// ── CLI ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        args[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) args[a.slice(2)] = 'true';
        else {
          args[a.slice(2)] = next;
          i += 1;
        }
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function truthy(v) {
  return v === '1' || v === 'true' || v === true;
}

function run(argv) {
  const args = parseArgs(argv);
  const mode = args._[0];
  const title = args.title ?? process.env.PR_TITLE ?? '';
  const body = args.body ?? process.env.PR_BODY ?? '';
  const labels = (args.labels ?? process.env.PR_LABELS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const additions = args.additions ?? process.env.PR_ADDITIONS ?? 0;
  const deletions = args.deletions ?? process.env.PR_DELETIONS ?? 0;

  const results = [];
  const add = (label, r) => results.push([label, r]);

  // Modes map 1:1 to the jobs in pr-quality.yml so each CI job can call the
  // matching mode; `local` runs the whole title+body suite for the hook.
  switch (mode) {
    case 'title-length':
      add('title length', checkTitleLength(title));
      break;
    case 'title-grammar':
      add('title grammar', checkTitleGrammar(title));
      break;
    case 'pr-description':
    case 'body-sections':
      add('Summary + Test plan', checkBodySections(body));
      break;
    case 'feat-issue':
      add('feat → issue', checkFeatIssue(title, body, labels));
      break;
    case 'feat-motivation':
      add('feat → Motivation', checkFeatMotivation(title, body));
      break;
    case 'breaking-body':
      add('breaking → BREAKING CHANGE', checkBreakingBody(title, body));
      break;
    case 'breaking-migration':
      add('breaking → Migration', checkBreakingMigration(title, body));
      break;
    case 'size':
      add('size budget', checkSize(additions, deletions, labels));
      break;
    case 'lockfile':
      add(
        'lockfile co-change',
        checkLockfile(truthy(args['dep-touch']), truthy(args['lock-changed'])),
      );
      break;
    case 'local':
    case 'all':
      add('title length', checkTitleLength(title));
      add('title grammar', checkTitleGrammar(title));
      add('Summary + Test plan', checkBodySections(body));
      add('feat → issue', checkFeatIssue(title, body, labels));
      add('feat → Motivation', checkFeatMotivation(title, body));
      add('breaking → BREAKING CHANGE', checkBreakingBody(title, body));
      add('breaking → Migration', checkBreakingMigration(title, body));
      if (args.additions !== undefined || process.env.PR_ADDITIONS)
        add('size budget', checkSize(additions, deletions, labels));
      break;
    default:
      console.error(
        `unknown mode "${mode}". Use one of: title-length title-grammar pr-description feat-issue feat-motivation breaking-body breaking-migration size lockfile local`,
      );
      process.exit(2);
  }

  const inCI = process.env.GITHUB_ACTIONS === 'true';
  let failed = 0;
  for (const [label, r] of results) {
    if (r.ok) {
      console.log(`  ✓ ${label}`);
    } else {
      failed += 1;
      const msgs = r.errors?.length ? r.errors : [r.message];
      console.error(`  ✗ ${label}`);
      for (const m of msgs) {
        console.error(`      ${m}`);
        if (inCI) console.log(`::error::${label}: ${m}`);
      }
    }
  }
  process.exit(failed > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2));
}
