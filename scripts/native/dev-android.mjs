#!/usr/bin/env node
/**
 * dev-android — one-shot: build, sync, boot emulator, install, launch.
 *
 * Mirrors dev-ios.mjs but targets Android:
 *   1. Preflight — pnpm + JDK + ANDROID_HOME/SDK + adb on PATH
 *   2. Apply brand (idempotent — propagates branding/brand.json)
 *   3. Build the SvelteKit static shell (CAPACITOR=1)
 *   4. `cap sync android` (copies static build into the Android project)
 *   5. Start Vite dev server on :5173 in the background
 *   6. Pick an Android target — prefer a running emulator/device,
 *      else boot the newest available AVD
 *   7. `cap run android --target=<id> --no-sync --forwardPorts 5173:5173`
 *      — gradle build + install + launch; `adb reverse` makes the
 *      emulator's localhost:5173 hit the Mac's Vite server
 *
 * The WebView in the emulator hits 10.0.2.2 / localhost:5173 so
 * live-reload works as you edit Svelte files. Real device on same wifi
 * finds your Mac via Bonjour (NSD on Android).
 *
 * If `cap run android` fails (signing, missing SDK platform, gradle
 * heap, etc.) the script prints a helpful pointer rather than just
 * dying — Android tooling has dozens of failure modes.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { step, run, capture, which, ok, warn, info, UI, ROOT } from './_lib.mjs';

const androidDir = join(UI, 'android');

step(1, 'Preflight');
if (!which('pnpm')) {
  console.error('pnpm not found');
  process.exit(1);
}
if (!existsSync(androidDir)) {
  console.error('ui/android not found. Run `pnpm exec cap add android` first.');
  process.exit(1);
}
if (!which('java')) {
  console.error('Java not found. Install JDK 17+:');
  console.error('  macOS:   brew install --cask temurin@17');
  console.error('  Linux:   apt-get install openjdk-17-jdk');
  console.error('  Windows: winget install EclipseAdoptium.Temurin.17.JDK');
  process.exit(1);
}

// Locate the Android SDK. Capacitor + cap sync read these env vars to
// find the SDK; without them, gradle will fail with cryptic "SDK location
// not found" errors deep inside the build.
const sdkRoot = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
if (!sdkRoot) {
  console.error('ANDROID_HOME / ANDROID_SDK_ROOT not set.');
  console.error('Install Android Studio + SDK, then add to your shell rc:');
  console.error('  macOS/Linux:  export ANDROID_HOME="$HOME/Library/Android/sdk"');
  console.error('  Windows:      set ANDROID_HOME=%LOCALAPPDATA%\\Android\\Sdk');
  console.error('Then restart your shell.');
  process.exit(1);
}
if (!existsSync(sdkRoot)) {
  console.error(`ANDROID_HOME points to ${sdkRoot} but that directory does not exist.`);
  console.error('Install the SDK via Android Studio → SDK Manager, or run sdkmanager.');
  process.exit(1);
}
// Ensure platform-tools/adb are on PATH for the rest of the script.
const platformTools = join(sdkRoot, 'platform-tools');
const emulatorDir = join(sdkRoot, 'emulator');
if (existsSync(platformTools)) {
  process.env.PATH = `${platformTools}:${emulatorDir}:${process.env.PATH ?? ''}`;
}
if (!which('adb')) {
  console.error(`adb not on PATH. Expected at ${platformTools}/adb.`);
  console.error('Run: sdkmanager "platform-tools"');
  process.exit(1);
}
ok(`ANDROID_HOME = ${sdkRoot}`);

step(2, 'Applying brand (idempotent — propagates branding/brand.json)');
run('node', [join(ROOT, 'scripts/native/apply-brand.mjs')], { silent: true });

step(3, 'Building static shell for Capacitor');
run('pnpm', ['build'], {
  cwd: UI,
  env: { CAPACITOR: '1', PUBLIC_CAPACITOR_BUILD: '1' },
});

step(4, 'Syncing Android project');
run('pnpm', ['exec', 'cap', 'sync', 'android'], { cwd: UI });

step(5, 'Starting Vite dev server in background');
const dev = spawn('pnpm', ['dev'], {
  cwd: UI,
  stdio: 'inherit',
  env: process.env,
  detached: false,
});
ok(`vite dev started (pid ${dev.pid}) — waiting for it to bind :5173…`);

// Same wait-for-port pattern as dev-ios.mjs — the WebView hitting a
// closed port shows a blank/error screen.
async function waitForPort(port, host = '127.0.0.1', timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const sock = createConnection({ port, host });
      const cleanup = (v) => {
        sock.removeAllListeners();
        try {
          sock.destroy();
        } catch {}
        resolve(v);
      };
      sock.once('connect', () => cleanup(true));
      sock.once('error', () => cleanup(false));
      setTimeout(() => cleanup(false), 500);
    });
    if (ready) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const viteReady = await waitForPort(5173);
if (viteReady) {
  ok('vite is serving on :5173');
} else {
  warn('Vite did not bind :5173 within 30s — continuing anyway (app may show blank).');
}

step(6, 'Picking Android target (device or emulator)');
/** Reuse a running device/emulator if any; else boot the newest available AVD. */
function pickAndroidTarget() {
  // 1. Already-running device wins. `adb devices` lists serials of attached
  //    devices + booted emulators in the "online" state.
  try {
    const out = capture('adb', ['devices'], { allowFail: true });
    const lines = out.split('\n').slice(1); // skip header "List of devices attached"
    for (const line of lines) {
      const [serial, state] = line.split(/\s+/);
      if (serial && state === 'device') {
        ok(`reusing connected device/emulator: ${serial}`);
        return serial;
      }
    }
  } catch (err) {
    warn(`could not parse adb devices: ${err.message}`);
  }

  // 2. No live device — boot the newest available AVD.
  if (!which('emulator')) {
    warn('emulator binary not on PATH and no device connected.');
    warn(
      `Create an AVD via Android Studio → Device Manager, OR plug in a device with USB debugging.`,
    );
    return null;
  }
  try {
    const avdList = capture('emulator', ['-list-avds'], { allowFail: true })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (avdList.length === 0) {
      warn(
        'No AVDs found. Create one via Android Studio → Device Manager (recommend latest Pixel + API 34+).',
      );
      return null;
    }
    // Heuristic: prefer AVDs with the highest API level in the name.
    const sorted = avdList.sort((a, b) => {
      const apiA = parseInt(a.match(/API[_ -]?(\d+)/i)?.[1] ?? '0', 10);
      const apiB = parseInt(b.match(/API[_ -]?(\d+)/i)?.[1] ?? '0', 10);
      return apiB - apiA;
    });
    const pick = sorted[0];
    info(`booting AVD ${pick}…`);
    // `emulator` blocks until killed; detach so dev-android continues.
    const emu = spawn('emulator', ['-avd', pick, '-no-snapshot-save'], {
      stdio: 'ignore',
      detached: true,
    });
    emu.unref();
    // Wait up to 60s for adb to see the device.
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const out = capture('adb', ['devices'], { allowFail: true });
      const serial = out
        .split('\n')
        .slice(1)
        .map((l) => l.split(/\s+/))
        .find(([s, st]) => s && st === 'device')?.[0];
      if (serial) {
        ok(`emulator online: ${serial}`);
        return serial;
      }
      // Brief sleep — busy-loop would peg the CPU.
      const start = Date.now();
      while (Date.now() - start < 1000) {
        /* spin briefly */
      }
    }
    warn('emulator did not come online within 60s — try `adb devices` manually');
    return null;
  } catch (err) {
    warn(`could not boot AVD: ${err.message}`);
    return null;
  }
}

