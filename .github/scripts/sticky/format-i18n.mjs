#!/usr/bin/env node
/**
 * format-i18n.mjs -- emits the heron-pr-i18n sticky body.
 *
 * Reads a normalised i18n-coverage JSON:
 *   {
 *     "locales": ["en", "de", "fr", ...],
 *     "totals": { "en": { "translated": 1000, "missing": 0 }, "de": { "translated": 850, "missing": 150 } }
 *   }
 *
 * For Heron specifically: the modes/ directory has English source +
 * locale subdirs (modes/de/, modes/fr/, etc.). The existing
 * `pnpm verify:i18n` script produces this report.
 *
 * Usage:
 *   node format-i18n.mjs <coverage.json> [--out path]
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { pctBar, table, verdictHeader } from './lib.mjs';

const { values: opts, positionals } = parseArgs({
  options: { out: { type: 'string' } },
  allowPositionals: true,
});

const inputPath = positionals[0];
if (!inputPath) {
  console.error('Usage: format-i18n.mjs <coverage.json> [--out path]');
  process.exit(2);
}

const data = fs.existsSync(inputPath) ? JSON.parse(fs.readFileSync(inputPath, 'utf8')) : null;

if (!data) {
  const lines = [
    verdictHeader('i18n: no coverage report found', 'skip'),
    '',
    `_Drop a coverage JSON at \`${inputPath}\` (typically from \`pnpm verify:i18n --json\`)._`,
  ];
  const out = lines.join('\n') + '\n';
  if (opts.out) fs.writeFileSync(opts.out, out);
  else process.stdout.write(out);
  process.exit(0);
}

const totals = data.totals || {};
const localeRows = (data.locales || Object.keys(totals)).map((loc) => {
  const t = totals[loc] || { translated: 0, missing: 0 };
  const sum = t.translated + t.missing;
  const pct = sum === 0 ? 100 : (t.translated / sum) * 100;
  return {
    Locale: `\`${loc}\``,
    Coverage: `${pct.toFixed(1)}% ${pctBar(pct, 10)}`,
    Missing: String(t.missing),
  };
});

const coverageNumbers = localeRows
  .map((r) => parseFloat(r.Coverage))
  .filter((n) => Number.isFinite(n));
// Guard against an empty-locales coverage report -- Math.min of zero
// arguments returns Infinity, which would render as "worst Infinity%".
const worstCoverage = coverageNumbers.length === 0 ? 100 : Math.min(...coverageNumbers);
const verdict =
  localeRows.length === 0
    ? 'skip'
    : worstCoverage >= 95
      ? 'pass'
      : worstCoverage >= 70
        ? 'warn'
        : 'fail';
const title =
  localeRows.length === 0
    ? 'i18n: no locales declared'
    : `i18n: ${localeRows.length} locale${localeRows.length === 1 ? '' : 's'} (worst ${worstCoverage.toFixed(1)}%)`;

const lines = [];
lines.push(verdictHeader(title, verdict));
lines.push('');
if (localeRows.length === 0) {
  lines.push('_No locales declared in the coverage report._');
} else {
  lines.push(
    table(
      [{ label: 'Locale' }, { label: 'Coverage' }, { label: 'Missing', align: 'right' }],
      localeRows,
    ),
  );
}
lines.push('');
lines.push(
  '<sub>per-locale translation coverage from `pnpm verify:i18n --json`. 100% = every key in the English source has a counterpart in the locale dir.</sub>',
);

const out = lines.join('\n') + '\n';
if (opts.out) {
  fs.writeFileSync(opts.out, out);
} else {
  process.stdout.write(out);
}
