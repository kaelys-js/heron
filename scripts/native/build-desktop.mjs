#!/usr/bin/env node
/**
 * build-desktop — one-shot: full local desktop build → DMG / .exe / .AppImage.
 *
 * Runs the entire chain:
 *   1. Build SvelteKit (node adapter — embedded server)
 *   2. Build SvelteKit (static — WebView shell)
 *   3. Regenerate icons (idempotent — no-op if already current)
 *   4. Capacitor sync to electron/
 *   5. npm install in electron/
 *   6. Compile electron TS
 *   7. electron-builder make
 *
 * Output: ui/electron/dist/ with platform-appropriate artifacts.
 * On macOS: produces DMG (x64 + arm64). On Windows: NSIS .exe.
 * On Linux: AppImage + .deb.
 *
 * For SIGNED/notarized builds, set Apple secrets in env first (or run
 * `pnpm setup:secrets` which exports them to ~/.career-ops/native-env).
 */
import { step, run, ok, info, ROOT, UI } from './_lib.mjs';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const electronDir = join(UI, 'electron');

step(1, 'Applying brand (icons + configs from branding/brand.json)');
run('node', [join(ROOT, 'scripts/native/apply-brand.mjs')]);

step(2, 'Building SvelteKit (node adapter — embedded server)');
run('pnpm', ['build'], { cwd: UI });

step(3, 'Building SvelteKit (static — WebView shell)');
run('pnpm', ['build'], {
  cwd: UI,
  env: { CAPACITOR: '1', PUBLIC_CAPACITOR_BUILD: '1' },
});

step(4, 'Syncing Capacitor → Electron');
run('pnpm', ['exec', 'cap', 'sync', 'electron'], { cwd: UI });

step(5, 'Installing Electron deps');
run('npm', ['install', '--no-audit', '--no-fund'], { cwd: electronDir });

step(6, 'Compiling Electron TypeScript');
run('npm', ['run', 'build'], { cwd: electronDir });

step(7, 'Source signing env from ~/.career-ops/native-env');
const envFile = join(process.env.HOME || '', '.career-ops', 'native-env');
let signingEnv = {};
if (existsSync(envFile)) {
  const raw = readFileSync(envFile, 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^export\s+([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) signingEnv[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  ok(`signing env loaded (${Object.keys(signingEnv).length} vars)`);
} else {
  info(
    'no ~/.career-ops/native-env — building unsigned (Gatekeeper warning expected on first open)',
  );
}

step(8, 'electron-builder make');
run('npm', ['run', 'electron:make'], { cwd: electronDir, env: signingEnv });

step(9, 'Done');
const distDir = join(electronDir, 'dist');
ok(`artifacts in ${distDir}`);
run('ls', ['-lh', distDir], { allowFail: true });
