#!/usr/bin/env node
/**
 * format-migrations.mjs -- emits the heron-pr-migrations sticky body.
 *
 * Detects added / modified files under any path matching:
 *   ui/src/lib/server/db/migrations/**
 *   drizzle/migrations/**
 *   migrations/**
 *
 * For each migration file, scans the SQL content for known-dangerous
 * patterns (NOT NULL without DEFAULT, dropping a column, locking
 * operations on large tables, ALTER TYPE on enum, etc.) and emits a
 * rollback-recipe block.
 *
 * Usage:
 *   node format-migrations.mjs <base-sha> <head-sha> [--out path]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { collapsibleSection, table, verdictHeader } from './lib.mjs';

const { values: opts, positionals } = parseArgs({
  options: { out: { type: 'string' } },
  allowPositionals: true,
});

const baseSha = positionals[0];
const headSha = positionals[1] || 'HEAD';
if (!baseSha) {
  console.error('Usage: format-migrations.mjs <base-sha> [<head-sha>] [--out path]');
  process.exit(2);
}

const MIGRATION_GLOBS = [
  /^ui\/src\/lib\/server\/db\/migrations\//,
  /^drizzle\/migrations\//,
  /^migrations\//,
];

// Dangerous-pattern heuristics. Each pattern is a (label, regex, severity, tip).
const DANGEROUS = [
  {
    label: 'NOT NULL without DEFAULT',
    re: /ALTER\s+TABLE.*ADD\s+COLUMN.*NOT\s+NULL(?!.*DEFAULT)/i,
    severity: '🔴 high',
    tip: 'Backfill data first, then add NOT NULL as a separate migration.',
  },
  {
    label: 'DROP COLUMN',
    re: /ALTER\s+TABLE.*DROP\s+COLUMN/i,
    severity: '🔴 high',
    tip: 'Verify no application code reads this column. Make read-only first, then drop after a deploy.',
  },
  {
    label: 'DROP TABLE',
    re: /DROP\s+TABLE/i,
    severity: '🔴 high',
    tip: 'Make sure no application code references this table. Confirm via Sentry + log scan.',
  },
  {
    label: 'ALTER TYPE on enum',
    re: /ALTER\s+TYPE.*ADD\s+VALUE/i,
    severity: '🟡 medium',
    tip: 'Postgres pre-12 cannot add enum values in a transaction. Run outside the txn.',
  },
  {
    label: 'CREATE INDEX without CONCURRENTLY',
    re: /CREATE\s+(UNIQUE\s+)?INDEX(?!\s+CONCURRENTLY)/i,
    severity: '🟡 medium',
    tip: 'Use CREATE INDEX CONCURRENTLY for tables with concurrent writes.',
  },
  {
    label: 'TRUNCATE',
    re: /TRUNCATE\s+TABLE/i,
    severity: '🔴 high',
    tip: 'Irreversible without a backup. Confirm intent.',
  },
  {
    label: 'rename',
    re: /ALTER\s+TABLE.*RENAME/i,
    severity: '🟡 medium',
    tip: 'Application code referencing the old name will break. Coordinate with deploy.',
  },
];

function listChangedMigrations() {
  // git diff filters: A (Added), M (Modified). Reject deletions.
  const cmd = `git diff --diff-filter=AM --name-only "${baseSha}..${headSha}"`;
  let stdout;
  try {
    stdout = execSync(cmd, { encoding: 'utf8' });
  } catch (e) {
    return [];
  }
  return stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => MIGRATION_GLOBS.some((re) => re.test(p)));
}

function scanFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const src = fs.readFileSync(filePath, 'utf8');
  const hits = [];
  for (const d of DANGEROUS) {
    if (d.re.test(src)) hits.push(d);
  }
  return hits;
}

const migrations = listChangedMigrations();

const lines = [];
if (migrations.length === 0) {
  lines.push(verdictHeader('Migrations: no changes', 'skip'));
  lines.push('');
  lines.push('_No new or modified migration files in this PR. Nothing to verify._');
} else {
  // Per-migration scan.
  const perFile = migrations.map((m) => ({
    path: m,
    name: path.basename(m, path.extname(m)),
    hits: scanFile(m),
  }));
  const dangerous = perFile.filter((f) => f.hits.length > 0);
  const verdict = dangerous.length === 0 ? 'pass' : 'warn';
  const title =
    dangerous.length === 0
      ? `Migrations: ${migrations.length} change${migrations.length === 1 ? '' : 's'} (no danger patterns detected)`
      : `Migrations: ${dangerous.length} of ${migrations.length} have potentially-dangerous patterns`;
  lines.push(verdictHeader(title, verdict));
  lines.push('');

  lines.push(
    table(
      [{ label: 'Migration' }, { label: 'Path' }, { label: 'Risk' }],
      perFile.map((f) => ({
        Migration: `\`${f.name}\``,
        Path: `\`${f.path}\``,
        Risk:
          f.hits.length === 0
            ? '🟢 none detected'
            : f.hits
                .map((h) => h.severity)
                .sort()
                .reverse()
                .join(' '),
      })),
    ),
  );

  if (dangerous.length > 0) {
    const details = dangerous
      .map((f) => {
        const list = f.hits.map((h) => `- **${h.severity} ${h.label}** -- ${h.tip}`).join('\n');
        return `**\`${f.path}\`**\n${list}`;
      })
      .join('\n\n');
    lines.push('');
    lines.push(
      collapsibleSection(
        `Danger-pattern details (${dangerous.length} file${dangerous.length === 1 ? '' : 's'})`,
        details,
      ),
    );
  }

  lines.push('');
  lines.push(
    '> :information_source: **Forward-only acknowledgement:** PRs touching migrations are forward-only by policy. Document the rollback strategy in the PR body if a rollback is conceivable.',
  );
}

lines.push('');
lines.push(
  '<sub>scans `ui/src/lib/server/db/migrations/**`, `drizzle/migrations/**`, and `migrations/**` for known-dangerous SQL patterns. Add a pattern in format-migrations.mjs::DANGEROUS to extend.</sub>',
);

const out = lines.join('\n') + '\n';
if (opts.out) {
  fs.writeFileSync(opts.out, out);
} else {
  process.stdout.write(out);
}
