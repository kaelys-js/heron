/**
 * Shared formatting library for sticky-comment generators.
 *
 * Every `heron-pr-<type>` sticky uses these helpers so the comment
 * vocabulary (emoji, table shape, delta arrows, collapsibles, footer)
 * is identical across coverage / quality / visual / migrations / etc.
 *
 * No external deps -- pure Node stdlib. Importable from format-*.mjs
 * scripts AND testable with vitest.
 */

/**
 * Semaphore emoji vocabulary. Use these for every status indicator
 * across sticky comments -- consistent vocabulary = lower cognitive
 * load for reviewers scanning multiple stickies on one PR.
 */
export const EMOJI = Object.freeze({
  pass: '✅',
  fail: '❌',
  warn: '⚠️',
  improved: '🟢',
  regressed: '🔴',
  neutral: '🟡',
  skip: '⬜',
  new: '🆕',
  removed: '🗑️',
  building: '🛠️',
  queued: '⏳',
  cancelled: '🚫',
  question: '❓',
});

/**
 * Map a CI conclusion / status to the semaphore emoji.
 * Falls through to the question-mark for unknown states so the comment
 * never claims a value it doesn't know.
 */
export function statusEmoji(state) {
  switch ((state || '').toLowerCase()) {
    case 'success':
    case 'pass':
    case 'passed':
    case 'completed-success':
      return EMOJI.pass;
    case 'failure':
    case 'fail':
    case 'failed':
    case 'completed-failure':
      return EMOJI.fail;
    case 'cancelled':
    case 'canceled':
      return EMOJI.cancelled;
    case 'skipped':
    case 'skip':
      return EMOJI.skip;
    case 'neutral':
      return EMOJI.neutral;
    case 'warn':
    case 'warning':
      return EMOJI.warn;
    case 'in_progress':
    case 'queued':
    case 'pending':
    case 'waiting':
      return EMOJI.queued;
    default:
      return EMOJI.question;
  }
}

/**
 * Format a numeric delta as `▴ +N.NN%` (improved) / `▾ -N.NN%` (regressed) /
 * `= 0.00%` (unchanged). Used in coverage / bundle / perf deltas.
 *
 * Threshold is the minimum absolute delta considered "interesting" --
 * smaller values render as `=` to avoid noisy reports.
 *
 * @param {number} base
 * @param {number} head
 * @param {{ threshold?: number, suffix?: string, decimals?: number }} [opts]
 * @returns {string}
 */
export function deltaCell(base, head, opts = {}) {
  const threshold = opts.threshold ?? 0.05;
  const suffix = opts.suffix ?? '%';
  const decimals = opts.decimals ?? 2;
  if (typeof base !== 'number' || Number.isNaN(base) || base === null)
    return `🆕 ${formatNum(head, decimals)}${suffix}`;
  if (typeof head !== 'number' || Number.isNaN(head)) return `🗑️ (gone)`;
  const delta = head - base;
  const abs = Math.abs(delta);
  if (abs < threshold) return `= 0.00${suffix}`;
  if (delta > 0) return `▴ +${formatNum(delta, decimals)}${suffix}`;
  return `▾ ${formatNum(delta, decimals)}${suffix}`;
}

function formatNum(n, decimals) {
  if (n === 0) return '0';
  return n.toFixed(decimals);
}

/**
 * Render a horizontal progress bar made of █ and ░. Used for inline
 * coverage / bundle / perf percentages where the eye benefits from a
 * proportional visualisation alongside the number.
 *
 * @param {number} pct -- 0..100
 * @param {number} [width] -- character width of the bar (default 16)
 */
export function pctBar(pct, width = 16) {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/**
 * Wrap content in a `<details>` collapsible. Used for verbose data
 * (file lists, full error traces, per-route breakdown) that shouldn't
 * dominate the comment but should be reachable in one click.
 *
 * @param {string} summary -- visible text on the collapsed row
 * @param {string} body -- markdown content shown when expanded
 * @returns {string}
 */
export function collapsibleSection(summary, body) {
  return `<details><summary>${summary}</summary>\n\n${body}\n\n</details>`;
}

/**
 * Wrap text as a keyboard / monospace span. Use for SHA, file paths,
 * code snippets inside table cells.
 *
 * @param {string} text
 * @returns {string}
 */
export function kbd(text) {
  return `\`${text}\``;
}

/**
 * Standard footer line. The composite Action appends this automatically;
 * exposed here for tests + for stickies that need to override.
 *
 * @param {{ sha: string, repo: string, timestamp?: string, docsUrl?: string }} opts
 * @returns {string}
 */
export function footer({ sha, repo, timestamp, docsUrl }) {
  const ts = timestamp || new Date().toISOString().replace('T', ' ').slice(0, 16);
  const docs = docsUrl || `https://github.com/${repo}/blob/main/docs/CI.md`;
  const shortSha = (sha || '').slice(0, 7);
  return `_Updated ${ts} UTC -- commit [\`${shortSha}\`](https://github.com/${repo}/commit/${sha}) -- [CI docs](${docs})_`;
}

/**
 * Compose a markdown table from rows + columns. Each row is an object
 * keyed by column name. Used to keep table shape consistent across
 * stickies (header / separator / right-aligned numerics).
 *
 * @param {Array<{label: string, align?: 'left'|'right'|'center'}>} columns
 * @param {Array<Record<string, string>>} rows
 * @returns {string}
 */
export function table(columns, rows) {
  if (!rows.length) return '_(no rows)_';
  const headerRow = `| ${columns.map((c) => c.label).join(' | ')} |`;
  const sepRow = `|${columns
    .map((c) => {
      switch (c.align) {
        case 'right':
          return '--:';
        case 'center':
          return ':-:';
        default:
          return '---';
      }
    })
    .map((s) => `${s}|`)
    .join('')}`;
  const dataRows = rows.map((row) => `| ${columns.map((c) => row[c.label] ?? '').join(' | ')} |`);
  return [headerRow, sepRow, ...dataRows].join('\n');
}

/**
 * One-line verdict header for a sticky. Always the first content line
 * (after the marker). Examples:
 *   `## ✅ Coverage: 84.32% (▴ +0.18%)`
 *   `## ❌ Lint: 3 errors across 2 tools`
 *
 * @param {string} title
 * @param {string} state -- canonical state name (see statusEmoji)
 * @param {string} [subline] -- optional context after the title
 * @returns {string}
 */
export function verdictHeader(title, state, subline) {
  const head = `## ${statusEmoji(state)} ${title}`;
  return subline ? `${head}\n\n${subline}` : head;
}

/**
 * Convert bytes to a human-readable size. Used for bundle / file-size
 * stickies.
 *
 * @param {number} bytes
 * @returns {string}
 */
export function humanBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (!bytes || Number.isNaN(bytes)) return '--';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

/**
 * Format a duration in milliseconds as `Nm Ms` or `Ns`. For per-job /
 * per-step timing breakdowns.
 *
 * @param {number} ms
 * @returns {string}
 */
export function humanDuration(ms) {
  if (!ms || Number.isNaN(ms)) return '--';
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${s}s`;
}
