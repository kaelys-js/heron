/** fs-fixtures -- tmpdir helpers for integration tests that need a
 *  faux data/ tree. Use withTmpRepo(async (root) => { ... }); the tmp
 *  root is always rm'd, even on throw. */
import { mkdtemp, rm, mkdir, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');

/**
 * Spawn a tmpdir, run `fn(root)`, always rm afterwards.
 * Returns whatever `fn` returns.
 */
export async function withTmpRepo<T>(fn: (root: string) => Promise<T> | T): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'heron-test-'));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/**
 * Copy the REAL repo's `templates/`, `branding/`, and minimal package.json
 * into the tmpdir -- enough scaffolding for verifier-style checks that
 * cross-reference these files.
 */
export async function withScaffoldedTmpRepo<T>(fn: (root: string) => Promise<T> | T): Promise<T> {
  return withTmpRepo(async (root) => {
    await Promise.all([
      cp(join(REPO_ROOT, 'templates'), join(root, 'templates'), { recursive: true }).catch(
        () => undefined,
      ),
      cp(join(REPO_ROOT, 'branding'), join(root, 'branding'), { recursive: true }).catch(
        () => undefined,
      ),
    ]);
    await mkdir(join(root, 'data'), { recursive: true });
    await mkdir(join(root, 'reports'), { recursive: true });
    await mkdir(join(root, 'output'), { recursive: true });
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'test-fixture', version: '0.0.0', private: true }, null, 2),
    );
    return fn(root);
  });
}

/** Helper: write a file relative to a tmp root. */
export async function writeFixture(root: string, relPath: string, content: string): Promise<void> {
  const full = join(root, relPath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}

/** Helper: drop a minimal applications.md fixture. */
export async function writeApplicationsFixture(
  root: string,
  rows: Array<{
    num: number;
    date: string;
    company: string;
    role: string;
    score: string;
    status: string;
  }>,
): Promise<void> {
  const header =
    '# Applications Tracker\n\n' +
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n' +
    '|---|------|---------|------|-------|--------|-----|--------|-------|\n';
  const body = rows
    .map(
      (r) =>
        `| ${r.num} | ${r.date} | ${r.company} | ${r.role} | ${r.score} | ${r.status} | ✅ | [${r.num}](reports/${r.num}-${r.company.toLowerCase()}-${r.date}.md) |  |`,
    )
    .join('\n');
  await writeFixture(root, 'data/applications.md', header + body + '\n');
}

/** Repo root for tests that want to read the real codebase. */
export function repoRoot(): string {
  return REPO_ROOT;
}
