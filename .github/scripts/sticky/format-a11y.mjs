#!/usr/bin/env node
/**
 * format-a11y.mjs -- emits the heron-pr-a11y sticky body from axe-core
 * accessibility scan output (one JSON per URL).
 *
 * Reads:
 *   [{ "url": "...", "violations": [{ "id": "...", "impact": "critical|serious|moderate|minor", "help": "...", "helpUrl": "...", "nodes": [...] }, ...] }, ...]
 *
 * Usage:
 *   node format-a11y.mjs <axe-results.json> [--out path]
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { collapsibleSection, table, verdictHeader } from './lib.mjs';

const { values: opts, positionals } = parseArgs({
  options: { out: { type: 'string' } },
  allowPositionals: true,
});

const inputPath = positionals[0];
if (!inputPath) {
  console.error('Usage: format-a11y.mjs <axe-results.json> [--out path]');
  process.exit(2);
}

const data = fs.existsSync(inputPath) ? JSON.parse(fs.readFileSync(inputPath, 'utf8')) : [];
const pages = Array.isArray(data) ? data : [data];

const allViolations = pages.flatMap((p) => (p.violations || []).map((v) => ({ url: p.url, ...v })));
const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
for (const v of allViolations) {
  const k = (v.impact || 'minor').toLowerCase();
  byImpact[k] = (byImpact[k] || 0) + 1;
}

const total = allViolations.length;
const verdict =
  pages.length === 0
    ? 'skip'
    : byImpact.critical + byImpact.serious > 0
      ? 'fail'
      : total > 0
        ? 'warn'
        : 'pass';
const title =
  pages.length === 0
    ? 'Accessibility: not scanned'
    : total === 0
      ? `Accessibility: no violations (${pages.length} page${pages.length === 1 ? '' : 's'})`
      : `Accessibility: ${total} violation${total === 1 ? '' : 's'} (${byImpact.critical} critical, ${byImpact.serious} serious)`;

const lines = [];
lines.push(verdictHeader(title, verdict));
lines.push('');

if (total === 0) {
  lines.push('_No axe-core violations found. Tests run against the preview URL._');
} else {
  lines.push(
    table(
      [{ label: 'Impact' }, { label: 'Count', align: 'right' }],
      Object.entries(byImpact)
        .filter(([, c]) => c > 0)
        .map(([impact, count]) => ({
          Impact: impact,
          Count: String(count),
        })),
    ),
  );
  lines.push('');

  // Per-violation list, grouped by rule id (axe.id) so a 10-node violation appears once.
  const byRule = new Map();
  for (const v of allViolations) {
    if (!byRule.has(v.id))
      byRule.set(v.id, {
        id: v.id,
        impact: v.impact,
        help: v.help,
        helpUrl: v.helpUrl,
        count: 0,
        urls: new Set(),
      });
    const r = byRule.get(v.id);
    r.count += (v.nodes || []).length || 1;
    if (v.url) r.urls.add(v.url);
  }
  const ruleList = [...byRule.values()].sort((a, b) => b.count - a.count);
  lines.push(
    collapsibleSection(
      `Violation details (${ruleList.length} rule${ruleList.length === 1 ? '' : 's'})`,
      ruleList
        .map((r) => {
          const head = `**${r.impact.toUpperCase()}: ${r.id}** (${r.count} occurrence${r.count === 1 ? '' : 's'} across ${r.urls.size} URL${r.urls.size === 1 ? '' : 's'})`;
          const help = `${r.help} -- [docs](${r.helpUrl})`;
          return `${head}\n${help}`;
        })
        .join('\n\n'),
    ),
  );
}

lines.push('');
lines.push(
  '<sub>axe-core run against the preview URL. Severity ladder: critical > serious > moderate > minor.</sub>',
);

const out = lines.join('\n') + '\n';
if (opts.out) {
  fs.writeFileSync(opts.out, out);
} else {
  process.stdout.write(out);
}
