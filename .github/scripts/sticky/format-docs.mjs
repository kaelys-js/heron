#!/usr/bin/env node
/**
 * format-docs.mjs -- emits the heron-pr-docs sticky body aggregating
 * cspell + remark-lint output (markdown spell/lint).
 *
 * Inputs:
 *   --cspell <json>    cspell --reporter=json output (array of issues)
 *   --remark <json>    remark-cli output (vfile.messages array)
 *
 * Both optional; missing => excluded from totals.
 *
 * Usage:
 *   node format-docs.mjs --cspell=cspell.json --remark=remark.json [--out path]
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { collapsibleSection, table, verdictHeader } from './lib.mjs';

const { values: opts } = parseArgs({
  options: {
    cspell: { type: 'string' },
    remark: { type: 'string' },
    out: { type: 'string' },
  },
});

function readJson(p) {
  if (!p || !fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const cspell = readJson(opts.cspell) || [];
const remark = readJson(opts.remark) || [];

// cspell shape: [{ text, uri, row, col, ... }]
const spellIssues = (Array.isArray(cspell) ? cspell : cspell.issues || []).map((i) => ({
  file: i.uri || i.file,
  line: i.row || i.line,
  text: i.text || i.word,
}));

// remark shape: array of vfile messages [{ file, line, column, ruleId, reason }]
const remarkIssues = (Array.isArray(remark) ? remark : []).flatMap((vf) =>
  (vf.messages || []).map((m) => ({
    file: vf.path || vf.history?.[0] || '?',
    line: m.line,
    rule: m.ruleId,
    reason: m.reason,
  })),
);

const total = spellIssues.length + remarkIssues.length;
const verdict = total === 0 ? 'pass' : total < 20 ? 'warn' : 'fail';
const title =
  total === 0
    ? 'Docs: no spelling or markdown issues'
    : `Docs: ${spellIssues.length} spelling + ${remarkIssues.length} markdown issue${remarkIssues.length === 1 ? '' : 's'}`;

const lines = [];
lines.push(verdictHeader(title, verdict));
lines.push('');

if (total === 0) {
  lines.push('_No spelling or markdown-lint issues found in changed docs._');
} else {
  lines.push(
    table(
      [{ label: 'Source' }, { label: 'Issues', align: 'right' }],
      [
        { Source: '`cspell`', Issues: String(spellIssues.length) },
        { Source: '`remark-lint`', Issues: String(remarkIssues.length) },
      ],
    ),
  );
  lines.push('');

  if (spellIssues.length > 0) {
    const list = spellIssues
      .slice(0, 20)
      .map((i) => `- \`${i.file}:${i.line}\` -- unknown word: **${i.text}**`)
      .join('\n');
    lines.push(collapsibleSection(`Top 20 spelling issues (of ${spellIssues.length})`, list));
    lines.push('');
  }
  if (remarkIssues.length > 0) {
    const list = remarkIssues
      .slice(0, 20)
      .map((i) => `- \`${i.file}:${i.line}\` (${i.rule}) -- ${i.reason}`)
      .join('\n');
    lines.push(collapsibleSection(`Top 20 markdown-lint issues (of ${remarkIssues.length})`, list));
    lines.push('');
  }
}

lines.push('<sub>cspell + remark-lint, run against the markdown files touched in this PR.</sub>');

const out = lines.join('\n') + '\n';
if (opts.out) {
  fs.writeFileSync(opts.out, out);
} else {
  process.stdout.write(out);
}
