#!/usr/bin/env node
/**
 * format-licenses.mjs -- emits the heron-pr-licenses sticky body.
 *
 * Reads license-checker-rseidelsohn JSON over the pnpm tree:
 *   {
 *     "package@version": { "licenses": "MIT", "publisher": "...", "repository": "...", "path": "..." },
 *     ...
 *   }
 *
 * Compares against a baseline run on main to highlight NEW deps with
 * copyleft / unknown licenses.
 *
 * Usage:
 *   node format-licenses.mjs <current.json> [baseline.json] [--out path]
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { collapsibleSection, table, verdictHeader } from './lib.mjs';

const { values: opts, positionals } = parseArgs({
  options: { out: { type: 'string' } },
  allowPositionals: true,
});

const currentPath = positionals[0];
const baselinePath = positionals[1];
if (!currentPath) {
  console.error('Usage: format-licenses.mjs <current.json> [baseline.json] [--out path]');
  process.exit(2);
}

const COPYLEFT = new Set([
  'GPL-2.0',
  'GPL-2.0-only',
  'GPL-2.0-or-later',
  'GPL-3.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'AGPL-1.0',
  'AGPL-3.0',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'LGPL-2.1',
  'LGPL-3.0',
  'CC-BY-SA-3.0',
  'CC-BY-SA-4.0',
  'EUPL-1.1',
  'EUPL-1.2',
  'OSL-3.0',
  'CPAL-1.0',
]);

function normalise(name) {
  // Normalise SPDX expressions like "MIT OR Apache-2.0" -> first license.
  return (name || '').split(/\s+OR\s+|\s*\/\s*|;/i)[0].trim();
}

function load(p) {
  if (!p || !fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const current = load(currentPath);
const baseline = load(baselinePath);

const currentKeys = new Set(Object.keys(current));
const baselineKeys = new Set(Object.keys(baseline));
const newDeps = [...currentKeys].filter((k) => !baselineKeys.has(k));
const removedDeps = [...baselineKeys].filter((k) => !currentKeys.has(k));

const newCopyleft = newDeps
  .map((k) => ({
    name: k,
    license: normalise(current[k].licenses),
    publisher: current[k].publisher || '',
  }))
  .filter((d) => COPYLEFT.has(d.license));

const newUnknown = newDeps
  .map((k) => ({ name: k, license: normalise(current[k].licenses) }))
  .filter((d) => !d.license || d.license.toUpperCase() === 'UNKNOWN' || d.license === 'UNLICENSED');

const verdict =
  newCopyleft.length === 0 && newUnknown.length === 0
    ? 'pass'
    : newCopyleft.length > 0
      ? 'fail'
      : 'warn';
const title =
  newCopyleft.length === 0 && newUnknown.length === 0
    ? 'Licenses: no copyleft or unknown licenses'
    : `Licenses: ${newCopyleft.length} copyleft, ${newUnknown.length} unknown introduced`;

const lines = [];
lines.push(verdictHeader(title, verdict));
lines.push('');

if (newCopyleft.length > 0) {
  lines.push('**🚨 New copyleft dependencies** (review for MIT-compatibility):');
  lines.push('');
  lines.push(
    table(
      [{ label: 'Package' }, { label: 'License' }, { label: 'Publisher' }],
      newCopyleft.map((d) => ({
        Package: `\`${d.name}\``,
        License: d.license,
        Publisher: d.publisher,
      })),
    ),
  );
  lines.push('');
}

if (newUnknown.length > 0) {
  lines.push('**⚠️ Unknown license** -- needs manual verification:');
  lines.push('');
  lines.push(
    table(
      [{ label: 'Package' }, { label: 'License declared' }],
      newUnknown.map((d) => ({
        Package: `\`${d.name}\``,
        'License declared': d.license || '(none)',
      })),
    ),
  );
  lines.push('');
}

if (newDeps.length > 0 || removedDeps.length > 0) {
  const newList = newDeps
    .slice(0, 50)
    .map((k) => `- \`${k}\` -- ${normalise(current[k].licenses)}`)
    .join('\n');
  const removedList = removedDeps
    .slice(0, 50)
    .map((k) => `- \`${k}\``)
    .join('\n');
  lines.push(
    collapsibleSection(
      `Full dependency diff (${newDeps.length} new, ${removedDeps.length} removed)`,
      `**Added (first 50):**\n${newList || '_none_'}\n\n**Removed (first 50):**\n${removedList || '_none_'}`,
    ),
  );
  lines.push('');
}

lines.push(
  '<sub>checked via license-checker-rseidelsohn against the pnpm tree. The MIT-compatibility allowlist is in `format-licenses.mjs::COPYLEFT`.</sub>',
);

const out = lines.join('\n') + '\n';
if (opts.out) {
  fs.writeFileSync(opts.out, out);
} else {
  process.stdout.write(out);
}
