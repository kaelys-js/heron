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

// Deterministic IDs derived from the seed fixtures (parsers.ts urlId =
// md5(url).slice(0, 12)).
const ACME_URL = 'https://boards.greenhouse.io/acme/jobs/4099991';
const ACME_JOB_ID = createHash('md5').update(ACME_URL).digest('hex').slice(0, 12);

// Capture catalogue. Each tuple: [filename, route, viewport, theme].
// Routes resolve against the seeded demo profile (alex@demo.example).
const CAPTURES = [
  ['inbox-light.png', '/inbox', { width: 1440, height: 900 }, 'light'],
  ['inbox-dark.png', '/inbox', { width: 1440, height: 900 }, 'dark'],
  ['evaluation-light.png', '/job/' + ACME_JOB_ID, { width: 1440, height: 900 }, 'light'],
  ['evaluation-dark.png', '/job/' + ACME_JOB_ID, { width: 1440, height: 900 }, 'dark'],
  ['autopilot.png', '/autopilot', { width: 1440, height: 900 }, 'light'],
  ['patterns.png', '/patterns', { width: 1440, height: 900 }, 'light'],
  ['interview-prep.png', '/job/' + ACME_JOB_ID + '/prep', { width: 1440, height: 900 }, 'light'],
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
    // Wait for hydration. The splash screen hides itself once Svelte
    // mounts; the indicator we watch for is the splash being GONE
    // (the rocket-icon container is removed from the DOM, not just
    // hidden via opacity).
    try {
      await page.waitForFunction(
        () => {
          // The `#boot-fallback` element is the splash. The dismissal
          // sequence sets `data-hide=1`, fades out, then `.remove()`s
          // it from DOM after a 300ms transition. Wait until it's
          // either gone OR has data-hide set.
          const splash = document.getElementById('boot-fallback');
          if (splash && splash.getAttribute('data-hide') !== '1') {
            return false;
          }
          // Real content present?
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
  // Path 1: external dev server (caller manages lifecycle).
  if (BASE_URL_OVERRIDE) {
    if (!(await waitForServer(BASE_URL_OVERRIDE, 10_000))) {
      console.error(
        `::error::Dev server not reachable at ${BASE_URL_OVERRIDE}. Start it with \`pnpm dev\` first.`,
      );
      process.exit(2);
    }
    await captureAll(BASE_URL_OVERRIDE);
    return;
  }

  // Path 2: managed -- seed + boot + capture + teardown.
  //   - DB lives under tmpdir (HERON_DATA_DIR controls SQLite paths;
  //     the bypass requires it to be tmpdir-scoped).
  //   - FS data lives under repo-local `data/users/demo-screenshots/`
  //     because profile-paths.ts resolves against the repo ROOT, not
  //     HERON_DATA_DIR. The `demo-screenshots` user ID is reserved.
  //     Teardown rm -rf's that subtree.
  // tmpDataDir: per-run when fresh, stable across runs when --skip-seed
  // is in play so the DB rows seeded once can be re-used. Either way it
  // sits under os.tmpdir(), which satisfies the screenshot-bypass's
  // double-gate (HERON_DATA_DIR must be tmpdir-scoped).
  const tmpDataDir = SKIP_SEED
    ? join(tmpdir(), 'heron-screenshots-cache')
    : mkdtempSync(join(tmpdir(), 'heron-screenshots-'));
  if (SKIP_SEED) mkdirSync(tmpDataDir, { recursive: true });
  const seedFsRoot = join(ROOT, 'data');
  const demoUserDir = join(seedFsRoot, 'users', 'demo-screenshots');
  const buildDir = join(ROOT, 'ui', 'build');
  try {
    // ── Seed (cacheable via --skip-seed) ─────────────────────────────
    const seedAlreadyExists = existsSync(demoUserDir);
    if (SKIP_SEED && seedAlreadyExists) {
      console.log(`--skip-seed: reusing ${demoUserDir}`);
    } else {
      if (SKIP_SEED && !seedAlreadyExists) {
        console.log('--skip-seed requested but no prior seed found -- seeding anyway.');
      }
      console.log(`Seeding demo data: DB=${tmpDataDir}, FS=${demoUserDir}`);
      await new Promise((res, rej) => {
        const p = spawn('node', ['scripts/system/seed-demo-data.mjs'], {
          cwd: ROOT,
          env: {
            ...process.env,
            HERON_DATA_DIR: tmpDataDir,
            HERON_SEED_DATA_ROOT: seedFsRoot,
          },
          stdio: 'inherit',
        });
        p.on('exit', (code) => (code === 0 ? res() : rej(new Error('seed exit ' + code))));
        p.on('error', rej);
      });
    }

    // Pick a free-ish port so concurrent invocations don't collide.
    const port = 4173 + Math.floor(Math.random() * 100);
    const baseUrl = 'http://127.0.0.1:' + port;

    // ── Build (turbo-cached + cacheable via --skip-build) ────────────
    // Turbo hashes ui/src/**, vite.config.ts, package.json, lockfile,
    // etc. If nothing material changed, this is an instant cache hit.
    // HERON_DATA_DIR is intentionally NOT in the build env -- it's a
    // runtime-only var, and pinning it out of the build environment
    // keeps turbo's hash stable across runs (each run uses a different
    // tmpdir for HERON_DATA_DIR, which would otherwise invalidate the
    // cache if it were a declared input).
    const buildAlreadyExists = existsSync(buildDir);
    if (SKIP_BUILD && buildAlreadyExists) {
      console.log(`--skip-build: reusing ${buildDir}`);
    } else {
      if (SKIP_BUILD && !buildAlreadyExists) {
        console.log('--skip-build requested but no prior build found -- building anyway.');
      }
      console.log('Building dashboard for preview (turbo-cached)...');
      await new Promise((res, rej) => {
        const p = spawn('pnpm', ['exec', 'turbo', 'run', 'build', '--filter=ui'], {
          cwd: ROOT,
          // Deliberately omit HERON_DATA_DIR from build env -- see comment above.
          env: process.env,
          stdio: 'inherit',
        });
        p.on('exit', (code) => (code === 0 ? res() : rej(new Error('build exit ' + code))));
        p.on('error', rej);
      });
    }

    console.log(`Booting vite preview on ${baseUrl}...`);
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
          // The capture pipeline never makes an outbound API call.
          ANTHROPIC_API_KEY:
            process.env.ANTHROPIC_API_KEY ?? 'sk-ant-screenshot-placeholder-never-fires',
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
      await captureAll(baseUrl);
    } finally {
      try {
        server.kill('SIGTERM');
      } catch {
        /* best-effort */
      }
    }
  } finally {
    if (PRESERVE_TMP) {
      console.log(`PRESERVE_TMP=1 -- keeping ${tmpDataDir} + ${demoUserDir} for inspection.`);
    } else if (SKIP_SEED) {
      // Keep the cache for the next --skip-seed run. Without this, the
      // very thing --skip-seed is supposed to skip would have to be
      // redone every time. Explicit log so the user knows what's left.
      console.log(`--skip-seed: preserving ${tmpDataDir} + ${demoUserDir} for re-use.`);
    } else {
      rmSync(tmpDataDir, { recursive: true, force: true });
      rmSync(demoUserDir, { recursive: true, force: true });
    }
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error('::error::Screenshot capture failed:', err);
  process.exit(1);
});
