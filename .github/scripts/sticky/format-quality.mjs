#!/usr/bin/env node
/**
 * format-quality.mjs -- aggregate lint/format/typecheck outcomes from a
 * Tests workflow_run into the `heron-pr-quality` sticky.
 *
 * Reads a JSON dump of `gh api /repos/.../actions/runs/{id}/jobs` and
 * formats a per-tool table. Each row: tool / status emoji / duration /
 * link to the failing log line on failure.
 *
 * When `--logs-dir <path>` is provided, additionally reads the per-job
 * raw log files (one per FAILED job, named `<job-id>.txt`) and counts
 * error markers per known linter inside each failed step. The result
 * is an "errors detected" column in the failure-details collapsible
 * + a structured per-tool aggregate at the bottom of the comment.
 *
 * Why aggregate at the JOB level rather than re-run linters here:
 * the Tests workflow already runs them (in the `format` job which calls
 * biome / prettier / svelte-check / tsgo / oxlint / swiftlint /
 * swiftformat / yamllint / taplo / ruff / actionlint / shellcheck).
 * Re-running would double CI cost.
 *
 * Usage:
 *   node format-quality.mjs <jobs.json> [--server-url URL] [--repo R] [--logs-dir DIR] [--out path]
 *
 * jobs.json is the response body of `gh api /repos/{R}/actions/runs/{id}/jobs`.
 */

import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { statusEmoji, humanDuration, table, verdictHeader, collapsibleSection } from './lib.mjs';

const { values: opts, positionals } = parseArgs({
  options: {
    out: { type: 'string' },
    'server-url': { type: 'string', default: 'https://github.com' },
    repo: { type: 'string' },
    'logs-dir': { type: 'string' },
  },
  allowPositionals: true,
});

const jobsPath = positionals[0];
if (!jobsPath) {
  console.error('Usage: format-quality.mjs <jobs.json> [--server-url URL] [--repo R] [--out path]');
  process.exit(2);
}

const payload = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
const jobs = payload.jobs || [];
const REPO = opts.repo || process.env.GITHUB_REPOSITORY || '';
const SERVER = opts['server-url'] || 'https://github.com';

// Job names we treat as quality-checks. Keyword match -- robust to
// renames as long as the canonical word stays.
const QUALITY_KEYWORDS = [
  'lint',
  'format',
  'typecheck',
  'swiftlint',
  'ktlint',
  'ruff',
  'shellcheck',
  'actionlint',
  'workflow',
  'codeowners',
  'required-check',
  'pin',
  'scorecard',
  'zizmor',
  'codeql',
  'dependency',
  'secret',
  'audit',
  'trufflehog',
  'csp',
];

function isQualityJob(name) {
  const lower = (name || '').toLowerCase();
  return QUALITY_KEYWORDS.some((kw) => lower.includes(kw));
}

// Filter + dedup by name. The Tests workflow has separate `Lint + format`
// + `TS -- typecheck + Vitest + coverage` jobs; both count.
const qualityJobs = jobs.filter((j) => isQualityJob(j.name) && j.conclusion);

// Sort by status (failures first) then by name.
qualityJobs.sort((a, b) => {
  const failedA = a.conclusion === 'failure' ? 0 : 1;
  const failedB = b.conclusion === 'failure' ? 0 : 1;
  if (failedA !== failedB) return failedA - failedB;
  return (a.name || '').localeCompare(b.name || '');
});

