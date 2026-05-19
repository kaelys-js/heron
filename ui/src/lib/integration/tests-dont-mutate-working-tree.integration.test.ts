/**
 * tests-dont-mutate-working-tree.integration.test.ts
 *
 * Regression gate: the test suite must not mutate the real working tree.
 *
 * History: the apply-brand drift-gate tests used to write directly to
 * `branding/brand.json` + `.brand-snapshot.json` and rely on a try/finally
 * `restoreBackups()` to undo. When a worker was SIGKILLed (OOM, ctrl-c,
 * lefthook timeout) the finally never ran and the working tree stayed
 * dirty. We rewrote those tests to use a tmpdir via
 * `withScaffoldedTmpRepo` + `HERON_BRAND_ROOT`.
 *
 * This file snapshots `git status --porcelain` in `beforeAll` and diffs
 * it in `afterAll`. Any test that adds a working-tree mutation will fail
 * this check immediately, with a clear message pointing at the new entry.
 *
 * Lives in the `ui-integration` project so it runs alongside the other
 * integration tests that are the most likely culprits.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

/** Parse `git status --porcelain` into a Set of "<status> <path>" entries. */
function gitStatus(): Set<string> {
  const out = execSync('git status --porcelain', {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return new Set(
    out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  );
}

let baseline: Set<string>;

beforeAll(() => {
  baseline = gitStatus();
});

afterAll(() => {
  const current = gitStatus();
  const added = [...current].filter((entry) => !baseline.has(entry));
  if (added.length) {
    // Throw so the test run fails. afterAll throws bubble up to vitest.
    throw new Error(
      `tests-dont-mutate-working-tree: ${added.length} new working-tree entr${added.length === 1 ? 'y' : 'ies'} appeared during the test run:\n` +
        added.map((e) => `  ${e}`).join('\n') +
        '\n\nA test mutated real source. Move that test to a tmpdir via ' +
        '`withScaffoldedTmpRepo` from src/test-helpers/fs-fixtures.ts.',
    );
  }
});

describe('working-tree stability', () => {
  it('baseline snapshot captured', () => {
    expect(baseline).toBeInstanceOf(Set);
  });
});
