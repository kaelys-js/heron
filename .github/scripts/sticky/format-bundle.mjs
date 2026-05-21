#!/usr/bin/env node
/**
 * format-bundle.mjs -- emits the heron-pr-bundle sticky body.
 *
 * Auto-discovery: walks the working tree for known bundle-report files:
 *   - `.lighthouseci/manifest.json` (Lighthouse CI)
 *   - `bundle-stats.json` (rollup bundle analyzer)
 *   - `bundle-size.json` (size-limit-action output)
 *   - `dist/stats.json` (vite-bundle-visualizer)
 *
 * For v1 supports size-limit-action's output shape:
 *   [
 *     { "name": "App bundle", "passed": true, "size": 12345, "sizeLimit": 20000, "running": false, "loading": false },
 *     ...
 *   ]
 *
 * Usage:
 *   node format-bundle.mjs <current.json> [baseline.json] [--out path]
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { deltaCell, humanBytes, table, verdictHeader } from './lib.mjs';

const { values: opts, positionals } = parseArgs({
  options: { out: { type: 'string' } },
  allowPositionals: true,
});

const currentPath = positionals[0];
const baselinePath = positionals[1];
if (!currentPath) {
  console.error('Usage: format-bundle.mjs <current.json> [baseline.json] [--out path]');
  process.exit(2);
}

function readBundles(p) {
  if (!p || !fs.existsSync(p)) return [];
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  // size-limit-action shape: array of { name, size, sizeLimit, passed }
  if (Array.isArray(json)) return json;
  // size-limit binary output: { paths: [...] }
  if (json.paths) return json.paths;
  return [];
}

const current = readBundles(currentPath);
const baseline = readBundles(baselinePath);
const baselineByName = new Map(baseline.map((b) => [b.name, b]));

const rows = current.map((b) => {
  const base = baselineByName.get(b.name);
  const sizeBytes = b.size ?? b.gzipped ?? 0;
  const baseSize = base?.size ?? base?.gzipped;
  const delta =
    typeof baseSize === 'number'
      ? deltaCell(baseSize, sizeBytes, { threshold: 100, suffix: ' B', decimals: 0 })
      : '🆕';
  const passed = b.passed !== false; // default to pass if size-limit not in use
  return {
    Bundle: `\`${b.name}\``,
    Size: humanBytes(sizeBytes),
    Limit: b.sizeLimit ? humanBytes(b.sizeLimit) : '--',
    Δ: delta,
    Status: passed ? '✅' : '❌',
  };
});

const failures = current.filter((b) => b.passed === false);
const verdict = failures.length === 0 ? 'pass' : 'fail';
const title =
  failures.length === 0
    ? `Bundle size: ${current.length} chunk${current.length === 1 ? '' : 's'} within budget`
    : `Bundle size: ${failures.length} chunk${failures.length === 1 ? '' : 's'} over budget`;

const lines = [];
lines.push(verdictHeader(title, verdict));
lines.push('');
if (current.length === 0) {
  lines.push(
    '_No bundle-size report found. Drop a size-limit-action or compressed-size-action output JSON at the expected path._',
  );
} else {
  lines.push(
    table(
      [
        { label: 'Bundle' },
        { label: 'Size', align: 'right' },
        { label: 'Limit', align: 'right' },
        { label: 'Δ', align: 'right' },
        { label: 'Status', align: 'center' },
      ],
      rows,
    ),
  );
}
lines.push('');
lines.push(
  '<sub>compares against the previous main bundle baseline. The size shown is the brotli/gzipped size where the upstream tool emits one.</sub>',
);

const out = lines.join('\n') + '\n';
if (opts.out) {
  fs.writeFileSync(opts.out, out);
} else {
  process.stdout.write(out);
}
