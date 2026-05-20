#!/usr/bin/env node
/** Capture README screenshots. Seeds an isolated demo profile under
 *  `os.tmpdir()/heron-screenshots-{pid}/`, boots a `vite preview`-style
 *  dev server with HERON_SCREENSHOT_MODE=1 (so hooks.server.ts injects
 *  the double-gated synthetic user), and walks Playwright through the
 *  canonical routes.
 *
 *  Usage:
 *    pnpm screenshots                    # auto: seeds, builds (turbo-cached),
 *                                        # boots, captures all in parallel
 *    pnpm screenshots --skip-build       # reuse existing ui/build/
 *    pnpm screenshots --skip-seed        # reuse data/users/demo-screenshots/
 *    BASE_URL=http://... pnpm screenshots # capture against existing server
 *    PRESERVE_TMP=1      pnpm screenshots # keep tmpdir for debugging
 *
 *  Performance: warm path (turbo cache hit + parallel captures) targets
 *  < 10s. Cold path (full build) is ~60-80s, dominated by Vite build.
 *  The build runs through turbo so identical UI source = instant cache
 *  hit on re-run. HERON_DATA_DIR is intentionally NOT in the build env
 *  (it's a runtime-only var) so turbo's hash stays stable across runs.
 *
 *  Output: docs/screenshots/*.png (PNG-8 via Playwright's default codec).
 *  CI workflow: .github/workflows/screenshots-refresh.yml. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const OUT = join(ROOT, 'docs', 'screenshots');

const PRESERVE_TMP = process.env.PRESERVE_TMP === '1';
// Fast-path flags. `--skip-build` reuses the existing `ui/build/`
// directory (assumes a recent build is on disk). `--skip-seed`
// reuses `data/users/demo-screenshots/` from a prior run. Both fall
// back to a normal flow if the prerequisite isn't present.
const SKIP_BUILD = process.argv.includes('--skip-build');
const SKIP_SEED = process.argv.includes('--skip-seed');
// Daemon mode. `--serve` keeps the vite preview process alive after
// the first capture so subsequent `pnpm screenshots` calls connect to
// the running daemon at `http://127.0.0.1:4173` instead of spawning
// a fresh preview each time. Cuts iteration cost from ~37s to ~10s.
const SERVE = process.argv.includes('--serve');
const DAEMON_PORT = 4173;
const DAEMON_URL = `http://127.0.0.1:${DAEMON_PORT}`;

// Deterministic IDs derived from the seed fixtures (parsers.ts urlId =
// md5(url).slice(0, 12)).
const ACME_URL = 'https://boards.greenhouse.io/acme/jobs/4099991';
const ACME_JOB_ID = createHash('md5').update(ACME_URL).digest('hex').slice(0, 12);

// Capture catalogue. Each tuple: [filename, route, viewport, theme].
// Routes resolve against the seeded demo profile (alex@demo.example).
// Curated to 5 entries -- one per major surface area, balanced light/dark
// on inbox where the visual difference matters most, and one mobile view.
// Dropped evaluation-dark / patterns / interview-prep because:
//   • the README only had real estate for 5 hero shots,
//   • evaluation's dark variant duplicates info the light shot conveys,
//   • patterns + interview-prep both depend on accumulated history that
//     a fresh seed can't represent honestly.
const CAPTURES = [
  ['inbox-light.png', '/inbox', { width: 1440, height: 900 }, 'light'],
  ['inbox-dark.png', '/inbox', { width: 1440, height: 900 }, 'dark'],
  ['evaluation.png', '/job/' + ACME_JOB_ID, { width: 1440, height: 900 }, 'light'],
  ['autopilot.png', '/autopilot', { width: 1440, height: 900 }, 'light'],
  // iPhone 16 Pro viewport
  ['mobile-inbox.png', '/inbox', { width: 393, height: 852 }, 'light'],
];

const BASE_URL_OVERRIDE = process.env.BASE_URL;

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url + '/api/health');
      if (r.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Capture a single screenshot. Owns its own browser context so this
 *  function is safe to run concurrently across CAPTURES via Promise.all. */
