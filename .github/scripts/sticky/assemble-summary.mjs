#!/usr/bin/env node
// assemble-summary.mjs -- render the unified Heron PR-checks comment from a
// dir of per-domain markdown files (`<domain>.md`, each a format-*.mjs
// output whose first content line is `## <statusEmoji> <title>`).
//
// Design: a GitHub-native rollup alert + a scannable Check/Result table for
// the checks that ran, a compact "Not reported / Pending" line for the rest,
// and collapsible detail only where there's a real breakdown. Failures are
// pulled into the alert + their detail auto-expanded. No per-row emoji.
//
// Pure helpers are exported + unit-tested; main() does the file I/O.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { EMOJI } from './lib.mjs';

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
  'type-coverage': 'Type coverage',
  a11y: 'Accessibility',
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
 *  Missing markdown -> pending; fail/cancelled -> fail; warn/neutral -> warn. */
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

/** Strip the leading `## `, the status emoji, and a `Label:`/`Label —` prefix
 *  off the verdictHeader so the table shows just the result. */
export function headlineOf(domain, md) {
  let h = firstContentLine(md).replace(/^#{1,6}\s*/, '');
  // drop the leading status-emoji token (emoji has no spaces)
  h = h.replace(/^\S+\s+/, '').trim();
  // drop a short leading "Prefix:" label (e.g. "Code quality:", "Bundle size:")
  h = h.replace(/^[^:|#]{1,40}:\s+/, '').trim();
  return h || (LABELS[domain] ?? domain);
}

/** Body after the header line. */
export function detailOf(md) {
  const lines = (md || '').split('\n');
  const idx = lines.findIndex((l) => l.trim().length);
  return idx < 0
    ? ''
    : lines
        .slice(idx + 1)
        .join('\n')
        .trim();
}

/** Only a body with a real breakdown (a table or a nested <details>) is worth
 *  a collapsible; one-line prose is already captured by the headline. */
export function hasBreakdown(detail) {
  if (!detail) return false;
  return /\n?\s*\|.*\|/.test(detail) || detail.includes('<details');
}

/** Adapter / contract shape: md -> { domain, status, headline, detail }. */
export function toSummary(domain, md) {
  return {
    domain,
    status: deriveState(md),
    headline: headlineOf(domain, md),
    detail: hasBreakdown(detailOf(md)) ? detailOf(md) : '',
  };
}

const labelList = (entries) => entries.map((e) => LABELS[e.domain] ?? e.domain).join(', ');

/** GitHub-native rollup alert: NOTE when all green, WARNING/CAUTION on issues. */
export function renderRollup(groups, meta = {}) {
  const { passed, attention, notReported, pending } = groups;
  const fails = attention.filter((e) => e.status === 'fail');
  const warns = attention.filter((e) => e.status === 'warn');
  const sha = meta.sha ? ` \`${String(meta.sha).slice(0, 7)}\`` : '';
  const counts = [];
  if (passed.length) counts.push(`${passed.length} passed`);
  if (fails.length) counts.push(`${fails.length} failed`);
  if (warns.length) counts.push(`${warns.length} warning${warns.length === 1 ? '' : 's'}`);
  if (notReported.length) counts.push(`${notReported.length} not reported`);
  if (pending.length) counts.push(`${pending.length} pending`);
  const kind = fails.length ? 'CAUTION' : warns.length ? 'WARNING' : 'NOTE';
  const lines = [`> [!${kind}]`, `> **Heron — PR checks**${sha} · ${counts.join(' · ')}`];
  if (fails.length) lines.push(`>`, `> **Failing:** ${labelList(fails)}`);
  if (warns.length) lines.push(`>`, `> **Needs a look:** ${labelList(warns)}`);
  return lines.join('\n');
}

/** Check / Result table for the checks that ran (passed + attention). */
export function renderTable(rows) {
  if (!rows.length) return '';
  const body = rows
    .map((e) => `| **${LABELS[e.domain] ?? e.domain}** | ${e.headline} |`)
    .join('\n');
  return `| Check | Result |\n|---|---|\n${body}`;
}

/** Compact one-liner for checks with no actionable detail. */
export function renderGroupsLine(notReported, pending) {
  const parts = [];
  if (notReported.length) parts.push(`**Not reported:** ${labelList(notReported)}`);
  if (pending.length) parts.push(`**Pending:** ${labelList(pending)}`);
  return parts.join(' · ');
}

/** Collapsible detail blocks; attention (fail/warn) auto-expanded. */
export function renderDetails(entries) {
  return entries
    .filter((e) => e.detail)
    .map((e) => {
      const open = e.status === 'fail' || e.status === 'warn' ? ' open' : '';
      return `<details${open}><summary>${LABELS[e.domain] ?? e.domain}</summary>\n\n${e.detail}\n\n</details>`;
    })
    .join('\n');
}

/** Group entries by how they should be presented. */
export function classify(entries) {
  const g = { passed: [], attention: [], notReported: [], pending: [] };
  for (const e of entries) {
    if (e.status === 'fail' || e.status === 'warn') g.attention.push(e);
    else if (e.status === 'pass') g.passed.push(e);
    else if (e.status === 'skip') g.notReported.push(e);
    else g.pending.push(e);
  }
  return g;
}

/** The full unified comment. */
export function renderComment(entries, meta = {}) {
  const g = classify(entries);
  const tableRows = [...g.attention, ...g.passed]; // attention first
  const parts = [renderRollup(g, meta), ''];
  const table = renderTable(tableRows);
  if (table) parts.push(table, '');
  const groupsLine = renderGroupsLine(g.notReported, g.pending);
  if (groupsLine) parts.push(groupsLine, '');
  const details = renderDetails([...g.attention, ...g.passed]);
  if (details) parts.push(details);
  return `${parts.join('\n').trimEnd()}\n`;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Compact CI block for the PR description (rollup line, no table). */
export function renderDescriptionBlock(entries) {
  const g = classify(entries);
  const fails = g.attention.filter((e) => e.status === 'fail');
  const verdict = fails.length
    ? `❌ ${fails.length} failing — ${labelList(fails)}`
    : g.attention.length
      ? `⚠️ ${g.attention.length} need a look`
      : `✅ ${g.passed.length} passing`;
  return `${DESC_MARKER_START}\n**CI:** ${verdict}\n${DESC_MARKER_END}`;
}

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
    return toSummary(domain, md);
  });
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main() {
  const dir = arg('--dir') ?? '.';
  const out = arg('--out');
  const sha = arg('--sha');
  const descIn = arg('--desc-in');
  const descOut = arg('--desc-out');
  const entries = buildEntries(dir);
  const body = renderComment(entries, { sha });

  if (out) writeFileSync(out, body);
  else process.stdout.write(body);

  if (descIn && descOut) {
    const current = existsSync(descIn) ? readFileSync(descIn, 'utf8') : '';
    writeFileSync(descOut, replaceDescriptionBlock(current, entries));
  }
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) main();
