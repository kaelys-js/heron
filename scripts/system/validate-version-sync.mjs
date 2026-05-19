#!/usr/bin/env node
/**
 * validate-version-sync.mjs -- assert every version source agrees.
 *
 * Why: release-please-config.json::extra-files bumps the version in
 * four places on every release:
 *
 *   - package.json::version
 *   - ui/package.json::version
 *   - ui/electron/package.json::version
 *   - VERSION (plain-text, used by scripts/system/update-system.mjs to
 *     advertise the latest version to existing installs)
 *
 * If a contributor edits one of those manually (e.g. `pnpm release patch`
 * bypass, or a hand-edit that bypasses release-please), the four sources
 * can drift. This validator catches that drift before it lands.
 *
 * Bonus: also asserts that .release-please-manifest.json::"." matches --
 * release-please's own ledger of the last released version. If the
 * manifest disagrees, release-please will compute the wrong "next"
 * version on the upcoming PR.
 *
 * Exit 0 if every source agrees; exit 1 with a per-source diff report.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

function readVersion(label, reader) {
  try {
    return { label, version: reader() };
  } catch (e) {
    return { label, version: null, error: e.message };
  }
}

function readJsonVersion(rel) {
  const path = resolve(REPO_ROOT, rel);
  if (!existsSync(path)) throw new Error('file missing');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof data.version !== 'string') throw new Error('no `version` field');
  return data.version;
}

function readManifestVersion(rel) {
  const path = resolve(REPO_ROOT, rel);
  if (!existsSync(path)) throw new Error('file missing');
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const v = data['.'];
  if (typeof v !== 'string') throw new Error('no "." key');
  return v;
}

function readPlainVersion(rel) {
  const path = resolve(REPO_ROOT, rel);
  if (!existsSync(path)) throw new Error('file missing');
  const raw = readFileSync(path, 'utf8').trim();
  if (!/^\d+\.\d+\.\d+(-[\w.-]+)?(\+[\w.-]+)?$/.test(raw)) {
    throw new Error(`not a SemVer string: ${JSON.stringify(raw)}`);
  }
  return raw;
}

const sources = [
  readVersion('package.json', () => readJsonVersion('package.json')),
  readVersion('ui/package.json', () => readJsonVersion('ui/package.json')),
  readVersion('ui/electron/package.json', () => readJsonVersion('ui/electron/package.json')),
  readVersion('VERSION', () => readPlainVersion('VERSION')),
  readVersion('.release-please-manifest.json', () =>
    readManifestVersion('.release-please-manifest.json'),
  ),
];

const errors = sources.filter((s) => s.error);
if (errors.length > 0) {
  console.error('× some version sources could not be read:\n');
  for (const s of errors) console.error(`  ${s.label}  → ${s.error}`);
  process.exit(1);
}

const versions = sources.map((s) => s.version);
const allMatch = versions.every((v) => v === versions[0]);

if (allMatch) {
  console.log(`✓ all 5 version sources agree on ${versions[0]}`);
  process.exit(0);
}

console.error('× version sources DO NOT agree:\n');
const maxLabel = Math.max(...sources.map((s) => s.label.length));
for (const s of sources) {
  console.error(`  ${s.label.padEnd(maxLabel)}  →  ${s.version}`);
}
console.error('\nFix: bring all sources to the same value, then commit.');
console.error('     The release-please-config.json::extra-files block lists');
console.error('     every JSON file that release-please auto-bumps on a real');
console.error('     release. If you bumped one source manually (e.g. via');
console.error('     `pnpm release`), bump the rest by hand too.');
process.exit(1);
