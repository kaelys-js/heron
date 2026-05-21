#!/usr/bin/env node
/**
 * format-perf.mjs -- emits the heron-pr-perf sticky body.
 *
 * Consumes Lighthouse CI's manifest.json or a flattened JSON of scores:
 *   [{ "url": "...", "scores": { "performance": 0.95, "accessibility": 0.91, "bestPractices": 0.95, "seo": 0.92 } }, ...]
 *
 * Usage:
 *   node format-perf.mjs <current.json> [baseline.json] [--out path]
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { deltaCell, table, verdictHeader } from './lib.mjs';

const { values: opts, positionals } = parseArgs({
  options: { out: { type: 'string' } },
  allowPositionals: true,
});

const currentPath = positionals[0];
const baselinePath = positionals[1];
if (!currentPath) {
  console.error('Usage: format-perf.mjs <current.json> [baseline.json] [--out path]');
  process.exit(2);
}

function readScores(p) {
  if (!p || !fs.existsSync(p)) return [];
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  // Lighthouse CI manifest.json shape: [{ url, summary: { performance, accessibility, ... } }]
  if (Array.isArray(data)) {
    return data.map((d) => ({
      url: d.url || d.requestedUrl,
      scores: d.summary || d.scores || {},
    }));
  }
  return [];
}

const current = readScores(currentPath);
const baseline = readScores(baselinePath);
const baselineByUrl = new Map(baseline.map((b) => [b.url, b.scores]));

const METRICS = ['performance', 'accessibility', 'bestPractices', 'best-practices', 'seo'];

const rows = current.map((page) => {
  const b = baselineByUrl.get(page.url) || {};
  const c = page.scores || {};
  function fmt(key) {
    const v = c[key];
    if (typeof v !== 'number') return '--';
    const pct = (v * 100).toFixed(0);
    const baseV = b[key];
    if (typeof baseV !== 'number') return `${pct}%`;
    const delta = deltaCell(baseV * 100, v * 100, { threshold: 1, decimals: 0 });
    return `${pct}% ${delta}`;
  }
  return {
    URL: `\`${page.url}\``,
    Performance: fmt('performance'),
    A11y: fmt('accessibility'),
    'Best practices': fmt('best-practices') !== '--' ? fmt('best-practices') : fmt('bestPractices'),
    SEO: fmt('seo'),
  };
});

// Verdict: pass if ALL pages have performance >= 0.9; warn if any below.
const allGood = current.every((p) => (p.scores?.performance ?? 0) >= 0.9);
const verdict = current.length === 0 ? 'skip' : allGood ? 'pass' : 'warn';
const title =
  current.length === 0
    ? 'Performance: no Lighthouse data'
    : `Performance: ${current.length} page${current.length === 1 ? '' : 's'} measured`;

const lines = [];
lines.push(verdictHeader(title, verdict));
lines.push('');
if (current.length === 0) {
  lines.push('_No Lighthouse manifest found. Did the lighthouse.yml workflow finish?_');
} else {
  lines.push(
    table(
      [
        { label: 'URL' },
        { label: 'Performance', align: 'right' },
        { label: 'A11y', align: 'right' },
        { label: 'Best practices', align: 'right' },
        { label: 'SEO', align: 'right' },
      ],
      rows,
    ),
  );
}
lines.push('');
lines.push(
  '<sub>Lighthouse CI scores 0-100, delta vs the previous main baseline. Performance < 90% triggers a warn.</sub>',
);

const out = lines.join('\n') + '\n';
if (opts.out) {
  fs.writeFileSync(opts.out, out);
} else {
  process.stdout.write(out);
}
