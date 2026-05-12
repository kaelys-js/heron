#!/usr/bin/env node
/**
 * release — one-shot: bump version, tag, push. CI handles the rest.
 *
 * Usage:
 *   pnpm release patch    # 1.6.0 → 1.6.1
 *   pnpm release minor    # 1.6.0 → 1.7.0
 *   pnpm release major    # 1.6.0 → 2.0.0
 *   pnpm release 1.7.3    # explicit version
 *
 * What happens:
 *   1. Verifies working tree clean.
 *   2. Bumps version in root package.json AND ui/electron/package.json.
 *   3. Commits "release: vX.Y.Z".
 *   4. Tags "vX.Y.Z".
 *   5. Pushes commit + tag.
 *   6. CI workflow native-release.yml picks up the tag and:
 *      - Builds DMG (macOS), .exe (Windows), .AppImage+.deb (Linux)
 *      - Signs Mac DMG if Apple secrets configured
 *      - Uploads to GitHub Release
 *      - Builds iOS + uploads to TestFlight via Fastlane
 *   7. Opens the GitHub Actions page in your browser.
 */
import { step, run, capture, ask, confirm, ok, info, fail, c, ROOT, UI } from './_lib.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: pnpm release <patch|minor|major|x.y.z>');
  process.exit(1);
}

step(1, 'Verifying working tree clean');
const status = capture('git', ['status', '--porcelain']);
if (status.trim()) {
  fail('Working tree has uncommitted changes:');
  console.log(status);
  process.exit(1);
}
ok('clean');

step(2, 'Computing next version');
const rootPkgPath = join(ROOT, 'package.json');
const elecPkgPath = join(UI, 'electron', 'package.json');
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'));
const current = rootPkg.version;
const next = bumpVersion(current, arg);
info(`${current} → ${c.green(next)}`);

step(3, 'Confirming');
const ok2 = await confirm(`Release v${next}?`, true);
if (!ok2) { fail('Aborted.'); process.exit(0); }

step(4, 'Bumping package.json files');
rootPkg.version = next;
writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n');
const elecPkg = JSON.parse(readFileSync(elecPkgPath, 'utf8'));
elecPkg.version = next;
writeFileSync(elecPkgPath, JSON.stringify(elecPkg, null, 2) + '\n');
ok(`bumped root + electron to ${next}`);

step(5, 'Committing + tagging');
run('git', ['add', rootPkgPath, elecPkgPath]);
run('git', ['commit', '-m', `release: v${next}`]);
run('git', ['tag', '-a', `v${next}`, '-m', `Release v${next}`]);
ok(`tagged v${next}`);

step(6, 'Pushing');
run('git', ['push', 'origin', 'HEAD']);
run('git', ['push', 'origin', `v${next}`]);
ok('pushed');

step(7, 'Opening CI');
const repo = capture('gh', ['repo', 'view', '--json', 'url', '-q', '.url'], { allowFail: true });
if (repo) {
  spawnSync('open', [`${repo}/actions/workflows/native-release.yml`], { stdio: 'ignore' });
  ok(`CI: ${repo}/actions`);
}

step(8, 'Watching CI');
info('Streaming CI logs — Ctrl+C to detach (the build keeps running)');
run('gh', ['run', 'watch'], { allowFail: true });

console.log('\n' + c.green('🎉 Release v' + next + ' kicked off'));
console.log('  Desktop artifacts will land on the GitHub Release page when ready.');
console.log('  iOS TestFlight upload will appear in TestFlight in ~5min.');

function bumpVersion(current, kind) {
  const [maj, min, pat] = current.split('.').map(Number);
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  if (kind === 'major') return `${maj + 1}.0.0`;
  throw new Error(`Unknown bump kind: ${kind}`);
}
