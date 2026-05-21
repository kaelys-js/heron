#!/usr/bin/env node
/**
 * format-visual.mjs -- emits the heron-pr-visual sticky body from
 * Lost Pixel's output (.lostpixel/output.json or similar).
 *
 * Lost Pixel shape (simplified):
 *   {
 *     "addedShots":   [{ "name": "...", "url": "..." }, ...],
 *     "removedShots": [{ ... }],
 *     "differenceShots": [{ "name": "...", "url": "...", "diffPercent": 0.034 }, ...]
 *   }
 *
 * Usage:
 *   node format-visual.mjs <lostpixel-output.json> [--diff-base-url URL] [--out path]
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { collapsibleSection, table, verdictHeader } from './lib.mjs';

const { values: opts, positionals } = parseArgs({
  options: {
    out: { type: 'string' },
    'diff-base-url': { type: 'string', default: '' },
  },
  allowPositionals: true,
});

const inputPath = positionals[0];
if (!inputPath) {
  console.error(
    'Usage: format-visual.mjs <lostpixel-output.json> [--diff-base-url URL] [--out path]',
  );
  process.exit(2);
}

const data = fs.existsSync(inputPath) ? JSON.parse(fs.readFileSync(inputPath, 'utf8')) : {};
const added = data.addedShots || [];
const removed = data.removedShots || [];
const diffs = data.differenceShots || [];

const total = added.length + removed.length + diffs.length;
const verdict = total === 0 ? 'pass' : diffs.length > 0 ? 'warn' : 'neutral';
const title =
  total === 0
    ? 'Visual regression: no changes'
    : `Visual regression: ${total} change${total === 1 ? '' : 's'} (${diffs.length} diff, ${added.length} new, ${removed.length} removed)`;

const lines = [];
lines.push(verdictHeader(title, verdict));
lines.push('');

if (total === 0) {
  lines.push('_No visual changes detected. All snapshots match the baseline._');
} else {
  if (diffs.length > 0) {
    lines.push('**Changed snapshots**');
    lines.push('');
    lines.push(
      table(
        [{ label: 'Name' }, { label: 'Diff %', align: 'right' }],
        diffs.map((d) => ({
          Name:
            opts['diff-base-url'] && d.url
              ? `[\`${d.name}\`](${opts['diff-base-url']}/${d.url})`
              : `\`${d.name}\``,
          'Diff %':
            typeof d.diffPercent === 'number' ? `${(d.diffPercent * 100).toFixed(2)}%` : '--',
        })),
      ),
    );
    lines.push('');
  }

  if (added.length > 0) {
    const list = added.map((s) => `- \`${s.name}\``).join('\n');
    lines.push(
      collapsibleSection(`${added.length} new snapshot${added.length === 1 ? '' : 's'}`, list),
    );
    lines.push('');
  }

  if (removed.length > 0) {
    const list = removed.map((s) => `- \`${s.name}\``).join('\n');
    lines.push(
      collapsibleSection(
        `${removed.length} removed snapshot${removed.length === 1 ? '' : 's'}`,
        list,
      ),
    );
    lines.push('');
  }

  lines.push(
    '> :information_source: To accept the new baseline: re-run lost-pixel with `recordSnapshots: true` or commit the new images.',
  );
}

lines.push('');
lines.push('<sub>Lost Pixel output. Click a snapshot name to open the diff image.</sub>');

const out = lines.join('\n') + '\n';
if (opts.out) {
  fs.writeFileSync(opts.out, out);
} else {
  process.stdout.write(out);
}
