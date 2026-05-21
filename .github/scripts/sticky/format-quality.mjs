#!/usr/bin/env node
/**
 * format-quality.mjs -- aggregate lint/format/typecheck outcomes from a
 * Tests workflow_run into the `heron-pr-quality` sticky.
 *
 * v1 design: reads a JSON dump of `gh api /repos/.../actions/runs/{id}/jobs`
 * and formats a per-tool table. Each row: tool / status emoji /
 * duration / link to the failing log line on failure.
 *
 * Why aggregate at the JOB level rather than re-run linters here:
 * the Tests workflow already runs them (in the `format` job which calls
 * biome / prettier / svelte-check / tsgo / oxlint / swiftlint /
 * swiftformat / yamllint / taplo / ruff / actionlint / shellcheck).
 * Re-running would double CI cost. The JOB outcome IS the signal --
 * if the job is red, one or more linters in it failed. The reviewer
 * clicks through to see the specific error.
 *
 * Future enhancement: have the format job upload structured per-tool
 * output as an artifact and parse it here so the sticky can show
 * "biome: 3 errors / svelte-check: 1 error" per tool rather than just
 * "Lint + format: failed".
 *
 * Usage:
 *   node format-quality.mjs <jobs.json> [--server-url URL] [--repo R] [--out path]
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

const rows = qualityJobs.map((j) => {
  const duration =
    j.started_at && j.completed_at
      ? new Date(j.completed_at).getTime() - new Date(j.started_at).getTime()
      : 0;
  const jobUrl =
    j.html_url || (REPO ? `${SERVER}/${REPO}/actions/runs/${j.run_id}/job/${j.id}` : '#');
  return {
    Job: `[\`${j.name}\`](${jobUrl})`,
    Status: `${statusEmoji(j.conclusion)} ${j.conclusion}`,
    Duration: humanDuration(duration),
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
    table([{ label: 'Job' }, { label: 'Status' }, { label: 'Duration', align: 'right' }], rows),
  );
}

// Failure details -- per failed job, list its failed STEPS (the
// granular thing that broke). `gh api .../runs/{id}/jobs` returns
// `steps` inline so we can render this without another API call.
if (failures.length > 0) {
  const detail = failures
    .map((j) => {
      const failedSteps = (j.steps || []).filter((s) => s.conclusion === 'failure');
      const stepList = failedSteps.length
        ? failedSteps.map((s) => `  - ${s.name} (step #${s.number})`).join('\n')
        : '  - (no granular step info)';
      return `**${j.name}**\n${stepList}`;
    })
    .join('\n\n');
  lines.push('');
  lines.push(
    collapsibleSection(
      `Failure details (${failures.length} job${failures.length === 1 ? '' : 's'})`,
      detail,
    ),
  );
}

lines.push('');
lines.push(
  '<sub>aggregated from the Tests workflow_run jobs. For per-tool error details, expand the failing job log.</sub>',
);

const out = lines.join('\n') + '\n';
if (opts.out) {
  fs.writeFileSync(opts.out, out);
  console.error(`Wrote ${out.length} bytes to ${opts.out}`);
} else {
  process.stdout.write(out);
}
