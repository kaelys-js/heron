#!/usr/bin/env node
/**
 * _bump-versions -- set the version field in both package.json files.
 *
 * Called by semantic-release via the @semantic-release/exec plugin
 * (verifyReleaseCmd) with the resolved next version. Keeping root and
 * ui/electron in lockstep means `electron-builder` and the CLI wrapper
 * always agree on what version they are.
 *
 * Usage:  node scripts/native/_bump-versions.mjs 1.7.0
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampPbxprojVersion } from './pbxproj-version.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const next = process.argv[2];
if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/.test(next || '')) {
  console.error(`Usage: node ${process.argv[1]} <semver>`);
  console.error(`Got: "${next}"`);
  process.exit(1);
}

const FILES = [join(ROOT, 'package.json'), join(ROOT, 'ui', 'electron', 'package.json')];

for (const f of FILES) {
  const json = JSON.parse(readFileSync(f, 'utf8'));
  const prev = json.version;
  json.version = next;
  writeFileSync(f, JSON.stringify(json, null, 2) + '\n');
  console.log(`  ${f.replace(ROOT, '.')}: ${prev} → ${next}`);
}

// Stamp the iOS Xcode project's MARKETING_VERSION (= next) +
// CURRENT_PROJECT_VERSION (build number derived from next) for every target,
// so the native bundle's CFBundleShortVersionString / CFBundleVersion track the
// release version. apply-brand reconciles these on every brand apply too;
// stamping here means a release that doesn't touch branding still bumps them.
const PBXPROJ = join(ROOT, 'ui', 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
// Read-and-catch instead of existsSync-then-read: a check-then-use pair is a
// CodeQL `js/file-system-race`. ENOENT means the iOS project isn't present
// (non-iOS checkout) -- skip silently; any other error is real, so rethrow.
let pbxBody;
try {
  pbxBody = readFileSync(PBXPROJ, 'utf8');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
if (pbxBody !== undefined) {
  const stamped = stampPbxprojVersion(pbxBody, next);
  if (stamped !== pbxBody) {
    writeFileSync(PBXPROJ, stamped);
    console.log(`  ./ui/ios/App/App.xcodeproj/project.pbxproj: MARKETING_VERSION → ${next}`);
  }
}

console.log(`✓ versions synced to ${next}`);