const targetId = pickAndroidTarget();

step(7, 'Building + installing + launching on Android target');
let launched = false;
if (targetId) {
  // --no-sync because step 4 already synced.
  // --forwardPorts 5173:5173 runs `adb reverse` so the emulator's
  // localhost:5173 maps to the Mac's Vite dev server. Without this,
  // the WebView would hit the emulator's own (empty) loopback.
  const result = run(
    'pnpm',
    [
      'exec',
      'cap',
      'run',
      'android',
      '--target',
      targetId,
      '--no-sync',
      '--forwardPorts',
      '5173:5173',
    ],
    { cwd: UI, allowFail: true },
  );
  if (result?.status === 0) {
    ok('app launched on Android target');
    launched = true;
  } else {
    warn(`cap run android failed (exit ${result?.status})`);
    warn('Common fixes:');
    warn('  • Gradle out of heap → ~/.gradle/gradle.properties: org.gradle.jvmargs=-Xmx4g');
    warn(
      '  • Missing SDK platform → Android Studio → SDK Manager → install API matching compileSdk',
    );
    warn('  • Stale build cache → cd ui/android && ./gradlew clean');
  }
}

if (!launched) {
  warn('Open ui/android in Android Studio to debug build errors interactively.');
}

info('');
info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
if (launched) {
  info('App is running on the Android target. Edit Svelte files — the');
  info('WebView hits localhost:5173 (forwarded via adb) so changes');
  info('hot-reload automatically.');
} else {
  info('Vite is still serving on :5173 — bring up an Android target +');
  info('rerun cap run android manually.');
}
info('Press Ctrl+C in this terminal to stop the dev server.');
info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Relay Ctrl+C to the dev server.
process.on('SIGINT', () => {
  dev.kill('SIGTERM');
  process.exit(0);
});
// Wait on the dev server.
await new Promise((resolve) => dev.on('exit', resolve));
