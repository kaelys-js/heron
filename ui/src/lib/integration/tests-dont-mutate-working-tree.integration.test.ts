/** Regression gate: the test suite must not mutate the real working
 *  tree. Snapshots `git status --porcelain` in beforeAll, diffs in
 *  afterAll, fails on any new entry pointing at the offending file.
 *  Lives in ui-integration so it runs next to the SIGKILL-prone
 *  integration suites most likely to leak. */
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