async function captureOne(browser, baseUrl, [filename, route, viewport, theme]) {
  const ctx = await browser.newContext({
    viewport,
    colorScheme: theme,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  try {
    try {
      await page.goto(baseUrl + route, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    } catch (err) {
      console.error(`::warning::nav to ${route} failed: ${err.message}`);
    }
    // Wait for hydration. Primary signal is the
    // `documentElement.dataset.appReady = '1'` flag set by `+layout.svelte`
    // immediately after the boot-fallback splash dismissal sequence
    // commits. That marker is exact + race-free. We keep the legacy
    // heuristic (splash gone + a content selector present) as a fallback
    // so the script still works against older builds of the dashboard
    // that don't carry the marker yet.
    try {
      await page.waitForFunction(
        () => {
          if (document.documentElement.dataset.appReady === '1') return true;
          // Fallback path -- pre-marker builds.
          const splash = document.getElementById('boot-fallback');
          if (splash && splash.getAttribute('data-hide') !== '1') {
            return false;
          }
          return !!document.querySelector(
            'a[href="/inbox"], a[href="/pipeline"], main h1, main h2',
          );
        },
        { timeout: 30_000, polling: 200 },
      );
    } catch {
      /* fall through -- still try to capture even if heuristic missed */
    }
    // 300ms boot-fallback fade + 200ms safety margin + extra time for
    // mobile (the smaller layout reflows once after hydration).
    await page.waitForTimeout(viewport.width < 600 ? 3000 : 1500);
    const path = join(OUT, filename);
    await page.screenshot({ path, fullPage: false, timeout: 60_000, animations: 'disabled' });
    console.log(`  - ${filename} (${theme}, ${viewport.width}x${viewport.height})`);
  } finally {
    await ctx.close();
  }
}

async function captureAll(baseUrl) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('::error::playwright not installed. Run `pnpm install` first.');
    process.exit(1);
  }
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  console.log(`Capturing ${CAPTURES.length} screenshots in parallel from ${baseUrl} -> ${OUT}/`);
  const browser = await chromium.launch({ headless: true });
  try {
    // Each capture owns its own context, so they don't share state and
    // can run concurrently. Wall time = slowest single capture, not the
    // sum -- huge win for warm-path iteration.
    await Promise.all(CAPTURES.map((cap) => captureOne(browser, baseUrl, cap)));
  } finally {
    await browser.close();
  }
}

async function main() {
  const tStart = Date.now();
  const phase = (label) => console.log(`[screenshots] ${label} (+${Date.now() - tStart}ms)`);
  // Path 1: external dev server (caller manages lifecycle).
  if (BASE_URL_OVERRIDE) {
    if (!(await waitForServer(BASE_URL_OVERRIDE, 10_000))) {
      console.error(
        `::error::Dev server not reachable at ${BASE_URL_OVERRIDE}. Start it with \`pnpm dev\` first.`,
      );
      process.exit(2);
    }
    phase('using external base url');
    await captureAll(BASE_URL_OVERRIDE);
    phase('captures done');
    return;
  }

  // Path 1.5: persistent daemon detection. If a previous
  // `pnpm screenshots:serve` is running on :4173 we use it directly.
  // Iteration cost drops to ~10s (just the captures).
  if (!SERVE && (await waitForServer(DAEMON_URL, 500))) {
    phase('found running daemon on :4173');
    await captureAll(DAEMON_URL);
    phase('captures done');
    return;
  }

  // Path 2: managed -- seed + boot + capture + teardown.
  //
  // Single tmpdir for BOTH the DB (auth.db / app.db / activity.jsonl) AND
  // per-user FS layout (cv.md / profile.yml / etc.). After the DATA_ROOT
  // unification in files.ts, every server-side path resolves under
  // HERON_DATA_DIR -- splitting DB vs FS would have the webServer reading
  // FS files in tmpdir that the seed wrote to the repo, sending every
  // request through the fresh-install redirect chain.
  //
  // tmpDataDir: per-run when fresh, stable across runs when --skip-seed
  // is in play so the seeded state can be re-used. Either way it sits
  // under os.tmpdir(), which satisfies the screenshot-bypass's double-gate
  // (HERON_DATA_DIR must be tmpdir-scoped).
  const tmpDataDir = SKIP_SEED
    ? join(tmpdir(), 'heron-screenshots-cache')
    : mkdtempSync(join(tmpdir(), 'heron-screenshots-'));
  if (SKIP_SEED) mkdirSync(tmpDataDir, { recursive: true });
  const demoUserDir = join(tmpDataDir, 'users', 'demo-screenshots');
  const buildDir = join(ROOT, 'ui', 'build');
  try {
    // Run seed + build CONCURRENTLY. They touch independent paths
    // (tmpdir DB + repo build dir respectively), so serializing them
    // wasted ~2-3s on every cold run. Promise.all means whichever is
    // slower dictates the wall clock.
    const seedPromise = (async () => {
      const seedAlreadyExists = existsSync(demoUserDir);
      if (SKIP_SEED && seedAlreadyExists) {
        phase(`seed: reusing ${demoUserDir}`);
        return;
      }
      if (SKIP_SEED && !seedAlreadyExists) {
        console.log('--skip-seed requested but no prior seed found -- seeding anyway.');
      }
      phase('seed: starting');
      await new Promise((res, rej) => {
        const p = spawn('node', ['scripts/system/seed-demo-data.mjs'], {
          cwd: ROOT,
          env: {
            ...process.env,
            HERON_DATA_DIR: tmpDataDir,
          },
          stdio: 'inherit',
        });
        p.on('exit', (code) => (code === 0 ? res() : rej(new Error('seed exit ' + code))));
        p.on('error', rej);
      });
      phase('seed: done');
    })();

    // ── Build (turbo-cached + cacheable via --skip-build) ────────────
    // Turbo hashes ui/src/**, vite.config.ts, package.json, lockfile,
    // etc. If nothing material changed, this is an instant cache hit.
    // HERON_DATA_DIR is intentionally NOT in the build env -- it's a
    // runtime-only var, and pinning it out of the build environment
    // keeps turbo's hash stable across runs (each run uses a different
    // tmpdir for HERON_DATA_DIR, which would otherwise invalidate the
    // cache if it were a declared input).
    const buildPromise = (async () => {
      const buildAlreadyExists = existsSync(buildDir);
      if (SKIP_BUILD && buildAlreadyExists) {
        phase(`build: reusing ${buildDir}`);
        return;
      }
      if (SKIP_BUILD && !buildAlreadyExists) {
        console.log('--skip-build requested but no prior build found -- building anyway.');
      }
      phase('build: starting (turbo-cached)');
      await new Promise((res, rej) => {
        const p = spawn('pnpm', ['exec', 'turbo', 'run', 'build', '--filter=ui'], {
          cwd: ROOT,
          env: process.env,
          stdio: 'inherit',
        });
        p.on('exit', (code) => (code === 0 ? res() : rej(new Error('build exit ' + code))));
        p.on('error', rej);
      });
      phase('build: done');
    })();

    await Promise.all([seedPromise, buildPromise]);

    // Daemon mode uses the standard port so other invocations can
    // detect it; one-shot mode uses a random port to avoid collisions
    // with a developer's running `pnpm dev` / preview server.
    const port = SERVE ? DAEMON_PORT : 4173 + Math.floor(Math.random() * 100);
    const baseUrl = 'http://127.0.0.1:' + port;

    phase(`booting vite preview on ${baseUrl}`);
    const server = spawn(
      'pnpm',
      ['--filter', 'ui', 'exec', 'vite', 'preview', '--port', String(port), '--host', '127.0.0.1'],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          HERON_DATA_DIR: tmpDataDir,
          HERON_SCREENSHOT_MODE: '1',
          // isFreshInstall() also checks env for ANTHROPIC_API_KEY -- supply
          // a placeholder so the layout doesn't redirect to /onboarding.
          // GEMINI_API_KEY likewise silences the inbox "Gemini key not set"
          // banner. The capture pipeline never makes an outbound API call
          // (HERON_SCREENSHOT_MODE gates every spawn-y boot path).
          ANTHROPIC_API_KEY:
            process.env.ANTHROPIC_API_KEY ?? 'sk-ant-screenshot-placeholder-never-fires',
          GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? 'gem-screenshot-placeholder-never-fires',
          BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? 'a'.repeat(64),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let serverLog = '';
    server.stdout?.on('data', (c) => {
      serverLog += c.toString();
    });
    server.stderr?.on('data', (c) => {
      serverLog += c.toString();
    });

    try {
      if (!(await waitForServer(baseUrl, 60_000))) {
        console.error('::error::preview server never became reachable. Tail:');
        console.error(serverLog.slice(-2000));
        process.exit(3);
      }
      phase('preview reachable');
      if (SERVE) {
        // Daemon mode: hand control back to the caller. They run
        // `pnpm screenshots` in another terminal to capture against
        // this preview. Ctrl-C closes the daemon.
        console.log(
          `\n[screenshots:serve] ready at ${baseUrl}\n[screenshots:serve] run \`pnpm screenshots\` from another terminal to capture (much faster than the one-shot path)\n[screenshots:serve] Ctrl-C to stop\n`,
        );
        await new Promise((resolve) => {
          process.once('SIGINT', resolve);
          process.once('SIGTERM', resolve);
        });
      } else {
        await captureAll(baseUrl);
        phase('captures done');
      }
    } finally {
      try {
        server.kill('SIGTERM');
      } catch {
        /* best-effort */
      }
    }
  } finally {
    if (PRESERVE_TMP) {
      console.log(`PRESERVE_TMP=1 -- keeping ${tmpDataDir} (contains FS + DB) for inspection.`);
    } else if (SKIP_SEED) {
      // Keep the cache for the next --skip-seed run. Without this, the
      // very thing --skip-seed is supposed to skip would have to be
      // redone every time. Explicit log so the user knows what's left.
      console.log(`--skip-seed: preserving ${tmpDataDir} (contains FS + DB) for re-use.`);
    } else {
      rmSync(tmpDataDir, { recursive: true, force: true });
    }
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error('::error::Screenshot capture failed:', err);
  process.exit(1);
});
