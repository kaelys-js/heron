/**
 * Integration replacement for `verify-versions.mjs` (Phase 5).
 *
 * Asserts every place that pins Node / pnpm / Ruby matches `.mise.toml`
 * exactly. Runs in the `ui-integration` Vitest project (env=node,
 * 120s timeout — these touch real files at repo root).
 *
 * Parity contract: every check that verify-versions.mjs makes is
 * covered as a Vitest case below. Verifier `.mjs` files stay in repo
 * until Phase 6 deletion — both should pass/fail in lockstep.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

function readFile(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
function readJson(rel: string): any {
  return JSON.parse(readFile(rel));
}

// ── Read source-of-truth versions from .mise.toml ─────────────────
const mise = readFile('.mise.toml');
const nodeVersion = mise.match(/^\s*node\s*=\s*"([^"]+)"/m)?.[1];
const pnpmVersion = mise.match(/^\s*pnpm\s*=\s*"([^"]+)"/m)?.[1];
const rubyVersion = mise.match(/^\s*ruby\s*=\s*"([^"]+)"/m)?.[1];

describe('.mise.toml is the source of truth', () => {
  it('node version is pinned exactly (semver, no caret/tilde)', () => {
    expect(nodeVersion).toBeTruthy();
    expect(nodeVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it('pnpm version is pinned exactly', () => {
    expect(pnpmVersion).toBeTruthy();
    expect(pnpmVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it('ruby version is pinned exactly', () => {
    expect(rubyVersion).toBeTruthy();
    expect(rubyVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('package.json engines match .mise.toml', () => {
  it('root package.json engines.node === mise node', () => {
    const root = readJson('package.json');
    if (root.engines?.node) {
      expect(root.engines.node).toBe(nodeVersion);
    }
  });

  it('root package.json engines.pnpm === mise pnpm', () => {
    const root = readJson('package.json');
    if (root.engines?.pnpm) {
      expect(root.engines.pnpm).toBe(pnpmVersion);
    }
  });

  it('ui/package.json engines.node === mise node', () => {
    const ui = readJson('ui/package.json');
    if (ui.engines?.node) {
      expect(ui.engines.node).toBe(nodeVersion);
    }
  });

  it('ui/package.json engines.pnpm === mise pnpm', () => {
    const ui = readJson('ui/package.json');
    if (ui.engines?.pnpm) {
      expect(ui.engines.pnpm).toBe(pnpmVersion);
    }
  });

  it('ui/electron/package.json engines (if present) match', () => {
    const ele = readJson('ui/electron/package.json');
    if (ele.engines?.node) {
      expect(ele.engines.node).toBe(nodeVersion);
    }
    if (ele.engines?.pnpm) {
      expect(ele.engines.pnpm).toBe(pnpmVersion);
    }
  });
});

describe('packageManager field matches mise pnpm', () => {
  it('root package.json packageManager === pnpm@{mise-pnpm}', () => {
    const root = readJson('package.json');
    if (root.packageManager) {
      expect(root.packageManager).toBe(`pnpm@${pnpmVersion}`);
    }
  });
});

describe('CI workflow does NOT pin a Node version directly', () => {
  // mise-action reads .mise.toml — any hardcoded `node-version` input
  // is drift waiting to happen.
  it('test.yml uses jdx/mise-action, not actions/setup-node', () => {
    const wf = readFile('.github/workflows/test.yml');
    expect(wf).toContain('jdx/mise-action');
    expect(wf).not.toContain('actions/setup-node');
  });
});
