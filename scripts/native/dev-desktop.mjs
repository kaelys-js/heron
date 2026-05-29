#!/usr/bin/env node
/**
 * dev-desktop -- one-shot: spin up the dev server AND the Electron window.
 *
 * Equivalent to running two terminals:
 *   Terminal 1: cd ui && pnpm dev
 *   Terminal 2: cd ui/electron && npm run electron:start-live
 *
 * Hot reload of Svelte components works inside the Electron WebView.
 * Ctrl+C kills both processes.
 *
 * Self-healing electron binary check (step 3.5):
 *   The Electron npm package has a postinstall script (`install.js`) that
 *   downloads the ~150 MB platform binary and writes `path.txt`. If the
 *   postinstall is suppressed (silent flag + engine-strict combo, network
 *   blip, pnpm's `side-effects-cache` confusing npm) the binary is
 *   missing and the runtime crashes with "Electron failed to install
 *   correctly". We detect the missing `path.txt` and re-run install.js
 *   directly in the foreground so any real failure is visible.
 *
 * `ui/electron/.npmrc` overrides the inherited pnpm settings so npm
 * installs run in foreground + don't silently skip postinstalls.
 */
import { step, run, runParallel, which, info, warn, UI, ROOT } from './_lib.mjs';
import { existsSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir, platform as nodePlatform } from 'node:os';

/** Electron's @electron/get cache directory per OS. Poisoned entries
 *  (truncated / aborted downloads) cause `install.js` to extract a
 *  cached zip that only contains LICENSES.chromium.html -- exits 0,
 *  but no binary + no path.txt. The user then sees the misleading
 *  "Electron failed to install correctly" runtime error. */
function electronCacheDir() {
  const home = homedir();
  const p = nodePlatform();
  if (p === 'darwin') return join(home, 'Library', 'Caches', 'electron');
  if (p === 'win32') return join(process.env.LOCALAPPDATA || home, 'electron', 'Cache');
  return join(home, '.cache', 'electron');
}

step(1, 'Preflight');
if (!which('pnpm')) {
  console.error('pnpm not found on PATH — install with: npm i -g pnpm');
  process.exit(1);
}

step(2, 'Applying brand (idempotent — propagates branding/brand.json)');
run('node', [join(ROOT, 'scripts/native/apply-brand.mjs')], { silent: true });

step(3, 'Ensuring electron deps');
const electronDir = join(UI, 'electron');
const electronModule = join(electronDir, 'node_modules', 'electron');
// pnpm, not npm: ui/electron's deps use pnpm's `catalog:` protocol, which npm
// rejects ("EUNSUPPORTEDPROTOCOL Unsupported URL Type catalog:"). pnpm install
// from inside the workspace resolves the whole workspace (idempotent + fast if
// already installed).
run('pnpm', ['install'], {
  cwd: electronDir,
  allowFail: true,
});

// Step 3.5 -- self-heal a partially-installed electron binary.
//
// Three failure modes we recover from automatically:
//   (a) postinstall never ran (silent-flag + npm quirks) -- path.txt missing,
//       dist/ empty. Fix: run install.js in foreground.
//   (b) postinstall ran but cache is poisoned -- install.js extracts a
//       truncated zip that contains only LICENSES.chromium.html, then
//       silently exits 0 without writing path.txt. Fix: nuke the cache
//       directory + re-run install.js with force_no_cache=true.
//   (c) the binary itself is corrupted post-extract -- dist/version is
//       missing or doesn't match the package's version. Treated same as (b).
const pathTxt = join(electronModule, 'path.txt');
const installJs = join(electronModule, 'install.js');
const distVersion = join(electronModule, 'dist', 'version');

function electronBinaryHealthy() {
  if (!existsSync(pathTxt)) return false;
  if (!existsSync(distVersion)) return false;
  // path.txt points at Electron.app/Contents/MacOS/Electron on darwin
  try {
    const rel = readFileSync(pathTxt, 'utf8').trim();
    if (!existsSync(join(electronModule, 'dist', rel))) return false;
  } catch {
    return false;
  }
  return true;
}

