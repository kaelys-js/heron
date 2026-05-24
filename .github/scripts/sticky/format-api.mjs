#!/usr/bin/env node
/**
 * format-api.mjs -- emits the heron-pr-api sticky body from oasdiff
 * output between two OpenAPI specs.
 *
 * Reads oasdiff JSON: { breaking: [...], "non-breaking": [...] } or
 * the changelog format with severity field.
 *
 * Usage:
 *   node format-api.mjs <oasdiff.json> [--out path]
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
  console.error('Usage: format-api.mjs <oasdiff.json> [--out path]');
  process.exit(2);
}

const data = fs.existsSync(inputPath) ? JSON.parse(fs.readFileSync(inputPath, 'utf8')) : {};

// oasdiff has multiple output shapes. Normalise to one:
//   { breaking: [{ description, operation, source, ... }], nonBreaking: [...] }
function normalise(d) {
  if (Array.isArray(d)) {
    return {
      breaking: d.filter((x) => (x.severity || x.level || '').toUpperCase() === 'BREAKING'),
      nonBreaking: d.filter((x) => (x.severity || x.level || '').toUpperCase() !== 'BREAKING'),
    };
  }
  return {
    breaking: d.breaking || d.Breaking || [],
    nonBreaking: d['non-breaking'] || d.nonBreaking || d.NonBreaking || [],
  };
}

const { breaking, nonBreaking } = normalise(data);

const total = breaking.length + nonBreaking.length;
const verdict = breaking.length > 0 ? 'fail' : total > 0 ? 'warn' : 'pass';
const title =
  total === 0
    ? 'API: no changes'
    : breaking.length > 0
      ? `API: ${breaking.length} BREAKING + ${nonBreaking.length} non-breaking change${nonBreaking.length === 1 ? '' : 's'}`
      : `API: ${nonBreaking.length} non-breaking change${nonBreaking.length === 1 ? '' : 's'}`;

const lines = [];
lines.push(verdictHeader(title, verdict));
lines.push('');

if (total === 0) {
  lines.push("_No OpenAPI diff. Routes under `ui/src/routes/api/**` haven't changed in this PR._");
} else {
  if (breaking.length > 0) {
    lines.push('**Breaking changes** -- consumers will need migration:');
    lines.push('');
    lines.push(
      table(
        [{ label: 'Operation' }, { label: 'Change' }],
        breaking.slice(0, 30).map((c) => ({
          Operation: `\`${c.operation || c.path || '?'}\``,
          Change: c.description || c.text || '?',
        })),
      ),
    );
    lines.push('');
  }
  if (nonBreaking.length > 0) {
    const list = nonBreaking
      .slice(0, 30)
      .map((c) => `- \`${c.operation || c.path || '?'}\`: ${c.description || c.text || '?'}`)
      .join('\n');
    lines.push(collapsibleSection(`Non-breaking changes (${nonBreaking.length})`, list));
    lines.push('');
  }
}

lines.push(
  '<sub>oasdiff against the base-branch OpenAPI fragment. Breaking-change rules: removed endpoint, required parameter added, response field removed, type tightened.</sub>',
);

const out = lines.join('\n') + '\n';
if (opts.out) {
  fs.writeFileSync(opts.out, out);
} else {
  process.stdout.write(out);
}
