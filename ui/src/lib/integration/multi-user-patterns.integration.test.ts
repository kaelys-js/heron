/**
 * Multi-user safety — structural pattern guards (F9–F30 regression suite).
 *
 * Catches the easy-to-regress anti-patterns that the F9–F30 audit
 * surfaced. Each test greps the codebase for the unsafe pattern and
 * asserts only an allowlisted set of files contains it.
 *
 * Patterns enforced:
 *   1. No bare `env: { ...process.env }` in spawn() / execFile() —
 *      every server-side spawn must use `userContextEnv()` so the child
 *      inherits `CAREER_OPS_USER_ID` from the parent's ALS scope (F13).
 *   2. No module-level `let cached: AutopilotConfig` (or similar
 *      single-instance Config singletons) — they cross users (F9).
 *   3. Every `installBusListener` callback that touches user data must
 *      reference `ev.userId` (F11).
 *   4. Background daemons (setInterval at module load) must NOT call
 *      job functions directly — they must go through `runById()` so the
 *      registry's `perUser: true` fan-out fires (F15).
 *
 * Mechanism: regex-on-source rather than runtime. The F9–F30 fixes
 * landed alongside this file; future regressions are caught at CI time
 * before they ship.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const SERVER_ROOT = path.join(REPO_ROOT, 'ui/src/lib/server');

/** ──────────────────────────────────────────────────────────────────────
 *  F13 — spawn-env injection
 *  ──────────────────────────────────────────────────────────────────── */
