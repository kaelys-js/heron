/**
 * lib-profiles.mjs — argv + env helpers.
 *
 * The MJS scripts in scripts/ (scanners, appliers, tracker tools, etc.)
 * use `profileFromArgv()` and `userFromArgv()` to resolve their target
 * profile + user from a uniform interface:
 *   • --profile <slug> | --profile=<slug>  → profile id
 *   • --user <uid>     | --user=<uid>      → user id (multi-user)
 *   • CAREER_OPS_PROFILE_ID env var        → fallback for profile
 *   • CAREER_OPS_USER_ID env var           → fallback for user
 *
 * The orchestrator forwards these env vars on every spawn so dashboard
 * invocations land in the right data/users/{uid}/profiles/{slug}/ tree
 * automatically. Standalone CLI invocations either pass --profile/--user
 * or fall back to SYSTEM_USER_ID + the active profile.
 *
 * Tests here cover the argv parser + env-var fallback + path-traversal
 * guard. They run against the actual MJS module via dynamic import so
 * the contract stays in lock-step with the script-side code.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ORIG_ENV_USER = process.env.CAREER_OPS_USER_ID;
const ORIG_ENV_PROFILE = process.env.CAREER_OPS_PROFILE_ID;

// Resolve the MJS module by absolute file:// URL so vitest's loader
// doesn't try to resolve via the workspace's module-resolution graph.
const libPath = pathToFileURL(
  path.resolve(__dirname, '../../../../scripts/lib/lib-profiles.mjs'),
).href;

beforeEach(() => {
  delete process.env.CAREER_OPS_USER_ID;
  delete process.env.CAREER_OPS_PROFILE_ID;
});

afterEach(() => {
  process.env.CAREER_OPS_USER_ID = ORIG_ENV_USER;
  process.env.CAREER_OPS_PROFILE_ID = ORIG_ENV_PROFILE;
});

describe('lib-profiles.mjs::userFromArgv', () => {
  it('parses --user <id>', async () => {
    const lib = await import(libPath);
    expect(lib.userFromArgv(['--user', 'alice'])).toBe('alice');
  });

  it('parses --user=<id>', async () => {
    const lib = await import(libPath);
    expect(lib.userFromArgv(['--user=bob'])).toBe('bob');
  });

  it('falls back to CAREER_OPS_USER_ID env var when no flag', async () => {
    process.env.CAREER_OPS_USER_ID = 'env-charlie';
    const lib = await import(libPath);
    expect(lib.userFromArgv([])).toBe('env-charlie');
  });

  it('--user flag wins over CAREER_OPS_USER_ID env var', async () => {
    process.env.CAREER_OPS_USER_ID = 'env-loser';
    const lib = await import(libPath);
    expect(lib.userFromArgv(['--user', 'arg-winner'])).toBe('arg-winner');
  });

  it('returns SYSTEM_USER_ID when neither flag nor env set', async () => {
    const lib = await import(libPath);
    expect(lib.userFromArgv([])).toBe(lib.SYSTEM_USER_ID);
  });

  it('returns SYSTEM_USER_ID when env var is empty string', async () => {
    process.env.CAREER_OPS_USER_ID = '';
    const lib = await import(libPath);
    expect(lib.userFromArgv([])).toBe(lib.SYSTEM_USER_ID);
  });

  it('ignores --profile arg, only consumes --user', async () => {
    const lib = await import(libPath);
    expect(lib.userFromArgv(['--profile', 'work'])).toBe(lib.SYSTEM_USER_ID);
  });
});

describe('lib-profiles.mjs::resolveUserArg — path-traversal guard', () => {
  // The path-traversal guard exits the process — capture that via
  // mocking process.exit. resolveUserArg is the same code path that
  // userFromArgv uses, so the guard fires for both.
  it.each([
    ['../escape'],
    ['..'],
    ['etc/passwd'],
    ['back\\slash'],
    ['user/../other'],
  ])('rejects invalid id %s', async (badId) => {
    const lib = await import(libPath);
    const origExit = process.exit;
    const origErr = console.error;
    let exited = false;
    let exitCode: number | string | null | undefined;
    let errMsg = '';
    process.exit = ((code?: number) => {
      exited = true;
      exitCode = code;
      throw new Error('__EXIT__');
    }) as typeof process.exit;
    console.error = (...args: unknown[]) => {
      errMsg += args.map(String).join(' ');
    };
    try {
      expect(() => lib.resolveUserArg(badId)).toThrow('__EXIT__');
      expect(exited).toBe(true);
      expect(exitCode).toBe(2);
      expect(errMsg).toMatch(/invalid characters/);
    } finally {
      process.exit = origExit;
      console.error = origErr;
    }
  });

  it('accepts a clean user id', async () => {
    const lib = await import(libPath);
    expect(lib.resolveUserArg('alice')).toBe('alice');
    expect(lib.resolveUserArg('user-uuid-1234')).toBe('user-uuid-1234');
  });
});

describe('lib-profiles.mjs::profilePath — userId routing', () => {
  it('SYSTEM_USER_ID -> legacy data/profiles/{slug}/ tree', async () => {
    const lib = await import(libPath);
    const got = lib.profilePath('default', 'applications', lib.SYSTEM_USER_ID);
    expect(got).toContain('/data/profiles/default/applications.md');
    expect(got).not.toContain('/users/');
  });

  it('explicit userId -> data/users/{uid}/profiles/{slug}/ tree', async () => {
    const lib = await import(libPath);
    const got = lib.profilePath('default', 'applications', 'alice');
    expect(got).toContain('/data/users/alice/profiles/default/applications.md');
  });

  it('two different users get different on-disk paths', async () => {
    const lib = await import(libPath);
    const a = lib.profilePath('work', 'applications', 'alice');
    const b = lib.profilePath('work', 'applications', 'bob');
    expect(a).not.toBe(b);
    expect(a).toContain('/users/alice/');
    expect(b).toContain('/users/bob/');
  });
});
