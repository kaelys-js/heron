#!/usr/bin/env node
/**
 * ensure-native-bindings.mjs — self-heal native node-module bindings.
 *
 * Wired into root package.json `postinstall` so every fresh
 * `pnpm install` (clone, CI checkout, dev re-install) ends with
 * verified-good native bindings. Also exposed as `pnpm rebuild:native`
 * for manual invocation when nothing else worked.
 *
 * Native npm packages (better-sqlite3, sharp, etc.) ship a `.node`
 * binary compiled against a specific Node ABI version. Three things
 * routinely break the binding so that `require('better-sqlite3')` throws:
 *
 *   (a) The package's `install` script ships prebuilts only for older
 *       Node ABIs. On Node 26 (new in late 2025) the prebuilt for
 *       Node ABI 147 isn't published yet; install.js silently falls
 *       back to compile-from-source, which may itself fail or get
 *       skipped if pnpm's `side-effects-cache` short-circuits the
 *       postinstall.
 *
 *   (b) The developer switched Node versions between installs. The
 *       binding cached in pnpm's content-addressable store is for the
 *       OLD ABI and gets relinked into node_modules unchanged. Runtime
 *       then dies with "compiled against a different Node.js version
 *       using NODE_MODULE_VERSION 141. This version requires 147."
 *
 *   (c) A previous failed install left the directory half-populated:
 *       `LICENSES.chromium.html` extracted, no `.node` binary. The
 *       runtime then says "Could not locate the bindings file."
 *
 * This script handles all three by:
 *   1. Walking the list of native packages we declare (allowBuilds in
 *      pnpm-workspace.yaml is the source of truth — packages that need
 *      to run their install script).
 *   2. For each, locating the package's directory under
 *      node_modules/.pnpm/<name>@<version>/node_modules/<name>/.
 *   3. Checking whether its expected `.node` binding file exists AND
 *      can be loaded by the current Node binary. If either check fails,
 *      run `npm install --build-from-source --no-audit --no-fund`
 *      directly in that directory to force a real compile.
 *
 * Wired into root package.json's `postinstall`, so every fresh `pnpm
 * install` (clone, CI checkout, dev re-install) ends with a verified-
 * good native binding. Also exposed as `pnpm rebuild:native` for
 * manual invocation when nothing else worked.
 *
 * Flags:
 *   --force    Skip the "binding looks healthy" check; always rebuild.
 *   --quiet    Suppress per-package output (errors still print).
 *   --json     Machine-readable result for verifier integration.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Script lives at scripts/native/ensure-native-bindings.mjs → repo root
// is TWO levels up, not one. The previous `..` calculation resolved
// ROOT to scripts/ which made parseAllowBuilds() look for
// scripts/pnpm-workspace.yaml (doesn't exist) → empty target list →
// the script printed "no native packages to verify" and exited 0
// even when better-sqlite3's binding was ABI-mismatched. That's
// EXACTLY the symptom we hit in pre-push runs that should have
// rebuilt but didn't.
const ROOT = resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const QUIET = args.includes('--quiet');
const JSON_OUTPUT = args.includes('--json');

const G = '\x1b[32m';
const R = '\x1b[31m';
const Y = '\x1b[33m';
const B = '\x1b[1m';
const DIM = '\x1b[2m';
const N = '\x1b[0m';

function log(msg) {
  if (!QUIET && !JSON_OUTPUT) console.log(msg);
}
function logErr(msg) {
  if (!JSON_OUTPUT) console.error(msg);
}

// ── 1. Native packages we care about ───────────────────────────────
// Source of truth: pnpm-workspace.yaml's `allowBuilds`. Packages there
// run their own install script (compile or download a prebuilt). We
// parse the workspace yaml to stay in sync.

function parseAllowBuilds() {
  const yamlPath = join(ROOT, 'pnpm-workspace.yaml');
  if (!existsSync(yamlPath)) return [];
  const text = readFileSync(yamlPath, 'utf8');
  const lines = text.split('\n');
  const out = [];
  let inBlock = false;
  for (const line of lines) {
    if (/^allowBuilds:/.test(line)) {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      // End of block when we hit a non-indented non-comment line
      if (/^\S/.test(line) && line.trim() !== '') break;
      const m = line.match(/^\s+([a-z0-9@/_-]+):\s*true\b/);
      if (m) out.push(m[1]);
    }
  }
  return out;
}

// Sub-list: packages that actually have a NATIVE binding we should
// verify post-install. (`esbuild` etc. just unpack platform binaries —
// they have their own heal path inside the package and don't need our
// help.) Keep this conservative — over-listing adds noise.
//
// `sharp` is intentionally NOT in this set even though it's a native
// package: its install mechanism is `@img/sharp-{platform}-{arch}`
// scoped prebuilds with dylib dependencies on libvips. Auto-rebuilding
// sharp from source on macOS triggers Homebrew vips version warnings
// and isn't reliable. If sharp breaks, run `pnpm install --force` +
// `pnpm rebuild sharp` manually — the package's own install logic is
// more reliable than ours for that case.
const NATIVE_PACKAGES = new Set(['better-sqlite3']);

// ── 2. Locate the package's on-disk dir ────────────────────────────
function findPackageDir(name) {
  // pnpm's layout: node_modules/.pnpm/<name>@<version>/node_modules/<name>
  // The `@<version>` directory name varies, so scan.
  const pnpmDir = join(ROOT, 'node_modules', '.pnpm');
  if (!existsSync(pnpmDir)) return null;
  let bestVersion = '';
  let bestPath = null;
  try {
    for (const entry of readdirSync(pnpmDir)) {
      // Match "<name>@<version>" (handle scoped pkgs by replacing slash)
      const safeName = name.replace('/', '+');
      if (!entry.startsWith(safeName + '@')) continue;
      const version = entry.slice(safeName.length + 1).split('_')[0];
      // Pick the highest version sorted by semver-ish string comparison.
      if (version > bestVersion) {
        const pkgPath = join(pnpmDir, entry, 'node_modules', name);
        if (existsSync(pkgPath)) {
          bestVersion = version;
          bestPath = pkgPath;
        }
      }
    }
  } catch {
    return null;
  }
  return bestPath;
}

// ── 3. Verify the binding loads ────────────────────────────────────
function bindingFiles(pkgDir, name) {
  // Common .node binding locations across native packages.
  const candidates = [
    join(pkgDir, 'build', 'Release', name.replace(/-/g, '_') + '.node'),
    join(pkgDir, 'build', 'Release', name + '.node'),
    join(pkgDir, 'build', name + '.node'),
    join(pkgDir, 'prebuilds'), // sharp + others use this
  ];
  return candidates;
}

function bindingExists(pkgDir, name) {
  for (const candidate of bindingFiles(pkgDir, name)) {
    if (existsSync(candidate)) {
      // If it's a directory (prebuilds/), check it has at least one .node
      try {
        const stat = statSync(candidate);
        if (stat.isDirectory()) {
          // Walk one level deep for any .node file
          for (const child of readdirSync(candidate)) {
            const childPath = join(candidate, child);
            if (statSync(childPath).isDirectory()) {
              for (const grand of readdirSync(childPath)) {
                if (grand.endsWith('.node')) return true;
              }
            } else if (child.endsWith('.node')) {
              return true;
            }
          }
        } else {
          return true;
        }
      } catch {}
    }
  }
  return false;
}

function bindingLoads(pkgDir, name) {
  // Try to EXERCISE the binding in a subprocess so a load failure (ABI
  // mismatch, missing dylib) doesn't crash this script.
  //
  // CRITICAL: a plain `require(pkgDir)` is NOT enough. better-sqlite3
  // 12.x lazy-loads the .node binary — `require('better-sqlite3')`
  // succeeds even with an ABI-mismatched binding because the actual
  // `bindings('better_sqlite3.node')` call only fires when you
  // construct a Database instance. The previous probe missed this and
  // reported "binding healthy" for known-broken bindings, letting the
  // pre-push gate pass while vitest workers immediately ERR_DLOPEN_FAILED.
  //
  // Per-package probes that force the binding to actually load:
  const safePath = pkgDir.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const probes = {
    'better-sqlite3': `const D=require('${safePath}'); new D(':memory:').close();`,
    // For non-better-sqlite3 native pkgs, fall back to `require()`. Any
    // package whose binding eagerly loads at require-time will be fine
    // with this. If we add one that's lazy like better-sqlite3, give it
    // its own entry here so we exercise the binding path.
  };
  const probe = probes[name] ?? `require('${safePath}');`;

  const result = spawnSync(process.execPath, ['-e', probe], {
    encoding: 'utf8',
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  if (result.status === 0) return true;
  // Loadable but not our bug? Print stderr only when debugging.
  return false;
}

function bindingHealthy(pkgDir, name) {
  if (!bindingExists(pkgDir, name)) return false;
  if (!bindingLoads(pkgDir, name)) return false;
  return true;
}

// ── 4. Rebuild from source ─────────────────────────────────────────
function rebuild(pkgDir, name) {
  // First attempt: run the package's own install script (which tries
  // prebuild-install for prebuilt binaries, falling back to node-gyp
  // compile-from-source only if no prebuild exists for this Node ABI).
  // This is the fast path — for established packages, Node 26 + arm64
  // darwin prebuilds are typically published within days of a Node
  // release and we just download a ~2MB tarball.
  log(`  ${Y}↻${N} ${name}  ${DIM}fetching prebuilt or compiling...${N}`);
  const prebuildResult = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--no-save'], {
    cwd: pkgDir,
    stdio: QUIET || JSON_OUTPUT ? ['ignore', 'ignore', 'pipe'] : 'inherit',
    env: { ...process.env, npm_config_loglevel: 'error' },
  });
  if (prebuildResult.status === 0 && bindingHealthy(pkgDir, name)) {
    return { ok: true };
  }

  // Fallback: force compile-from-source. Needs Python + setuptools +
  // a C++ toolchain. On Python 3.12+ the `distutils` module was removed
  // and old node-gyp 8.x fails with "ModuleNotFoundError: No module
  // named 'distutils'". The fix is `pip install setuptools` (provides
  // distutils as a compat shim). We surface this clearly so the user
  // doesn't get lost in a stack trace.
  log(`  ${Y}↻${N} ${name}  ${DIM}prebuild fetch failed — compiling from source...${N}`);
  const result = spawnSync(
    'npm',
    ['install', '--build-from-source', '--no-audit', '--no-fund', '--no-save'],
    {
      cwd: pkgDir,
      stdio: QUIET || JSON_OUTPUT ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      env: { ...process.env, npm_config_loglevel: 'error' },
    },
  );
  if (result.status !== 0) {
    const stderr =
      typeof result.stderr === 'string' ? result.stderr : (result.stderr?.toString?.() ?? '');
    if (/No module named ['"]distutils['"]/i.test(stderr)) {
      return {
        ok: false,
        error:
          'compile failed: Python 3.12+ removed `distutils`. Fix: `pip install setuptools` (or `pip3 install setuptools` / via your Python env manager), then retry `pnpm rebuild:native`.',
      };
    }
    if (/python.*not found|env.*python|command not found.*python/i.test(stderr)) {
      return {
        ok: false,
        error:
          'compile failed: Python missing. Fix: `brew install python` (or your platform equivalent), then retry.',
      };
    }
    return { ok: false, error: 'compile-from-source exited ' + result.status };
  }
  return { ok: true };
}

// ── 5. Main loop ───────────────────────────────────────────────────
const allowed = parseAllowBuilds();
const targets = allowed.filter((p) => NATIVE_PACKAGES.has(p));
if (targets.length === 0) {
  if (!QUIET && !JSON_OUTPUT) log(`${DIM}no native packages to verify${N}`);
  if (JSON_OUTPUT) console.log(JSON.stringify({ ok: true, targets: [], rebuilt: [] }));
  process.exit(0);
}

if (!JSON_OUTPUT) {
  log('');
  log(
    `${B}ensure-native-bindings${N}  ${DIM}node ${process.version} · ${process.platform}-${process.arch}${N}`,
  );
  log('');
}

const results = [];
let anyFailed = false;
for (const name of targets) {
  const pkgDir = findPackageDir(name);
  if (!pkgDir) {
    log(`  ${DIM}·${N} ${name}  ${DIM}not installed — skipping${N}`);
    results.push({ name, status: 'skipped', reason: 'not installed' });
    continue;
  }
  const healthy = !FORCE && bindingHealthy(pkgDir, name);
  if (healthy) {
    log(`  ${G}✓${N} ${name}  ${DIM}binding healthy${N}`);
    results.push({ name, status: 'ok' });
    continue;
  }
  const r = rebuild(pkgDir, name);
  if (r.ok && bindingHealthy(pkgDir, name)) {
    log(`  ${G}✓${N} ${name}  ${DIM}rebuilt + verified${N}`);
    results.push({ name, status: 'rebuilt' });
  } else {
    logErr(`  ${R}✗${N} ${name}  ${R}${r.error || 'rebuild failed verification'}${N}`);
    results.push({ name, status: 'failed', error: r.error });
    anyFailed = true;
  }
}

if (JSON_OUTPUT) {
  console.log(JSON.stringify({ ok: !anyFailed, targets, results }, null, 2));
} else {
  log('');
}
process.exit(anyFailed ? 1 : 0);
