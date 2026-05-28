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
  return h;
}

// Status indicator for the table's Status column (one glyph per row).
const STATUS_GLYPH = Object.freeze({
  pass: '✅',
  warn: '⚠️',
  fail: '❌',
  skip: '➖',
  pending: '⏳',
});
// Sort order: most-urgent first, pending last.
const STATUS_ORDER = Object.freeze({ fail: 0, warn: 1, pass: 2, skip: 3, pending: 4 });

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

/** Adapter / contract shape: md -> { domain, status, headline, detail }.
 *  A domain with NO markdown produced no artifact for this commit. That's
 *  "not reported" (skip) by default -- the producer either never fired for
 *  this commit (its source workflow is path-filtered) or ran with nothing to
 *  emit. It is only "pending" when its producer is genuinely still in-flight
 *  for this commit, i.e. the domain is in `inflight`. (Previously a missing
 *  artifact defaulted to "pending", so the 9 producers that never run for an
 *  unrelated change sat "pending" forever and the comment looked stuck.) */
export function toSummary(domain, md, inflight) {
  const hasMd = !!(md && md.trim());
  let status = deriveState(md);
  if (!hasMd) status = inflight && inflight.has(domain) ? 'pending' : 'skip';
  return {
    domain,
    status,
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

/** One complete Check / Status / Result table for every check, most-urgent
 *  first. Result falls back to "not reported" (skip) / "—" (pending). */
export function renderTable(entries) {
  if (!entries.length) return '';
  const rows = [...entries]
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))
    .map((e) => {
      // skip headlines from the formatters are inconsistent ("no data",
      // "no Lighthouse data", ...) -> normalize to one phrase.
      const result =
        e.status === 'pending' ? '—' : e.status === 'skip' ? 'not reported' : e.headline || '';
      return `| ${LABELS[e.domain] ?? e.domain} | ${STATUS_GLYPH[e.status] ?? ''} | ${result} |`;
    })
    .join('\n');
  return `| Check | Status | Result |\n|:--|:-:|:--|\n${rows}`;
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
  const parts = [renderRollup(g, meta), ''];
  const table = renderTable(entries);
  if (table) parts.push(table, '');
  const details = renderDetails([...g.attention, ...g.passed]);
  if (details) parts.push(details);
  return `${parts.join('\n').trimEnd()}\n`;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** CI block for the PR description. It lives at the TOP of the PR (the closest
 *  GitHub allows to a pinned summary), so it carries the full GitHub-native
 *  rollup alert: commit SHA + per-status counts + the failing / needs-a-look
 *  lists. The scannable table stays in the heron-pr-summary comment. */
export function renderDescriptionBlock(entries, meta = {}) {
  const g = classify(entries);
  return `${DESC_MARKER_START}\n${renderRollup(g, meta)}\n${DESC_MARKER_END}`;
}

export function replaceDescriptionBlock(descBody, entries, meta = {}) {
  const block = renderDescriptionBlock(entries, meta);
  const re = new RegExp(`${escapeRe(DESC_MARKER_START)}[\\s\\S]*?${escapeRe(DESC_MARKER_END)}`);
  const body = descBody || '';
  return re.test(body) ? body.replace(re, block) : `${body.trimEnd()}\n\n${block}\n`;
}

/** Build entries (in ORDER) from a directory of `<domain>.md` files.
 *  `inflight` (array or Set of domain slugs) marks producers whose workflow is
 *  still running for this commit, so a missing artifact reads "pending"; every
 *  other missing artifact reads "not reported". */
export function buildEntries(dir, inflight) {
  const running = inflight instanceof Set ? inflight : new Set(inflight || []);
  return ORDER.map((domain) => {
    const p = join(dir, `${domain}.md`);
    const md = existsSync(p) ? readFileSync(p, 'utf8') : null;
    return toSummary(domain, md, running);
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
  const pendingArg = arg('--pending');
  const inflight = pendingArg
    ? pendingArg
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const descIn = arg('--desc-in');
  const descOut = arg('--desc-out');
  const entries = buildEntries(dir, inflight);
  const body = renderComment(entries, { sha });

  if (out) writeFileSync(out, body);
  else process.stdout.write(body);

  if (descIn && descOut) {
    const current = existsSync(descIn) ? readFileSync(descIn, 'utf8') : '';
    writeFileSync(descOut, replaceDescriptionBlock(current, entries, { sha }));
  }
}

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) main();
