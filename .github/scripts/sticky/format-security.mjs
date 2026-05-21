#!/usr/bin/env node
/**
 * format-security.mjs -- emits the heron-pr-security sticky body
 * aggregating CodeQL Sarif + Dependabot alerts + (optional) Trivy
 * filesystem scan.
 *
 * Inputs (all optional; missing => excluded from the table):
 *   --codeql <sarif-file>     Sarif 2.1.0 from CodeQL upload artifact
 *   --dependabot <api.json>   gh api /repos/{r}/dependabot/alerts output
 *   --trivy <trivy.json>      trivy fs --format json output
 *
 * Usage:
 *   node format-security.mjs --codeql=results.sarif --dependabot=alerts.json [--out path]
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { table, verdictHeader } from './lib.mjs';

const { values: opts } = parseArgs({
  options: {
    codeql: { type: 'string' },
    dependabot: { type: 'string' },
    trivy: { type: 'string' },
    out: { type: 'string' },
  },
});

function readJson(p) {
  if (!p || !fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function severityKey(s) {
  const lower = (s || '').toLowerCase();
  if (lower === 'critical') return 4;
  if (lower === 'high') return 3;
  if (lower === 'medium' || lower === 'moderate') return 2;
  if (lower === 'low') return 1;
  return 0;
}

// CodeQL Sarif -- count results by severity.
function summariseCodeql(sarif) {
  if (!sarif) return null;
  const counts = { critical: 0, high: 0, medium: 0, low: 0, note: 0 };
  for (const run of sarif.runs || []) {
    for (const result of run.results || []) {
      const sev = (
        result.properties?.['security-severity']
          ? bandFromScore(parseFloat(result.properties['security-severity']))
          : result.level || 'note'
      ).toLowerCase();
      counts[sev] = (counts[sev] || 0) + 1;
    }
  }
  return counts;
}
function bandFromScore(score) {
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  if (score >= 0.1) return 'low';
  return 'note';
}

// Dependabot -- count alerts by severity. Only OPEN alerts.
function summariseDependabot(alerts) {
  if (!alerts) return null;
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const a of alerts) {
    if (a.state !== 'open') continue;
    const sev = (
      a.security_vulnerability?.severity ||
      a.security_advisory?.severity ||
      'low'
    ).toLowerCase();
    counts[sev] = (counts[sev] || 0) + 1;
  }
  return counts;
}

// Trivy -- count vulns by severity from `Results[].Vulnerabilities[]`.
function summariseTrivy(trivy) {
  if (!trivy) return null;
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const r of trivy.Results || []) {
    for (const v of r.Vulnerabilities || []) {
      const sev = (v.Severity || 'low').toLowerCase();
      counts[sev] = (counts[sev] || 0) + 1;
    }
  }
  return counts;
}

const codeqlCounts = summariseCodeql(readJson(opts.codeql));
const dependabotCounts = summariseDependabot(readJson(opts.dependabot));
const trivyCounts = summariseTrivy(readJson(opts.trivy));

const sources = [
  { label: 'CodeQL', counts: codeqlCounts },
  { label: 'Dependabot', counts: dependabotCounts },
  { label: 'Trivy', counts: trivyCounts },
].filter((s) => s.counts);

const rows = sources.map((s) => ({
  Source: `\`${s.label}\``,
  '🔴 Critical': String(s.counts.critical ?? 0),
  '🟠 High': String(s.counts.high ?? 0),
  '🟡 Medium': String(s.counts.medium ?? 0),
  '🟢 Low': String(s.counts.low ?? 0),
}));

const totalSerious = sources.reduce(
  (s, src) => s + (src.counts.critical ?? 0) + (src.counts.high ?? 0),
  0,
);
const verdict = totalSerious === 0 ? 'pass' : 'fail';
const title =
  sources.length === 0
    ? 'Security: no scanners ran'
    : totalSerious === 0
      ? 'Security: no critical or high alerts'
      : `Security: ${totalSerious} critical/high alert${totalSerious === 1 ? '' : 's'}`;

const lines = [];
lines.push(verdictHeader(title, verdict));
lines.push('');
if (sources.length === 0) {
  lines.push(
    '_No security scan outputs provided. Pass at least one of `--codeql`, `--dependabot`, `--trivy`._',
  );
} else {
  lines.push(
    table(
      [
        { label: 'Source' },
        { label: '🔴 Critical', align: 'right' },
        { label: '🟠 High', align: 'right' },
        { label: '🟡 Medium', align: 'right' },
        { label: '🟢 Low', align: 'right' },
      ],
      rows,
    ),
  );
}
lines.push('');
lines.push(
  '<sub>aggregates CodeQL + Dependabot + Trivy. Click through to the [Security tab](https://github.com/kaelys-js/heron/security) for full details + remediation paths.</sub>',
);

const out = lines.join('\n') + '\n';
if (opts.out) {
  fs.writeFileSync(opts.out, out);
} else {
  process.stdout.write(out);
}
