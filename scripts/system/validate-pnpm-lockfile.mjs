#!/usr/bin/env node
/**
 * validate-pnpm-lockfile.mjs - supply-chain integrity gate for pnpm-lock.yaml.
 *
 * Why this exists: `lockfile-lint@4` cannot parse pnpm-lock.yaml v9
 * (the structure diverged from yarn-lock around v8; --type yarn errors
 * with "Lockfile does not seem to contain a valid dependency list"),
 * and the maintainers have stated they do not plan to add pnpm support.
 * This script reimplements the four checks lockfile-lint was enforcing,
 * directly against the v9 YAML structure.
 *
 * Checks (each exits 1 with the offending line on failure):
 *   1. No `http://` tarballs (every dep must be fetched over TLS)
 *   2. Every `resolution:` block must carry an `integrity:` field
 *   3. No `git+ssh:` / `git+https:` / `ssh:` references (not auditable)
 *   4. No `file:` references outside workspace packages (link: protocol)
 *
 * Pairs with `validate-exact-versions.mjs` (asserts package.json
 * specifiers are exact pins) - this asserts the resolved lockfile is
 * traceable to safe, verifiable sources.
 *
 * Pre-existing `--frozen-lockfile` in CI + the `.npmrc::registry=` pin
 * cover the "right registry" check, so we do not duplicate that here.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { error } from '../lib/logger.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOCK = join(ROOT, 'pnpm-lock.yaml');

if (!existsSync(LOCK)) {
  error('pnpm-lock.yaml missing at ' + LOCK);
  process.exit(2);
}

const lines = readFileSync(LOCK, 'utf8').split('\n');

const offenders = [];
let inResolution = false;
let resolutionStartLine = 0;
let resolutionHasIntegrity = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const lineNo = i + 1;

  // 1. tarball URLs - must be https://
  const tarMatch = line.match(/^\s+tarball:\s*(\S+)/);
  if (tarMatch) {
    const url = tarMatch[1];
    if (!/^https:\/\//.test(url)) {
      offenders.push({ line: lineNo, text: line.trim(), reason: 'non-HTTPS tarball' });
    }
  }

  // 3. git+ssh / git+https / ssh sources
  if (/(?:^|\s)(git\+ssh:|git\+https:|ssh:\/\/)/.test(line)) {
    offenders.push({ line: lineNo, text: line.trim(), reason: 'git/ssh source (not auditable)' });
  }

  // 4. file: protocol outside workspace
  // pnpm uses link: for workspace packages, file: for tarball paths.
  // Bare file: refs are a red flag - means someone pasted a local path.
  const fileMatch = line.match(/^\s+(?:resolution|tarball):\s*\{?\s*tarball:\s*(file:)/);
  if (fileMatch || /^\s+tarball:\s*file:/.test(line)) {
    offenders.push({ line: lineNo, text: line.trim(), reason: 'file: protocol' });
  }

  // 2. Every resolution: { ... } block must contain integrity:
  // Resolutions span 1 line (inline) or 2 lines (multi-line braces).
  const resolutionLine = /^\s+resolution:\s*\{/.test(line);
  if (resolutionLine) {
    inResolution = true;
    resolutionStartLine = lineNo;
    resolutionHasIntegrity = /integrity:/.test(line);
  }
  if (inResolution && /integrity:/.test(line)) resolutionHasIntegrity = true;
  if (inResolution && /\}\s*$/.test(line)) {
    if (!resolutionHasIntegrity) {
      offenders.push({
        line: resolutionStartLine,
        text: lines[resolutionStartLine - 1].trim(),
        reason: 'resolution block missing integrity hash',
      });
    }
    inResolution = false;
    resolutionHasIntegrity = false;
  }
}

if (offenders.length === 0) {
  const resolutionCount = lines.filter((l) => /^\s+resolution:\s*\{integrity:/.test(l)).length;
  console.log(
    `OK validate-pnpm-lockfile - ${lines.length} lines scanned, ${resolutionCount} resolutions with integrity hash, 0 offenders.`,
  );
  process.exit(0);
}

console.error('');
console.error(`FAIL validate-pnpm-lockfile - ${offenders.length} offender(s):`);
for (const o of offenders.slice(0, 30)) {
  console.error(`  pnpm-lock.yaml:${o.line}  [${o.reason}]  ${o.text.slice(0, 100)}`);
}
if (offenders.length > 30) console.error(`  ... and ${offenders.length - 30} more`);
console.error('');
console.error('Lockfile integrity broken. Investigate the offending lines above.');
process.exit(1);
