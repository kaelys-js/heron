/**
 * Unit tests for format-migrations.mjs.
 * Run: node --test .github/scripts/sticky/format-migrations.test.mjs
 *
 * format-migrations runs `git diff --diff-filter=AM --name-only <base>..<head>`
 * to discover new/modified migration files, then scans them for dangerous SQL
 * patterns. We exercise it against a real throwaway git repo.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';

const SCRIPT = path.resolve('.github/scripts/sticky/format-migrations.mjs');

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmt-migr-'));
  execSync('git init --quiet --initial-branch=main', { cwd: dir });
  execSync('git config user.email "test@example.com"', { cwd: dir });
  execSync('git config user.name "Test"', { cwd: dir });
  execSync('git config commit.gpgsign false', { cwd: dir });
  // base commit
  fs.writeFileSync(path.join(dir, 'README.md'), 'init\n');
  execSync('git add README.md', { cwd: dir });
  execSync('git commit --quiet -m "init"', { cwd: dir });
  return dir;
}

function commit(dir, msg) {
  execSync('git add -A', { cwd: dir });
  execSync(`git commit --quiet -m "${msg}"`, { cwd: dir });
  return execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();
}

function run(dir, base, head) {
  return execFileSync(process.execPath, [SCRIPT, base, head], {
    encoding: 'utf8',
    cwd: dir,
    stdio: 'pipe',
  });
}

describe('format-migrations', () => {
  it('renders skip verdict when no migration files changed', () => {
    const dir = makeRepo();
    const base = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();
    fs.writeFileSync(path.join(dir, 'README.md'), 'changed\n');
    const head = commit(dir, 'unrelated change');
    const out = run(dir, base, head);
    assert.ok(out.includes('Migrations: no changes'), 'skip title missing');
    assert.ok(out.includes('No new or modified migration'), 'skip explanation missing');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('renders pass verdict when migration added without dangerous patterns', () => {
    const dir = makeRepo();
    const base = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();
    const migDir = path.join(dir, 'drizzle', 'migrations');
    fs.mkdirSync(migDir, { recursive: true });
    fs.writeFileSync(
      path.join(migDir, '0001_create_users.sql'),
      'CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT);\n',
    );
    const head = commit(dir, 'add migration');
    const out = run(dir, base, head);
    assert.ok(out.includes('## ✅ Migrations:'), 'pass verdict missing');
    assert.ok(out.includes('no danger patterns'), 'no-danger explanation missing');
    assert.ok(out.includes('`0001_create_users`'), 'migration name missing');
    assert.ok(out.includes('none'), 'safe risk label missing');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('renders non-pass verdict for DROP TABLE migration', () => {
    // NOTE: format-migrations passes 'warn' to verdictHeader; statusEmoji('warn')
    // currently returns ❓ (lib.mjs has no 'warn' case).
    const dir = makeRepo();
    const base = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();
    const migDir = path.join(dir, 'drizzle', 'migrations');
    fs.mkdirSync(migDir, { recursive: true });
    fs.writeFileSync(path.join(migDir, '0002_drop_users.sql'), 'DROP TABLE users;\n');
    const head = commit(dir, 'drop users');
    const out = run(dir, base, head);
    assert.ok(!out.includes('## ✅'), 'should not be pass verdict');
    assert.ok(out.includes('DROP TABLE'), 'pattern label missing');
    assert.ok(out.includes('high'), 'high severity missing');
    assert.ok(out.includes('Danger-pattern details'), 'details collapsible missing');
    assert.ok(out.includes('Forward-only'), 'forward-only footer missing');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('detects NOT NULL without DEFAULT', () => {
    const dir = makeRepo();
    const base = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();
    const migDir = path.join(dir, 'migrations');
    fs.mkdirSync(migDir, { recursive: true });
    fs.writeFileSync(
      path.join(migDir, '0003_add_col.sql'),
      'ALTER TABLE users ADD COLUMN status TEXT NOT NULL;\n',
    );
    commit(dir, 'add not null col');
    const head = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();
    const out = run(dir, base, head);
    assert.ok(out.includes('NOT NULL without DEFAULT'), 'pattern label missing');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('detects CREATE INDEX without CONCURRENTLY', () => {
    const dir = makeRepo();
    const base = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();
    const migDir = path.join(dir, 'ui', 'src', 'lib', 'server', 'db', 'migrations');
    fs.mkdirSync(migDir, { recursive: true });
    fs.writeFileSync(
      path.join(migDir, '0004_idx.sql'),
      'CREATE INDEX idx_users_email ON users(email);\n',
    );
    commit(dir, 'add idx');
    const head = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();
    const out = run(dir, base, head);
    assert.ok(out.includes('CREATE INDEX without CONCURRENTLY'), 'pattern label missing');
    assert.ok(out.includes('medium'), 'medium severity missing');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('detects multiple dangerous patterns in a single file', () => {
    const dir = makeRepo();
    const base = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();
    const migDir = path.join(dir, 'drizzle', 'migrations');
    fs.mkdirSync(migDir, { recursive: true });
    fs.writeFileSync(
      path.join(migDir, '0005_evil.sql'),
      `DROP TABLE old_users;
TRUNCATE TABLE logs;
ALTER TABLE foo DROP COLUMN bar;
`,
    );
    commit(dir, 'multi danger');
    const head = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();
    const out = run(dir, base, head);
    assert.ok(out.includes('DROP TABLE'));
    assert.ok(out.includes('TRUNCATE'));
    assert.ok(out.includes('DROP COLUMN'));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('ignores non-migration paths', () => {
    const dir = makeRepo();
    const base = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'app.sql'), 'DROP TABLE foo;\n');
    commit(dir, 'non-migration sql');
    const head = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();
    const out = run(dir, base, head);
    assert.ok(out.includes('Migrations: no changes'), 'non-migration sql should not trip detector');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('exits with usage error when base sha is missing', () => {
    let threw = false;
    try {
      execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      threw = true;
      assert.equal(e.status, 2);
      assert.ok(String(e.stderr).includes('Usage:'));
    }
    assert.ok(threw, 'should have thrown on missing args');
  });
});
