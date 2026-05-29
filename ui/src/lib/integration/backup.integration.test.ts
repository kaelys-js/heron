/**
 * Backup + restore integration tests.
 *
 * Structural assertions:
 *   • Server module exists at lib/server/backup.ts with the expected
 *     exported surface
 *   • API endpoints exist for create / list / restore
 *   • Backup directory structure conventions
 *
 * Round-trip behavioural coverage (write → read → assert content) lives
 * in lib/server/backup.test.ts, which uses a tmpdir-scoped profile.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

function exists(rel: string): boolean {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}
function readFile(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

describe('backup system — code surface', () => {
  it('lib/server/backup.ts exists', () => {
    expect(exists('ui/src/lib/server/backup.ts')).toBe(true);
  });

  it('backup endpoints exist', () => {
    // The backup API surface is split across run/list/restore/config/[id].
    // Each is a separate +server.ts under /api/backup/.
    const required = [
      'ui/src/routes/api/backup/run/+server.ts',
      'ui/src/routes/api/backup/list/+server.ts',
      'ui/src/routes/api/backup/restore/+server.ts',
    ];
    for (const r of required) {
      expect(exists(r), `missing endpoint: ${r}`).toBe(true);
    }
  });

  it('backup.ts exports createBackup or similar', () => {
    if (!exists('ui/src/lib/server/backup.ts')) {
      return;
    }
    const ts = readFile('ui/src/lib/server/backup.ts');
    // At least one of these export shapes exists
    const hasExport =
      /export\s+(async\s+)?function\s+(create|make|capture)Backup/.test(ts) ||
      /export\s+const\s+(create|make|capture)Backup/.test(ts);
    expect(hasExport).toBe(true);
  });

  it('backup.ts exports a restore function', () => {
    if (!exists('ui/src/lib/server/backup.ts')) {
      return;
    }
    const ts = readFile('ui/src/lib/server/backup.ts');
    const hasRestore =
      /export\s+(async\s+)?function\s+restore/.test(ts) || /export\s+const\s+restore/.test(ts);
    expect(hasRestore).toBe(true);
  });
});

describe('backup system — runtime conventions', () => {
  it('backups dir is under data/ (gitignored)', () => {
    const gi = readFile('.gitignore');
    // data/backups/ or data/* should be gitignored (data/ itself often is)
    const ignored = /data\/backups?/.test(gi) || /^data\/$/m.test(gi) || /^\/?data\//m.test(gi);
    expect(ignored).toBe(true);
  });
});
