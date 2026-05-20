/**
 * vitest.config.ts — REPO ROOT GUARD
 *
 * Vitest's real config lives in `ui/vitest.config.ts`. Invoking
 * `vitest` (or `pnpm exec vitest`, `npx vitest`, anything that lets
 * vitest auto-discover its config) from `/Users/home/career-ops/`
 * would otherwise find NO config (until this file existed) and
 * silently fall back to zero-config mode: no `$lib` alias, no setup
 * file, no workspace projects, no environment overrides. That produces
 * a 70%+ "phantom failure" rate that masks real test bugs and burns
 * iteration time hunting the wrong root cause.
 *
 * This file is intentionally a tripwire. Touching it loudly redirects
 * you to the canonical entry points, which all delegate into the `ui/`
 * workspace where the real config + project graph lives.
 *
 * Canonical entry points (use one):
 *   pnpm test                  # root → turbo → per-workspace vitest
 *   pnpm --filter ui test      # bypasses turbo, full suite
 *   pnpm --filter ui test:coverage
 *   cd ui && pnpm test         # workspace-local
 *
 * Anything that lets vitest auto-discover from the repo root trips
 * this throw.
 *
 * Removing or relaxing this guard requires a clear plan for catching
 * the wrong-cwd footgun another way -- bare documentation alone has
 * already proven insufficient at least once.
 */

throw new Error(
  [
    '',
    '  ⛔ vitest must not be invoked from the repo root.',
    '',
    '     The real config lives in `ui/vitest.config.ts`. Auto-discovery',
    '     from the repo root would otherwise fall back to zero-config mode',
    '     (no $lib alias, no setup file, no workspace projects) and report',
    '     a flood of phantom failures.',
    '',
    '     Use one of:',
    '       pnpm test                    (root — through turbo)',
    '       pnpm --filter ui test        (workspace direct)',
    '       pnpm --filter ui test:coverage',
    '       cd ui && pnpm test           (workspace-local)',
    '',
    '     See /Users/home/career-ops/vitest.config.ts header for why.',
    '',
  ].join('\n'),
);