describe('Multi-user — every spawn() injects userContextEnv (F13 guard)', () => {
  it('no bare `env: { ...process.env }` in server modules + api routes', () => {
    // Extended in the final audit loop — `routes/api/**` had 4 missed
    // spawn sites because the original grep only covered lib/server/.
    // Now the pattern guard sweeps both trees.
    const ROUTES_API_ROOT = path.join(REPO_ROOT, 'ui/src/routes/api');
    const hits = execSync(
      // -E for extended regex, -l doesn't help here because we want line context
      // Match `env: { ...process.env }` (and the variant without spaces).
      'grep -rln --include="*.ts" "env: { ...process.env }\\|env: process\\.env\\>" ' +
        SERVER_ROOT +
        ' ' +
        ROUTES_API_ROOT +
        ' || true',
      { encoding: 'utf8' },
    )
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((p) => !p.endsWith('.test.ts'))
      .map((abs) => path.relative(REPO_ROOT, abs));

    expect(
      hits,
      `Spawn sites must use \`env: userContextEnv()\` so the child inherits CAREER_OPS_USER_ID.\nOffending files:\n  ${hits.join(
        '\n  ',
      )}`,
    ).toEqual([]);
  });

  it('userContextEnv is exported from user-context.ts', () => {
    const src = fs.readFileSync(path.join(SERVER_ROOT, 'user-context.ts'), 'utf8');
    expect(src).toMatch(/export\s+function\s+userContextEnv\s*\(/);
    // The helper must inject CAREER_OPS_USER_ID (the contract the
    // scripts-side `lib-profiles.mjs::resolveUserArg()` expects).
    expect(src).toContain('CAREER_OPS_USER_ID');
  });
});

/** ──────────────────────────────────────────────────────────────────────
 *  F9 — no module-level config singletons crossing users
 *  ──────────────────────────────────────────────────────────────────── */
describe('Multi-user — no module-singleton user config caches (F9 guard)', () => {
  // Files that legitimately have module-scope state that's NOT
  // user-data (e.g. an HMR-idempotence flag, a service-wide counter).
  // Adding to this list requires a PR-review confirmation that the
  // state is genuinely user-independent.
  const ALLOWED_FILES = new Set<string>([
    // tick / setInterval handles — not user state
    'ui/src/lib/server/autopilot.ts',
    'ui/src/lib/server/jobs/scan-email-imap.job.ts',
    'ui/src/lib/server/jobs/interview-reminder.job.ts',
    'ui/src/lib/server/jobs/auto-merge-batch.ts',
    // bus emitter + listener state
    'ui/src/lib/server/events.ts',
    // SSE subscriber set — keyed by client conn, not user
    'ui/src/lib/server/sse-broker.ts',
  ]);

  it('no `let cached: <Config>` or `let _cache: <Config>` at module scope', () => {
    // grep for `let cached:`, `let _cache:`, `let _config:` patterns
    // followed by a type that LOOKS like a Config (capital first letter,
    // ends in `Config`/`State`/`Settings`).
    const hits = execSync(
      'grep -rln --include="*.ts" -E "^(let|var)\\s+(cached|_cache|_config|configCache)\\s*:?\\s*[A-Z][a-zA-Z]*(Config|State|Settings)" ' +
        SERVER_ROOT +
        ' || true',
      { encoding: 'utf8' },
    )
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((p) => !p.endsWith('.test.ts'))
      .map((abs) => path.relative(REPO_ROOT, abs))
      .filter((rel) => !ALLOWED_FILES.has(rel));

    expect(
      hits,
      `Module-level Config singletons cross users. Use a Map<userId, T> keyed by currentUserIdOrDefault() instead.\nOffending files:\n  ${hits.join(
        '\n  ',
      )}`,
    ).toEqual([]);
  });

  it('autopilot.ts uses Map<userId, AutopilotConfig> not a single cached singleton', () => {
    const src = fs.readFileSync(path.join(SERVER_ROOT, 'autopilot.ts'), 'utf8');
    // F9 specifically: no `let cached: AutopilotConfig` line. The
    // post-fix file has `const cache = new Map<string, AutopilotConfig>()`.
    expect(src).not.toMatch(/^\s*let\s+cached\s*:\s*AutopilotConfig/m);
    expect(src).toMatch(/new\s+Map<\s*string,\s*AutopilotConfig\s*>/);
  });
});

/** ──────────────────────────────────────────────────────────────────────
 *  F11 — bus listeners scope to ev.userId
 *  ──────────────────────────────────────────────────────────────────── */
describe('Multi-user — bus listeners scope to ev.userId (F11 guard)', () => {
  it('auto-queue + auto-interview-prep both reference ev.userId + runAsUser', () => {
    for (const rel of [
      'ui/src/lib/server/jobs/auto-queue.ts',
      'ui/src/lib/server/jobs/auto-interview-prep.ts',
    ]) {
      const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      expect(src, rel + ' must read ev.userId').toMatch(/\bev\.userId\b/);
      expect(src, rel + ' must wrap work in runAsUser(...)').toMatch(/\brunAsUser\(/);
    }
  });

  it('no installBusListener handler calls loadAllJobs/markStatus without ev.userId', () => {
    // Heuristic: find files containing both `installBusListener(` and
    // `loadAllJobs(` or `markStatus(`. Assert each one references
    // `ev.userId`.
    const candidates = execSync(
      'grep -rln --include="*.ts" "installBusListener(" ' + SERVER_ROOT + ' || true',
      { encoding: 'utf8' },
    )
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((p) => !p.endsWith('.test.ts'));

    const offenders: string[] = [];
    for (const abs of candidates) {
      const src = fs.readFileSync(abs, 'utf8');
      const touchesUserData = /\bloadAllJobs\(|\bmarkStatus\(|\bgenerateInterviewPrep\(/.test(src);
      if (!touchesUserData) continue;
      if (!/\bev\.userId\b/.test(src)) {
        offenders.push(path.relative(REPO_ROOT, abs));
      }
    }
    expect(
      offenders,
      `Bus listeners that touch user data MUST scope by ev.userId.\nOffending files:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});

/** ──────────────────────────────────────────────────────────────────────
 *  F15 — daemons route through runById (registry fan-out)
 *  ──────────────────────────────────────────────────────────────────── */
describe('Multi-user — setInterval daemons in jobs/ go through runById (F15 guard)', () => {
  it('interview-reminder daemon calls runById, not the raw function', () => {
    const src = fs.readFileSync(path.join(SERVER_ROOT, 'jobs/interview-reminder.job.ts'), 'utf8');
    // Pre-F15 the daemon called `runInterviewReminder()` directly from
    // setInterval. Post-fix it imports `runById` and fires that.
    expect(src).toMatch(/runById\(\s*['"]interview-reminder['"]\s*\)/);
  });

  it('scan-email-imap daemon fans out across all schedulable users via runAsUser (F14/F19/F27)', () => {
    // Pre-fix the daemon ran only under the OWNER (getOwnerUserId).
    // Post-fix it iterates listSchedulableUsers() so every user's
    // gmail-imap mailbox gets polled under their own ALS context.
    const src = fs.readFileSync(path.join(SERVER_ROOT, 'jobs/scan-email-imap.job.ts'), 'utf8');
    expect(src).toMatch(/\blistSchedulableUsers\(/);
    expect(src).toMatch(/\brunAsUser\(/);
  });
});

/** ──────────────────────────────────────────────────────────────────────
 *  F17 — apply-counter is per-user
 *  ──────────────────────────────────────────────────────────────────── */
describe('Multi-user — apply-counter is per-user (F17 guard)', () => {
  it('apply-counter.ts resolves via userSharedPath, not ROOT/data/apply-counter.json', () => {
    const src = fs.readFileSync(path.join(SERVER_ROOT, 'apply-counter.ts'), 'utf8');
    expect(src).toContain("userSharedPath('apply-counter')");
    // The legacy global-file path must be gone.
    expect(src).not.toMatch(/path\.join\(ROOT,\s*['"]data['"],\s*['"]apply-counter\.json['"]\)/);
  });
});

/** ──────────────────────────────────────────────────────────────────────
 *  F10 — autopilot scheduler tick fans out per user
 *  ──────────────────────────────────────────────────────────────────── */
describe('Multi-user — autopilot tick fans out across users (F10 guard)', () => {
  it('tick() iterates listSchedulableUsers + wraps in runAsUser', () => {
    const src = fs.readFileSync(path.join(SERVER_ROOT, 'autopilot.ts'), 'utf8');
    // The tick body must call listSchedulableUsers AND runAsUser.
    expect(src).toMatch(/\blistSchedulableUsers\(/);
    expect(src).toMatch(/\brunAsUser\(/);
    // Specifically: tick() should be async (signature change from F10).
    expect(src).toMatch(/async\s+function\s+tick\s*\(/);
  });
});

/** ──────────────────────────────────────────────────────────────────────
 *  F12 — circuit breaker per-user state
 *  ──────────────────────────────────────────────────────────────────── */
describe('Multi-user — circuit breaker per-user state (F12 guard)', () => {
  it('autopilot-circuit-breaker.ts uses Map for consecutiveLinkedInFailures', () => {
    const src = fs.readFileSync(path.join(SERVER_ROOT, 'autopilot-circuit-breaker.ts'), 'utf8');
    // Pre-F12: `let consecutiveLinkedInFailures = 0`. Post-fix:
    // `const consecutiveLinkedInFailures = new Map<string, number>()`.
    // Anchor to start-of-line + skip comment prefixes (` * ` block
    // comments mention the pre-fix pattern for context).
    expect(src).not.toMatch(/^\s*let\s+consecutiveLinkedInFailures\b/m);
    expect(src).toMatch(/consecutiveLinkedInFailures\s*=\s*new Map<\s*string,\s*number\s*>/);
    // trip() should take a userId
    expect(src).toMatch(/function\s+trip\s*\(\s*userId\s*:\s*string/);
  });
});

/** ──────────────────────────────────────────────────────────────────────
 *  F14/F30 — IMAP reactor in-process (no HTTP roundtrip)
 *  ──────────────────────────────────────────────────────────────────── */
describe('Multi-user — IMAP reactor in-process (F14/F30 guard)', () => {
  it('scan-email-imap.mjs no longer POSTs to /api/email/react', () => {
    const src = fs.readFileSync(path.join(REPO_ROOT, 'scripts/scan/scan-email-imap.mjs'), 'utf8');
    expect(
      src,
      'The .mjs child must emit INBOUND_REACTION lines on stdout, NOT POST to /api/email/react (loses ALS context).',
    ).not.toMatch(/fetch\([^)]*\/api\/email\/react/);
    // And it should emit the sentinel
    expect(src).toContain('INBOUND_REACTION:');
  });

  it('scan-email-imap.job.ts parses INBOUND_REACTION + calls reactToEmail in-process', () => {
    const src = fs.readFileSync(path.join(SERVER_ROOT, 'jobs/scan-email-imap.job.ts'), 'utf8');
    expect(src).toContain('INBOUND_REACTION');
    expect(src).toMatch(/reactToEmail/);
  });
});
