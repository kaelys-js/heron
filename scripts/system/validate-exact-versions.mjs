#!/usr/bin/env node
/**
 * validate-exact-versions.mjs — reject non-exact version specifiers
 * anywhere they can hide.
 *
 * Why: "^1.2.3" / "~1.2.3" / "*" / "latest" let any maintainer (or any
 * supply-chain attacker) ship a new version with breaking changes (or
 * malware) into our build the moment they tag a release. Exact pins +
 * a lockfile lock both the version AND the integrity hash, so
 * reproducible-build means reproducible-build.
 *
 * Files scanned:
 *   - package.json (root + every workspace) — dependencies /
 *     devDependencies / peerDependencies / optionalDependencies /
 *     pnpm.overrides / resolutions
 *   - .mise.toml — [tools] section (every tool version)
 *
 * What's accepted (allow-list, anything else fails):
 *   - SemVer exact: "1.2.3", "1.2.3-alpha.4", "1.2.3+build.5"
 *   - pnpm workspace alias: "workspace:*"
 *   - pnpm link / file protocols: "link:../foo", "file:./bar"
 *   - npm alias to exact: "npm:foo@1.2.3"
 *   - Git URL pinned to SHA (40-char hex): "git+ssh://...#abcdef..."
 *
 * What's rejected:
 *   - Range operators: ^, ~, >=, >, <, <=, ||, " - "
 *   - Wildcards: *, x, X, "latest", "next", "*-pre"
 *   - Bare partial versions ("1", "1.2") — mise tolerates these but
 *     they pull whatever the latest matching release is.
 *
 * Exit 0 if every file passes; exit 1 with a per-violation report.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const violations = [];

/** True iff `spec` is an acceptable exact-version string. */
function isExact(spec) {
  if (typeof spec !== 'string') return false;
  // pnpm workspace alias
  if (spec === 'workspace:*') return true;
  // pnpm link / file / portal protocols — local refs, not registry versions
  if (/^(link|file|portal):/.test(spec)) return true;
  // npm alias: "npm:<name>@<rest>" — recurse on <rest>
  const npmAlias = spec.match(/^npm:[^@]+@(.+)$/);
  if (npmAlias) return isExact(npmAlias[1]);
  // git URLs pinned to a SHA (40 hex chars after #)
  if (/^git(\+(https?|ssh|file))?:\/\/.*#[0-9a-f]{40}$/.test(spec)) return true;
  // SemVer exact: digits.digits.digits with optional pre-release / build meta.
  // No leading range operator. No trailing "x" or "X" or "*".
  // SemVer 2.0.0 BNF: MAJOR.MINOR.PATCH(-PRE)?(\+BUILD)?
  return /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.test(spec);
}

/** Recursively scan an object for { dep: version } pairs in known sections. */
function scanPackageJson(path, rel) {
  if (!existsSync(path)) return;
  let json;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    violations.push({ path: rel, key: '(parse)', spec: '', reason: e.message });
    return;
  }
  const sections = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
    'resolutions',
  ];
  for (const sec of sections) {
    const block = json[sec];
    if (!block || typeof block !== 'object') continue;
    for (const [name, spec] of Object.entries(block)) {
      if (!isExact(spec)) {
        violations.push({ path: rel, key: `${sec}.${name}`, spec, reason: 'not exact' });
      }
    }
  }
  // pnpm.overrides — nested
  const overrides = json.pnpm?.overrides;
  if (overrides && typeof overrides === 'object') {
    for (const [name, spec] of Object.entries(overrides)) {
      if (!isExact(spec)) {
        violations.push({
          path: rel,
          key: `pnpm.overrides.${name}`,
          spec,
          reason: 'not exact',
        });
      }
    }
  }
}

/** .mise.toml parser — naive but sufficient: scans only the [tools]
 *  block, ignores comments, expects `key = "value"` per line. */
function scanMiseToml(path, rel) {
  if (!existsSync(path)) return;
  const src = readFileSync(path, 'utf8');
  let inTools = false;
  src.split('\n').forEach((line, i) => {
    const stripped = line.split('#')[0].trim();
    if (!stripped) return;
    if (/^\[tools\]/.test(stripped)) {
      inTools = true;
      return;
    }
    if (/^\[/.test(stripped)) {
      inTools = false;
      return;
    }
    if (!inTools) return;
    const match = stripped.match(/^"?([A-Za-z][\w:./-]*)"?\s*=\s*"([^"]+)"/);
    if (!match) return;
    const [, name, spec] = match;
    if (!isExact(spec)) {
      violations.push({
        path: rel,
        key: `[tools].${name}`,
        spec,
        reason: 'not exact (mise tolerates partials but they pull the latest matching release)',
        line: i + 1,
      });
    }
  });
}

// ── Walk ──────────────────────────────────────────────────────────────
// All known package.json locations (root + workspaces).
const packageJsonPaths = ['package.json', 'ui/package.json', 'ui/electron/package.json'];
for (const rel of packageJsonPaths) {
  scanPackageJson(resolve(REPO_ROOT, rel), rel);
}
scanMiseToml(resolve(REPO_ROOT, '.mise.toml'), '.mise.toml');

// ── Report ────────────────────────────────────────────────────────────
if (violations.length === 0) {
  console.log('✓ all version specifiers are exact');
  process.exit(0);
}

console.error(`× ${violations.length} non-exact version specifier(s):\n`);
for (const v of violations) {
  const loc = v.line ? `${v.path}:${v.line}` : v.path;
  console.error(`  ${loc}`);
  console.error(`    ${v.key} = "${v.spec}"  (${v.reason})`);
}
console.error(`\nFix: replace each range/partial spec with the exact resolved version.`);
console.error(`     For npm: \`pnpm why <pkg>\` shows the version pnpm resolved to.`);
console.error(`     For mise: \`mise current\` shows the version mise actually installed.`);
process.exit(1);
