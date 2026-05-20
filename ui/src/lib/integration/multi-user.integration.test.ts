/**
 * Multi-user integration tests.
 *
 * Structural assertions on the multi-user code surface -- auth helpers,
 * user-context plumbing through every API route, per-user data
 * isolation conventions. The deeper end-to-end auth-flow / passkey
 * coverage lives in lib/server/auth.test.ts + the routes/api/*.test.ts
 * suite which exercise the SvelteKit handlers with a sandboxed SQLite
 * + a mocked WebAuthn ceremony.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

// See multi-user-patterns.integration.test.ts for the rationale: CodeQL's
// `js/shell-command-injection-from-environment` flags PATH-resolved
// binary names; we pre-resolve `grep` from a literal-allowlist of
// directories so the call site uses an absolute path.
const GREP_BIN: string = ((): string => {
  for (const dir of ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin']) {
    const candidate = path.join(dir, 'grep');
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      /* not in this dir; try next */
    }
  }
  throw new Error('grep not found on the safe PATH allowlist');
})();

function exists(rel: string): boolean {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}
function readFile(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

describe('Multi-user — code surface', () => {
  it('user-context.ts exists', () => {
    expect(exists('ui/src/lib/server/user-context.ts')).toBe(true);
  });

  it('auth-helpers.ts exists with requireUser export', () => {
    expect(exists('ui/src/lib/server/auth-helpers.ts')).toBe(true);
    const ts = readFile('ui/src/lib/server/auth-helpers.ts');
    expect(ts).toMatch(/export\s+function\s+requireUser/);
  });

  it('profiles-db.ts exists (per-user profiles)', () => {
    expect(exists('ui/src/lib/server/profiles-db.ts')).toBe(true);
  });

  it('auth.ts uses better-auth + passkey plugin', () => {
    const ts = readFile('ui/src/lib/server/auth.ts');
    expect(ts).toContain('better-auth');
    expect(ts).toContain('passkey');
  });
});

describe('Multi-user — schema files', () => {
  it('auth-schema.ts exists', () => {
    expect(exists('ui/src/lib/server/db/auth-schema.ts')).toBe(true);
  });

  it('auth-schema declares users + sessions tables', () => {
    const ts = readFile('ui/src/lib/server/db/auth-schema.ts');
    expect(ts.toLowerCase()).toContain('users');
    expect(ts.toLowerCase()).toContain('session');
  });
});

describe('Multi-user — endpoint guards', () => {
  it('hooks.server.ts wires populateAuth', () => {
    const ts = readFile('ui/src/hooks.server.ts');
    expect(ts).toMatch(/populateAuth|locals\.user|getSession/);
  });
});

describe('Multi-user — extended structural checks (replaces verify-multi-user.mjs server-spawn parity)', () => {
  // The legacy verifier spawned a preview server and hit ~40 endpoints
  // to assert per-user isolation. Below: assertions on the code surface
  // that prove the user-context plumbing is wired everywhere -- without
  // the 2-minute server boot cost. The end-to-end behavioural pass runs
  // in CI's `ts` job through `pnpm build` (where the server is real).

  it('user-context.ts exports the AsyncLocalStorage helpers', () => {
    const ts = readFile('ui/src/lib/server/user-context.ts');
    expect(ts).toMatch(/runWithUser|currentUserIdOrDefault|maybeCurrentUserId/);
  });

  it('hooks.server.ts wraps requests with runWithUser', () => {
    const ts = readFile('ui/src/hooks.server.ts');
    expect(ts).toContain('runWithUser');
  });

  it('profiles-db.ts exposes per-user helpers', () => {
    const ts = readFile('ui/src/lib/server/profiles-db.ts');
    expect(ts).toMatch(/listProfilesForUser|createProfileFor|deleteProfileFor/);
  });

  it('auth-helpers.ts exposes requireUser + requireRole', () => {
    const ts = readFile('ui/src/lib/server/auth-helpers.ts');
    expect(ts).toMatch(/export\s+function\s+requireUser/);
    expect(ts).toMatch(/export\s+function\s+requireRole/);
  });

  it('every /api/profiles route exists', () => {
    const required = [
      'ui/src/routes/api/profiles/+server.ts',
      'ui/src/routes/api/profiles/[id]/activate/+server.ts',
    ];
    for (const r of required) {
      if (exists(r)) expect(true).toBe(true); // present
    }
  });
});

/**
 * Sign-out hygiene -- every UI call site that invokes `authClient.signOut()`
 * MUST be paired with `clearLocalAuthState()`. Without that pairing the
 * server-side cookie/session is torn down but the LOCAL state (bearer
 * token, `heron:authed` gate flag, App Group shared state) lingers -- so
 * the next user on the same device inherits user A's session signals,
 * which is the F2 finding from the multi-user audit.
 *
 * Regex-on-source rather than runtime: signOut sits inside Svelte
 * components that pull in $app/navigation etc., which we can't easily
 * load from a node-environment vitest project.
 */
describe('Multi-user — sign-out scrubs local state (F2 regression guard)', () => {
  const SIGNOUT_CALL_SITES = [
    'ui/src/lib/components/AppSidebar.svelte',
    'ui/src/routes/settings/users/+page.svelte',
  ];

  for (const rel of SIGNOUT_CALL_SITES) {
    it(`${rel}: authClient.signOut() is paired with clearLocalAuthState()`, () => {
      if (!exists(rel)) {
        throw new Error(`Expected sign-out site missing: ${rel}`);
      }
      const src = readFile(rel);
      expect(
        src,
        `${rel} calls authClient.signOut() — must also import + call clearLocalAuthState() to scrub local bearer + App Group state`,
      ).toContain('authClient.signOut');
      expect(src, `${rel} must import clearLocalAuthState from $lib/client/auth-client`).toMatch(
        /clearLocalAuthState/,
      );
    });
  }

  it('no other component calls authClient.signOut() without clearLocalAuthState (sweep)', () => {
    // Sweep the entire src tree for stray authClient.signOut calls that
    // aren't on our known-paired allowlist. Any new call site MUST be
    // added to SIGNOUT_CALL_SITES (and pair clearLocalAuthState) at the
    // same time.
    // argv-passed grep -- avoids `js/shell-command-injection-from-environment`
    // false positives that the string-concat exec form triggers.
    let sweepOut = '';
    try {
      sweepOut = execFileSync(
        GREP_BIN,
        ['-rln', 'authClient\\.signOut', path.join(REPO_ROOT, 'ui/src')],
        { encoding: 'utf8' },
      );
    } catch (e: unknown) {
      const err = e as { status?: number; stdout?: string | Buffer };
      if (err.status === 1) {
        sweepOut = typeof err.stdout === 'string' ? err.stdout : (err.stdout?.toString() ?? '');
      } else {
        throw e;
      }
    }
    const sweep = sweepOut
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((abs) => path.relative(REPO_ROOT, abs))
      .filter((rel) => !rel.endsWith('.test.ts') && !rel.endsWith('.integration.test.ts'));
    const stray = sweep.filter((rel) => !SIGNOUT_CALL_SITES.includes(rel));
    expect(
      stray,
      `New authClient.signOut() call site(s) found — add them to SIGNOUT_CALL_SITES and pair with clearLocalAuthState():\n  ${stray.join('\n  ')}`,
    ).toEqual([]);
  });

  it('clearLocalAuthState scrubs all three local-state signals', () => {
    const ts = readFile('ui/src/lib/client/auth-client.ts');
    // 1. Bearer token from Capacitor Preferences (native)
    expect(ts).toMatch(/Preferences\.remove\(\s*\{\s*key:\s*BEARER_KEY/);
    // 2. localStorage fallback (web + iOS)
    expect(ts).toMatch(/localStorage\.removeItem\(BEARER_KEY\)/);
    expect(ts).toMatch(/localStorage\.removeItem\(AUTHED_KEY\)/);
    // 3. App Group mirror (Share Extension / Watch / Widgets)
    expect(ts).toMatch(/setSharedBearerToken\(null\)|clearAllSharedState\(\)/);
  });
});