// Shorten the displayed job name (drop the parenthetical language list)
// so it doesn't char-wrap on mobile. This is display-only -- the real
// job name (a required-check context) is untouched.
const shortName = (n) => (n || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
const rows = qualityJobs.map((j) => {
  const duration =
    j.started_at && j.completed_at
      ? new Date(j.completed_at).getTime() - new Date(j.started_at).getTime()
      : 0;
  const jobUrl =
    j.html_url || (REPO ? `${SERVER}/${REPO}/actions/runs/${j.run_id}/job/${j.id}` : '#');
  return {
    Status: statusEmoji(j.conclusion),
    Check: `[${shortName(j.name)}](${jobUrl})`,
    Time: humanDuration(duration),
  };
});

const failures = qualityJobs.filter((j) => j.conclusion === 'failure');
const verdict = failures.length === 0 ? 'pass' : 'fail';
const verdictText =
  failures.length === 0
    ? `Code quality: all checks pass`
    : `Code quality: ${failures.length} failing check${failures.length === 1 ? '' : 's'}`;

const lines = [];
lines.push(verdictHeader(verdictText, verdict));
lines.push('');

if (qualityJobs.length === 0) {
  lines.push(
    '_No quality-related jobs found in the source workflow run. Update format-quality.mjs::QUALITY_KEYWORDS if a new lint job needs to be tracked._',
  );
} else {
  lines.push(
    table(
      [{ label: 'Status', align: 'center' }, { label: 'Check' }, { label: 'Time', align: 'right' }],
      rows,
    ),
  );
}

// Error-marker patterns per linter for the structured per-tool count.
// Each entry: { name, re } where `re` is a regex tested against each
// log line. The first match wins per line (lines are not double-counted).
// Patterns are ordered most-specific-first so e.g. `error TS####` is
// attributed to tsgo rather than the generic `error` fallback.
const TOOL_PATTERNS = [
  { name: 'tsgo', re: /error TS\d+:/i },
  { name: 'svelte-check', re: /^Error: |svelte-check found \d+ error/m },
  { name: 'biome', re: /^✖|biome.*?\b(error|warning)\b/i },
  { name: 'prettier', re: /^\[error\]|prettier/i },
  { name: 'oxlint', re: /^error: .*oxlint/i },
  { name: 'shellcheck', re: /SC\d{4}:/ },
  { name: 'actionlint', re: /\.ya?ml:\d+:\d+: .* \[[a-z-]+\]/ },
  { name: 'swiftlint', re: /warning: .* \([a-z_]+\)|error: .* \([a-z_]+\)/ },
  { name: 'swiftformat', re: /^[/\\].*\.swift:\d+:\d+: warning: SwiftFormat/ },
  { name: 'yamllint', re: /\.ya?ml:\d+:\d+: \[(error|warning)\]/ },
  { name: 'taplo', re: /the file is not properly formatted/i },
  { name: 'ruff', re: /^[^:]+:\d+:\d+: [A-Z]\d+/ },
  { name: 'ktlint', re: /\.kt:\d+:\d+: [A-Za-z]/ },
  { name: 'github-actions', re: /^##\[error\]/ },
];

/** Parse a single job's log for per-tool error counts.
 *  Returns Map<tool-name, count>. Empty map when no log dir is set. */
function parseLogForToolCounts(jobId) {
  if (!opts['logs-dir']) return new Map();
  const logPath = `${opts['logs-dir']}/${jobId}.txt`;
  let raw;
  try {
    raw = fs.readFileSync(logPath, 'utf8');
  } catch {
    return new Map();
  }
  const counts = new Map();
  for (const line of raw.split('\n')) {
    for (const pat of TOOL_PATTERNS) {
      if (pat.re.test(line)) {
        counts.set(pat.name, (counts.get(pat.name) || 0) + 1);
        break; // first matching tool wins; no double-counting
      }
    }
  }
  return counts;
}

// Failure details -- per failed job, list its failed STEPS (the
// granular thing that broke). When `--logs-dir` is set we also fold
// in per-tool error counts parsed from the log.
if (failures.length > 0) {
  const detail = failures
    .map((j) => {
      const failedSteps = (j.steps || []).filter((s) => s.conclusion === 'failure');
      const stepList = failedSteps.length
        ? failedSteps.map((s) => `  - ${s.name} (step #${s.number})`).join('\n')
        : '  - (no granular step info)';
      const toolCounts = parseLogForToolCounts(j.id);
      const toolLine =
        toolCounts.size > 0
          ? '\n  Detected error markers: ' +
            [...toolCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([n, c]) => `**${n}** (${c})`)
              .join(', ')
          : '';
      return `**${j.name}**\n${stepList}${toolLine}`;
    })
    .join('\n\n');
  lines.push('');
  lines.push(
    collapsibleSection(
      `Failure details (${failures.length} job${failures.length === 1 ? '' : 's'})`,
      detail,
    ),
  );

  // Repo-wide structured per-tool aggregate (only when logs are present).
  if (opts['logs-dir']) {
    const total = new Map();
    for (const j of failures) {
      const counts = parseLogForToolCounts(j.id);
      for (const [tool, n] of counts) {
        total.set(tool, (total.get(tool) || 0) + n);
      }
    }
    if (total.size > 0) {
      const aggRows = [...total.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([tool, count]) => ({ Tool: `\`${tool}\``, 'Errors detected': String(count) }));
      lines.push('');
      lines.push('**Per-tool error counts** (parsed from job logs):');
      lines.push('');
      lines.push(table([{ label: 'Tool' }, { label: 'Errors detected', align: 'right' }], aggRows));
    }
  }
}

lines.push('');
lines.push(
  opts['logs-dir']
    ? '<sub>From the Tests run: pass/fail per job, with error markers parsed from failing logs.</sub>'
    : '<sub>From the Tests run: pass/fail per job.</sub>',
);

const out = lines.join('\n') + '\n';
if (opts.out) {
  fs.writeFileSync(opts.out, out);
  console.error(`Wrote ${out.length} bytes to ${opts.out}`);
} else {
  process.stdout.write(out);
}
