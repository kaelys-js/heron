/**
 * Regression guard -- every formatter the lefthook + CI gates assume
 * must be pinned in `.mise.toml` so a fresh clone (and CI's
 * `jdx/mise-action@v4` step) installs them automatically. If someone
 * adds a new language formatter to lefthook without also pinning it
 * in mise, the lock breaks and CI fails on the next push -- this test
 * catches that drift in pre-push instead.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

const mise = fs.readFileSync(path.join(REPO_ROOT, '.mise.toml'), 'utf8');
const miseLock = fs.existsSync(path.join(REPO_ROOT, 'mise.lock'))
  ? fs.readFileSync(path.join(REPO_ROOT, 'mise.lock'), 'utf8')
  : '';
const lefthook = fs.readFileSync(path.join(REPO_ROOT, 'lefthook.yml'), 'utf8');
const ciYaml = fs.readFileSync(path.join(REPO_ROOT, '.github/workflows/test.yml'), 'utf8');

describe('mise.toml — runtimes', () => {
  it.each([
    'node',
    'pnpm',
    'ruby',
    'python',
  ])('%s pinned to a specific version (no range, no @latest)', (tool) => {
    const re = new RegExp(`^${tool}\\s*=\\s*"\\d`, 'm');
    expect(mise).toMatch(re);
  });
});

describe('mise.toml — formatters every lefthook gate expects', () => {
  it.each([
    'actionlint',
    'ruff',
    'shfmt',
    'swiftlint',
    'swiftformat',
    'ktlint',
    'yamllint',
  ])('%s pinned in .mise.toml', (tool) => {
    const re = new RegExp(`^${tool}\\s*=`, 'm');
    expect(mise).toMatch(re);
  });

  it('rufo pinned in root Gemfile (mise installs Ruby; bundler resolves rufo)', () => {
    const gemfile = fs.readFileSync(path.join(REPO_ROOT, 'Gemfile'), 'utf8');
    expect(gemfile).toMatch(/gem\s+["']rufo["']/);
  });
});

describe('mise.lock present so CI installs deterministic versions', () => {
  it('mise.lock exists at repo root', () => {
    expect(miseLock.length).toBeGreaterThan(0);
  });

  it('mise.lock contains entries for every formatter', () => {
    if (miseLock.length === 0) {
      return;
    }
    for (const tool of [
      'actionlint',
      'ruff',
      'shfmt',
      'swiftlint',
      'swiftformat',
      'ktlint',
      'yamllint',
      'node',
      'pnpm',
      'ruby',
      'python',
    ]) {
      const re = new RegExp(`\\[\\[tools\\.${tool}\\]\\]`);
      expect(miseLock, `${tool} missing from mise.lock`).toMatch(re);
    }
  });
});

describe('lefthook gates — every multi-lang hook is wired', () => {
  it.each([
    ['actionlint', /actionlint\b/],
    ['ruff', /ruff\b/],
    ['ktlint', /ktlint\b/],
    ['swiftformat', /swiftformat\b/],
    ['swiftlint', /swiftlint\b/],
    ['shfmt', /shfmt\b/],
    ['rufo', /bundle exec rufo\b/],
    ['yamllint', /yamllint\b/],
  ])('lefthook.yml references %s', (_name, re) => {
    expect(lefthook).toMatch(re);
  });
});

describe('cI test.yml — format job runs every formatter through mise PATH', () => {
  it.each([
    ['actionlint', /actionlint\b/],
    ['ruff format', /ruff format/],
    ['ruff check', /ruff check/],
    ['ktlint', /ktlint\b/],
    ['shfmt', /shfmt -l/],
    ['rufo', /bundle exec rufo/],
    ['yamllint', /yamllint\b/],
  ])('format job runs %s', (_name, re) => {
    expect(ciYaml).toMatch(re);
  });

  it('does NOT manually pip-install ruff / yamllint (mise owns it now)', () => {
    expect(ciYaml).not.toMatch(/pip install --user ruff/);
    expect(ciYaml).not.toMatch(/pip install --user yamllint/);
  });

  it('does NOT manually gem-install rufo (root Gemfile owns it now)', () => {
    expect(ciYaml).not.toMatch(/gem install[^\n]*rufo/);
  });
});
