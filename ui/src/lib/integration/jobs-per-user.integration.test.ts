/** Multi-user safety gate. Every JobDef that touches user data must
 *  set `perUser: true`; `perUser: false` is reserved for the small
 *  allowlist below (GDPR reaper etc.). Missing `perUser` defaults to
 *  falsy, runs once under SYSTEM_USER, silently mishandles per-user
 *  state -- CI must catch that. Mechanism: regex-on-source (Vitest
 *  node project can't import the modules; they need $env at boot). */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const JOBS_DIR = path.join(REPO_ROOT, 'ui/src/lib/server/jobs');

/** Jobs that legitimately run ONCE across the system, not per user. Adding
 *  to this list requires deliberate review -- these jobs MUST NOT read or
 *  write any user-scoped data (no `currentUserId()`, no
 *  `profilePathForUser`, no `data/users/...` paths). */
const SYSTEM_ONLY_JOBS: ReadonlySet<string> = new Set([
  'lifecycle-reap', // GDPR account reaper -- operates on auth DB
]);

type JobFile = {
  /** Absolute path on disk. */
  abs: string;
  /** Filename only, e.g. `scan-portals.job.ts`. */
  file: string;
  /** Full source text. */
  source: string;
  /** Extracted `id:` literal from the `register({...})` block. */
  id: string | null;
  /** Extracted `perUser:` literal from the `register({...})` block. */
  perUser: 'true' | 'false' | null;
};

function listJobFiles(): JobFile[] {
  const out: JobFile[] = [];
  for (const entry of fs.readdirSync(JOBS_DIR)) {
    // Index module + types + registry helpers + pure listeners aren't jobs.
    if (entry === 'index.ts' || entry === 'types.ts' || entry === 'registry.ts') {
      continue;
    }
    if (!entry.endsWith('.ts')) {
      continue;
    }
    if (entry.endsWith('.test.ts')) {
      continue;
    }
    const abs = path.join(JOBS_DIR, entry);
    const source = fs.readFileSync(abs, 'utf8');
    // Skip bus-listener-only modules -- they don't register a JobDef.
    if (!/\bregister\(\s*{/.test(source)) {
      continue;
    }
    const idMatch = source.match(/\bregister\([\s\S]*?\bid:\s*['"]([^'"]+)['"]/);
    const perUserMatch = source.match(/\bregister\([\s\S]*?\bperUser:\s*(true|false)\b/);
    out.push({
      abs,
      file: entry,
      source,
      id: idMatch?.[1] ?? null,
      perUser: (perUserMatch?.[1] as 'true' | 'false' | undefined) ?? null,
    });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

describe('jobs — multi-user safety (perUser flag)', () => {
  const jobs = listJobFiles();

  it('discovers at least 10 registered jobs (sanity check)', () => {
    // If this drops, either jobs were deleted en masse or the regex broke.
    // Adjust upward as the suite grows; never downward without review.
    expect(jobs.length).toBeGreaterThanOrEqual(10);
  });

  it('every job file extracts a stable id', () => {
    const missing = jobs.filter((j) => !j.id).map((j) => j.file);
    expect(missing, `jobs without an extractable id literal: ${missing.join(', ')}`).toEqual([]);
  });

  it('every job declares perUser explicitly (no defaulting)', () => {
    const missing = jobs.filter((j) => j.perUser === null).map((j) => `${j.file} (id=${j.id})`);
    expect(
      missing,
      `jobs missing perUser flag — add perUser: true (or false with allowlist entry) to register({...}):\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('system-only allowlist matches every perUser:false declaration', () => {
    const declaredSystemOnly = jobs
      .filter((j) => j.perUser === 'false')
      .map((j) => j.id!)
      .sort();
    const allowlist = [...SYSTEM_ONLY_JOBS].sort();
    expect(
      declaredSystemOnly,
      'perUser:false declarations must match SYSTEM_ONLY_JOBS allowlist. If you intentionally added a system-only job, update SYSTEM_ONLY_JOBS in this test.',
    ).toEqual(allowlist);
  });

  it('every non-allowlisted job is perUser:true', () => {
    const wrong = jobs
      .filter((j) => j.id && !SYSTEM_ONLY_JOBS.has(j.id) && j.perUser !== 'true')
      .map((j) => `${j.file} (id=${j.id}, perUser=${j.perUser})`);
    expect(wrong, `non-allowlisted jobs must be perUser:true:\n  ${wrong.join('\n  ')}`).toEqual(
      [],
    );
  });
});

describe('jobs — types contract', () => {
  it('jobDef.perUser is declared as a required boolean field', () => {
    const typesPath = path.join(JOBS_DIR, 'types.ts');
    const src = fs.readFileSync(typesPath, 'utf8');
    // Must be present, must not be optional (no `perUser?:`), must be boolean.
    expect(src).toMatch(/\bperUser:\s*boolean\s*;/);
    expect(src).not.toMatch(/\bperUser\?:/);
  });

  it('registry.ts:runById honors perUser fan-out', () => {
    const registryPath = path.join(JOBS_DIR, 'registry.ts');
    const src = fs.readFileSync(registryPath, 'utf8');
    expect(src).toMatch(/\bdef\.perUser\b/);
    expect(src).toMatch(/\brunAsUser\(/);
    expect(src).toMatch(/\blistSchedulableUsers\(/);
  });
});
