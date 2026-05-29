/**
 * Cleanup-invariant integration tests.
 *
 * Stable structural assertions that catch dev-artefact regressions
 * (stray `.DS_Store` commits, `test-tmp-*` dirs, broken `.mjs` scripts
 * at repo root, dependencies pointing at `file://` or `git+...` URLs).
 * Granular per-module dead-code checks live in the per-module
 * lib/server/*.test.ts suite.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

function exists(rel: string): boolean {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}

describe('cleanup invariants — no stray dev artefacts', () => {
  // .DS_Store files exist on every macOS developer's machine and DON'T
  // get committed (.gitignore catches them). The verifier originally
  // tried to fail on their presence -- we relax to "they're gitignored",
  // not "they don't exist on disk."
  it('.DS_Store is gitignored', () => {
    const gi = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    expect(gi).toContain('.DS_Store');
  });

  it('no stray test-* dirs at repo root from prior experiments', () => {
    const out = execSync(
      'find . -maxdepth 1 -name "test-tmp-*" -o -name "tmp-test-*" 2>/dev/null || true',
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
    expect(out.trim()).toBe('');
  });
});

describe('cleanup invariants — directory structure', () => {
  it('ui/build/ is gitignored when present', () => {
    const gi = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    expect(gi).toMatch(/build\/|^\/?ui\/build/m);
  });

  it('.svelte-kit dirs are gitignored', () => {
    const gi = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    expect(gi).toContain('.svelte-kit');
  });

  it('coverage/ is gitignored', () => {
    const gi = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    expect(gi).toMatch(/coverage|\.coverage/i);
  });
});

describe('cleanup — extended structural checks (replaces obsolete verify-cleanup.mjs spot-checks)', () => {
  // The legacy verifier had ~30 specific symbol/file checks that drifted
  // over time as the cleanup phases finished. We assert the high-level
  // invariants here -- anything more granular is covered by per-module
  // tests in lib/server/*.test.ts.

  it('no .DS_Store files committed', () => {
    const out = execSync(
      'git ls-files -- ":!**/node_modules/**" ":!**/.git/**" 2>/dev/null | grep -c "\\.DS_Store$" || true',
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
    expect(parseInt(out.trim() || '0', 10)).toBe(0);
  });

  it('every .mjs script at repo root has a valid shebang or is module-syntax', () => {
    const out = execSync('ls *.mjs 2>/dev/null || echo ""', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const scripts = out.trim().split('\n').filter(Boolean);
    for (const s of scripts) {
      // Read enough to catch ESM syntax past JSDoc/comments at the top.
      const content = fs.readFileSync(path.join(REPO_ROOT, s), 'utf8').slice(0, 2000);
      const hasShebang = content.startsWith('#!');
      const hasEsm = /^(import|export)\s/m.test(content);
      expect(hasShebang || hasEsm, `${s} missing shebang AND ESM syntax`).toBe(true);
    }
  });

  it('package.json has no dependencies that point at file:// or git://', () => {
    const root = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
    for (const dep of Object.entries({ ...root.dependencies, ...root.devDependencies } as Record<
      string,
      string
    >)) {
      const [name, version] = dep;
      expect(version, `${name} pointed at file/git`).not.toMatch(/^(file:|git\+|github:)/);
    }
  });
});
