#!/usr/bin/env node
/**
 * Capture iOS App Store screenshots against a seeded screenshot-mode backend.
 *
 * The simulator can't render the dashboard from nothing -- BackendBootGuard
 * gates every screen until a backend resolves, and the client auth gate bounces
 * to /login. So we boot the SAME seeded screenshot-mode server the web capture
 * uses (`capture-screenshots.mjs --serve`: seed demo data + turbo build +
 * `vite preview` on :4173 with HERON_SCREENSHOT_MODE=1 + a tmpdir data dir ->
 * server-side auth bypass + seeded content), then run `fastlane screenshots`
 * with HERON_SCREENSHOT_BACKEND pointed at it. ScreenshotUITests forwards that
 * to the app (launch arg + env); BridgeViewController injects it as
 * window.__HERON_SCREENSHOTS__ + marks the client authed, so resolveBackend
 * short-circuits to the seeded server and the real dashboard paints.
 *
 * Usage: pnpm screenshots:ios   (from a macOS host with Xcode + a booted/avail sim)
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const UI = resolve(ROOT, 'ui');
const PORT = 4173;
// `localhost` (not 127.0.0.1): Info.plist's ATS has an explicit
// NSExceptionDomains entry for the `localhost` domain allowing insecure HTTP,
// so the WKWebView can fetch the seeded backend over plain http. The bare IP
// only rides NSAllowsLocalNetworking, which is flakier for loopback.
const BACKEND = `http://localhost:${PORT}`;

function run(cmd, args, opts) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
    p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${cmd} exited ${code}`))));
    p.on('error', rej);
  });
}

async function waitForHealth(url, timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url + '/api/health');
      if (r.ok) return true;
    } catch {
      /* server not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  // Build the Capacitor static shell + sync it into the iOS project WITHOUT
  // CAPACITOR_SERVER_URL. A prior `pnpm dev:ios --live` session bakes a
  // server.url (the Mac's LAN-IP vite server) into ios/App/App/capacitor.config.json,
  // which makes the WebView try to load the APP from that now-dead dev server --
  // the boot watchdog then fires and the native BootFailureView shows instead
  // of the dashboard. A clean sync drops server.url so the app loads its
  // bundled files (heron://localhost) and only the API is fetched from the
  // seeded backend (injected via window.__HERON_SCREENSHOTS__).
  console.log('[ios-screenshots] building Capacitor static shell…');
  await run('pnpm', ['build:static'], {
    cwd: UI,
    env: { ...process.env, CAPACITOR: '1', PUBLIC_CAPACITOR_BUILD: '1' },
  });
  console.log('[ios-screenshots] syncing iOS project (clean, no server.url)...');
  await run('pnpm', ['exec', 'cap', 'sync', 'ios'], {
    cwd: UI,
    // Explicitly drop CAPACITOR_SERVER_URL so capacitor.config.ts omits the
    // server.url key (bundled static is what the screenshot build needs).
    env: { ...process.env, CAPACITOR_SERVER_URL: '' },
  });

  console.log('[ios-screenshots] booting seeded screenshot-mode server (seed + build + serve)…');
  const server = spawn('node', ['scripts/system/capture-screenshots.mjs', '--serve'], {
    cwd: ROOT,
    env: process.env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  let serverExited = false;
  server.on('exit', () => {
    serverExited = true;
  });

  try {
    if (!(await waitForHealth(BACKEND))) {
      throw new Error(`screenshot-mode server never became reachable on ${BACKEND}`);
    }
    console.log(`[ios-screenshots] server up at ${BACKEND}; running fastlane screenshots…`);
    await run('bundle', ['exec', 'fastlane', 'screenshots'], {
      cwd: resolve(ROOT, 'ui/ios/App'),
      env: { ...process.env, HERON_SCREENSHOT_BACKEND: BACKEND },
    });
    console.log('[ios-screenshots] done.');
  } finally {
    if (!serverExited) {
      try {
        server.kill('SIGTERM');
      } catch {
        /* best-effort teardown */
      }
    }
  }
}

main().catch((err) => {
  console.error('[ios-screenshots] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