if (existsSync(electronModule) && existsSync(installJs) && !electronBinaryHealthy()) {
  warn('electron binary missing or partial — attempting recovery');
  // Attempt 1: simple re-run of install.js (covers mode (a))
  run('node', ['install.js'], { cwd: electronModule, allowFail: true });

  if (!electronBinaryHealthy()) {
    // Attempt 2: cache is poisoned -- clear it + force a fresh download.
    const cacheDir = electronCacheDir();
    warn('install.js exited but binary still missing — clearing electron cache at ' + cacheDir);
    try {
      rmSync(cacheDir, { recursive: true, force: true });
      mkdirSync(cacheDir, { recursive: true });
    } catch (e) {
      warn('could not clear cache: ' + (e instanceof Error ? e.message : String(e)));
    }
    // Also nuke any partial extraction in dist/.
    try {
      rmSync(join(electronModule, 'dist'), { recursive: true, force: true });
    } catch {}
    run('node', ['install.js'], {
      cwd: electronModule,
      allowFail: false,
      env: { ...process.env, force_no_cache: 'true' },
    });
  }

  if (!electronBinaryHealthy()) {
    console.error(
      'electron binary still missing after cache-clear + force re-download.\n' +
        'Check network access to https://github.com/electron/electron/releases\n' +
        'Or set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ and retry.',
    );
    process.exit(1);
  }
  info('electron binary now in place — continuing');
}

// Step 3.6 -- brand the dev Dock name (macOS only).
//
// In a packaged build electron-builder writes CFBundleName=Heron, so the Dock
// shows the brand. But `pnpm dev:desktop` runs the raw `Electron.app` whose
// Info.plist says CFBundleName=Electron -- so the Dock tooltip / right-click
// menu / force-quit list all say "Electron", even though app.setName() already
// fixes the in-app menu bar. The ONLY thing macOS reads for the Dock identity
// is the running bundle's Info.plist, so we patch it here (idempotent) and
// re-apply the ad-hoc signature (editing Info.plist invalidates the seal; the
// binary has no hardened runtime so a plain `codesign --sign -` re-seals it
// instantly and macOS launches it cleanly).
function brandDevDockName() {
  if (nodePlatform() !== 'darwin') return;
  const appBundle = join(electronModule, 'dist', 'Electron.app');
  const plist = join(appBundle, 'Contents', 'Info.plist');
  if (!existsSync(plist)) return;
  let displayName = 'Heron';
  try {
    const brand = JSON.parse(readFileSync(join(ROOT, 'branding', 'brand.json'), 'utf8'));
    displayName = brand.displayName || brand.name || displayName;
  } catch {
    /* brand.json missing -- keep default */
  }
  try {
    const current = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleName', plist], {
      encoding: 'utf8',
    }).trim();
    if (current === displayName) return; // already branded -- nothing to do
  } catch {
    /* key missing -- fall through and add it */
  }
  const setKey = (key) => {
    try {
      execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${displayName}`, plist]);
    } catch {
      execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${displayName}`, plist]);
    }
  };
  try {
    setKey('CFBundleName');
    setKey('CFBundleDisplayName');
    execFileSync('codesign', ['--force', '--sign', '-', appBundle], { stdio: 'ignore' });
    info(`Dev Dock name set to "${displayName}"`);
  } catch (e) {
    warn('could not brand dev Dock name: ' + (e instanceof Error ? e.message : String(e)));
  }
}
brandDevDockName();

step(4, 'Launching SvelteKit dev server + Electron in parallel');
// Silence Electron's "Insecure Content-Security-Policy (unsafe-eval)" renderer
// warning -- in dev the CSP deliberately allows unsafe-eval because vite's HMR
// needs it. Production builds never set this and ship a CSP without unsafe-eval,
// so the real warning still fires where it matters. Dev-only, scoped to this
// spawned process tree.
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
console.log('  ' + '─'.repeat(60));
console.log('  Press Ctrl+C to stop both.');
console.log('  ' + '─'.repeat(60) + '\n');

try {
  await runParallel([
    { cmd: 'pnpm', args: ['dev'], cwd: UI, label: 'vite dev' },
    // Electron is the leader: quitting its window (Dock → Quit) ends the dev
    // session, so runParallel tears down vite too instead of leaving :5173
    // bound. The live-runner exits 0 when Electron quits (not on HMR restart).
    {
      cmd: 'npm',
      args: ['run', 'electron:start-live'],
      cwd: electronDir,
      label: 'electron live',
      leader: true,
    },
  ]);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
