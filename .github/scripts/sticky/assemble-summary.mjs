#!/usr/bin/env node
// assemble-summary.mjs -- render the unified Heron PR comment from a dir of
// per-domain markdown files (`<domain>.md`, each a format-*.mjs output whose
// first content line is `## <statusEmoji> <title>`). State is derived by
// matching the exact EMOJI strings from lib.mjs, so no formatter changes are
// needed. Pure helpers are exported + unit-tested; main() does the I/O.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EMOJI, statusEmoji } from './lib.mjs';

// Matrix + section order (top = most important), and display labels.
export const ORDER = Object.freeze([
  'quality',
  'coverage',
  'type-coverage',
  'a11y',
  'visual',
  'bundle',
  'perf',
  'api',
  'docs',
  'i18n',
  'licenses',
  'migrations',
  'reviewers',
]);
export const LABELS = Object.freeze({
  quality: 'Quality',
  coverage: 'Coverage',
  'type-coverage': 'Types',
  a11y: 'a11y',
  visual: 'Visual',
  bundle: 'Bundle',
  perf: 'Lighthouse',
  api: 'API',
  docs: 'Docs',
  i18n: 'i18n',
  licenses: 'Licenses',
  migrations: 'Migrations',
  reviewers: 'Reviewers',
});

export const DESC_MARKER_START = '<!-- CI-STATUS-MARKER-START -->';
export const DESC_MARKER_END = '<!-- CI-STATUS-MARKER-END -->';

const firstContentLine = (md) => ((md || '').split('\n').find((l) => l.trim().length) || '').trim();

/** Map a domain's markdown to a state via its verdictHeader emoji.
 *  Missing markdown -> pending. fail/cancelled -> fail; warn/neutral -> warn. */
export function deriveState(md) {
  if (!md || !md.trim()) return 'pending';
  const first = firstContentLine(md);
  if (first.includes(EMOJI.fail) || first.includes(EMOJI.cancelled)) return 'fail';
  if (first.includes(EMOJI.warn) || first.includes(EMOJI.neutral)) return 'warn';
  if (first.includes(EMOJI.skip)) return 'skip';
  if (first.includes(EMOJI.pass)) return 'pass';
  if (first.includes(EMOJI.queued)) return 'pending';
  return 'pending';
}

/** Only failing / warning sections open by default; the rest stay collapsed. */
export function isExpanded(state) {
  return state === 'fail' || state === 'warn';
}

/** The verdictHeader line with the leading `## ` stripped (keeps emoji+title). */
function summaryLine(md, domain, state) {
  const stripped = firstContentLine(md).replace(/^#{1,6}\s*/, '');
  return stripped || `${statusEmoji(state)} ${LABELS[domain] ?? domain}`;
}

/** Everything after the header line. */
function bodyAfterHeader(md) {
  const lines = (md || '').split('\n');
  const idx = lines.findIndex((l) => l.trim().length);
  return idx < 0
    ? ''
    : lines
        .slice(idx + 1)
        .join('\n')
        .trim();
}

/** One `<details>` block for a present domain. */
export function sectionFor(domain, md) {
  const state = deriveState(md);
  const open = isExpanded(state) ? ' open' : '';
  const body = bodyAfterHeader(md) || '_(no details)_';
  return `<details${open}><summary>${summaryLine(md, domain, state)}</summary>\n\n${body}\n\n</details>`;
}

/** Single-row status matrix: one `<emoji> <Label>` per domain, in ORDER. */
export function renderMatrix(entries) {
  return entries.map((e) => `${statusEmoji(e.state)} ${LABELS[e.domain] ?? e.domain}`).join(' · ');
}

/** The full unified comment body (matrix + sections for present domains). */
export function renderComment(entries) {
  const matrix = renderMatrix(entries);
  const sections = entries
    .filter((e) => e.md)
    .map((e) => sectionFor(e.domain, e.md))
    .join('\n\n');
  const parts = ['## 🐦 Heron PR report', '', matrix];
  if (sections) parts.push('', sections);
  return `${parts.join('\n')}\n`;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The compact CI block for the PR description. */
export function renderDescriptionBlock(entries) {
  return `${DESC_MARKER_START}\n🚦 **CI:** ${renderMatrix(entries)}\n${DESC_MARKER_END}`;
}

/** Replace (or append) the CI block inside an existing PR description body. */
export function replaceDescriptionBlock(descBody, entries) {
  const block = renderDescriptionBlock(entries);
  const re = new RegExp(`${escapeRe(DESC_MARKER_START)}[\\s\\S]*?${escapeRe(DESC_MARKER_END)}`);
  const body = descBody || '';
  return re.test(body) ? body.replace(re, block) : `${body.trimEnd()}\n\n${block}\n`;
}

/** Build entries (in ORDER) from a directory of `<domain>.md` files. */
export function buildEntries(dir) {
  return ORDER.map((domain) => {
    const p = join(dir, `${domain}.md`);
    const md = existsSync(p) ? readFileSync(p, 'utf8') : null;
    return { domain, md, state: deriveState(md) };
  });
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main() {
  const dir = arg('--dir') ?? '.';
  const out = arg('--out');
  const descIn = arg('--desc-in');
  const descOut = arg('--desc-out');
  const entries = buildEntries(dir);

  if (out) writeFileSync(out, renderComment(entries));
  else process.stdout.write(renderComment(entries));

  if (descIn && descOut) {
    const current = existsSync(descIn) ? readFileSync(descIn, 'utf8') : '';
    writeFileSync(descOut, replaceDescriptionBlock(current, entries));
  }
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) main();
