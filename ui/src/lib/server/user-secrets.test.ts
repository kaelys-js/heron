/**
 * user-secrets.test.ts -- per-user encrypted credential store.
 *
 * TDD spec. The implementation reads paths via `userSharedPathForUser`
 * which derives off `ROOT` from `./files`. We mock that to a tmpdir so
 * every write lands in /tmp and the live-data guard in test-setup.ts
 * stays out of our way.
 */

import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TMP = path.join(tmpdir(), 'heron-user-secrets-' + Date.now() + '-' + process.pid);

// MUST run before importing user-secrets so the module-load-time
// `userSharedPathForUser` resolves under the mocked ROOT.
vi.mock('./files', () => ({ ROOT: TMP, DATA_ROOT: path.join(TMP, 'data') }));

const {
  deleteSecret,
  getCredential,
  getSecret,
  listSecretKeys,
  migrateEnvToUserSecrets,
  setSecret,
} = await import('./user-secrets');
const { SYSTEM_USER_ID } = await import('./user-context');

const TEST_USER_A = '11111111-1111-1111-1111-111111111111';
const TEST_USER_B = '22222222-2222-2222-2222-222222222222';

/** Mirror userSharedPathForUser('secrets') for direct on-disk inspection. */
function secretsFileFor(userId: string): string {
  if (userId === SYSTEM_USER_ID) {
    return path.join(TMP, 'data', 'profiles', '_shared', 'secrets.json');
  }
  return path.join(TMP, 'data', 'users', userId, 'profiles', '_shared', 'secrets.json');
}

beforeEach(() => {
  // Fresh BETTER_AUTH_SECRET per test -- the file's encryption key is
  // derived from it, so tests are independent only if it doesn't drift.
  process.env.BETTER_AUTH_SECRET = 'a'.repeat(64); // 64 hex chars
});

afterEach(() => {
  if (fs.existsSync(TMP)) {
    fs.rmSync(TMP, { recursive: true, force: true });
  }
});

describe('user-secrets — round-trip', () => {
  it('setSecret + getSecret round-trips a value', () => {
    setSecret(TEST_USER_A, 'ANTHROPIC_API_KEY', 'sk-ant-test-12345');
    expect(getSecret(TEST_USER_A, 'ANTHROPIC_API_KEY')).toBe('sk-ant-test-12345');
  });

  it('getSecret returns null for an unset key', () => {
    expect(getSecret(TEST_USER_A, 'NOT_SET')).toBeNull();
  });

  it('setSecret overwrites an existing value', () => {
    setSecret(TEST_USER_A, 'ANTHROPIC_API_KEY', 'old');
    setSecret(TEST_USER_A, 'ANTHROPIC_API_KEY', 'new');
    expect(getSecret(TEST_USER_A, 'ANTHROPIC_API_KEY')).toBe('new');
  });

  it('deleteSecret removes a key', () => {
    setSecret(TEST_USER_A, 'ANTHROPIC_API_KEY', 'sk-x');
    deleteSecret(TEST_USER_A, 'ANTHROPIC_API_KEY');
    expect(getSecret(TEST_USER_A, 'ANTHROPIC_API_KEY')).toBeNull();
  });

  it('deleteSecret on a missing key is a no-op', () => {
    expect(() => deleteSecret(TEST_USER_A, 'NEVER_SET')).not.toThrow();
  });

  it('listSecretKeys returns all keys, no values', () => {
    setSecret(TEST_USER_A, 'ANTHROPIC_API_KEY', 'a');
    setSecret(TEST_USER_A, 'GEMINI_API_KEY', 'b');
    setSecret(TEST_USER_A, 'GMAIL_IMAP_PASSWORD', 'c');
    const keys = listSecretKeys(TEST_USER_A).sort();
    expect(keys).toEqual(['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GMAIL_IMAP_PASSWORD']);
  });

  it('listSecretKeys returns empty array when no file exists yet', () => {
    expect(listSecretKeys(TEST_USER_A)).toEqual([]);
  });
});

describe('user-secrets — per-user isolation', () => {
  it("user A's secret is invisible to user B", () => {
    setSecret(TEST_USER_A, 'ANTHROPIC_API_KEY', 'a-only');
    expect(getSecret(TEST_USER_B, 'ANTHROPIC_API_KEY')).toBeNull();
  });

  it('users can hold the same key with different values', () => {
    setSecret(TEST_USER_A, 'ANTHROPIC_API_KEY', 'a-value');
    setSecret(TEST_USER_B, 'ANTHROPIC_API_KEY', 'b-value');
    expect(getSecret(TEST_USER_A, 'ANTHROPIC_API_KEY')).toBe('a-value');
    expect(getSecret(TEST_USER_B, 'ANTHROPIC_API_KEY')).toBe('b-value');
  });

  it('listSecretKeys is scoped per-user', () => {
    setSecret(TEST_USER_A, 'ANTHROPIC_API_KEY', 'a');
    setSecret(TEST_USER_B, 'GEMINI_API_KEY', 'b');
    expect(listSecretKeys(TEST_USER_A)).toEqual(['ANTHROPIC_API_KEY']);
    expect(listSecretKeys(TEST_USER_B)).toEqual(['GEMINI_API_KEY']);
  });
});

describe('user-secrets — at-rest encryption', () => {
  it('secrets file contains no plaintext value', () => {
    const secret = 'super-distinctive-plaintext-marker-xyz';
    setSecret(TEST_USER_A, 'ANTHROPIC_API_KEY', secret);
    const raw = fs.readFileSync(secretsFileFor(TEST_USER_A), 'utf8');
    expect(raw).not.toContain(secret);
    // Key names ARE plaintext (necessary for listSecretKeys without
    // decrypting); only values are encrypted.
    expect(raw).toContain('ANTHROPIC_API_KEY');
  });

  it('file format has version + salt + per-entry iv/ciphertext/tag', () => {
    setSecret(TEST_USER_A, 'X', 'y');
    const parsed = JSON.parse(fs.readFileSync(secretsFileFor(TEST_USER_A), 'utf8'));
    expect(parsed.version).toBe(1);
    expect(typeof parsed.salt).toBe('string');
    expect(typeof parsed.entries).toBe('object');
    expect(parsed.entries.X).toBeTruthy();
    expect(parsed.entries.X.iv).toBeTruthy();
    expect(parsed.entries.X.ciphertext).toBeTruthy();
    expect(parsed.entries.X.tag).toBeTruthy();
  });

  it('file mode is 0600 (owner read/write only)', () => {
    // Skip on non-POSIX systems -- Windows file modes don't map.
    if (process.platform === 'win32') return;
    setSecret(TEST_USER_A, 'X', 'y');
    const mode = fs.statSync(secretsFileFor(TEST_USER_A)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('decryption fails if BETTER_AUTH_SECRET changes after write', () => {
    setSecret(TEST_USER_A, 'ANTHROPIC_API_KEY', 'sk-x');
    process.env.BETTER_AUTH_SECRET = 'b'.repeat(64); // rotated
    expect(() => getSecret(TEST_USER_A, 'ANTHROPIC_API_KEY')).toThrow();
  });

  it('throws clearly if BETTER_AUTH_SECRET missing on write', () => {
    delete process.env.BETTER_AUTH_SECRET;
    expect(() => setSecret(TEST_USER_A, 'K', 'v')).toThrow(/BETTER_AUTH_SECRET/);
  });
});

describe('user-secrets — getCredential resolver (per-user store + .env fallback)', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  it('returns per-user value when set, ignoring .env', () => {
    setSecret(TEST_USER_A, 'ANTHROPIC_API_KEY', 'per-user-wins');
    process.env.ANTHROPIC_API_KEY = 'env-loses';
    expect(getCredential(TEST_USER_A, 'ANTHROPIC_API_KEY')).toBe('per-user-wins');
  });

  it('falls back to .env when per-user value missing', () => {
    process.env.ANTHROPIC_API_KEY = 'env-fallback';
    expect(getCredential(TEST_USER_A, 'ANTHROPIC_API_KEY')).toBe('env-fallback');
  });

  it('returns null when neither set', () => {
    expect(getCredential(TEST_USER_A, 'ANTHROPIC_API_KEY')).toBeNull();
  });

  it('per-user override is per-user, not global', () => {
    setSecret(TEST_USER_A, 'ANTHROPIC_API_KEY', 'a-only');
    process.env.ANTHROPIC_API_KEY = 'env-default';
    // User B has no per-user value → sees .env fallback
    expect(getCredential(TEST_USER_B, 'ANTHROPIC_API_KEY')).toBe('env-default');
    // User A's override still wins for them
    expect(getCredential(TEST_USER_A, 'ANTHROPIC_API_KEY')).toBe('a-only');
  });
});

describe('user-secrets — Python parity (scripts/lib/user_secrets.py decrypts TS-written files)', () => {
  it('TS-written secret round-trips via scripts/lib/user_secrets.py', async () => {
    // Skip if the .venv isn't present (e.g. running on a CI box that
    // hasn't bootstrapped Python yet). The TS/MJS parity case below
    // still gives us byte-level confidence in the format.
    const venvPython = path.resolve(__dirname, '..', '..', '..', '..', '.venv', 'bin', 'python');
    if (!fs.existsSync(venvPython)) return;

    setSecret(TEST_USER_A, 'PYTHON_PARITY_KEY', 'PY-LONG-VAL-9876XYZ');

    const { spawnSync } = await import('node:child_process');
    // Resolve relative to THIS test file so the path is stable across
    // any clone location (CI runner, fresh fork, contributor checkout).
    // Previously this used process.cwd(), but vitest's cwd is the
    // workspace root (ui/), not the repo root -- so cwd/scripts pointed
    // at ui/scripts which doesn't exist + Python's `import lib` failed
    // with ModuleNotFoundError. From this file:
    //   ui/src/lib/server/user-secrets.test.ts -> ../../../../scripts
    const scriptsDir = path.resolve(__dirname, '..', '..', '..', '..', 'scripts');
    const script = [
      'import sys, os',
      `sys.path.insert(0, '${scriptsDir}')`,
      'from lib.user_secrets import get_secret',
      "print(get_secret(os.environ['T_USER'], 'PYTHON_PARITY_KEY'))",
    ].join('\n');
    const result = spawnSync(venvPython, ['-c', script], {
      env: {
        ...process.env,
        HERON_DATA_DIR: path.join(TMP, 'data'),
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
        T_USER: TEST_USER_A,
      },
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      throw new Error(
        `Python parity probe failed (status=${result.status}):\n` +
          `stdout: ${result.stdout}\nstderr: ${result.stderr}`,
      );
    }
    expect(result.stdout.trim()).toBe('PY-LONG-VAL-9876XYZ');
  });
});

describe('user-secrets — mjs/ts parity (CLI scripts share the same format)', () => {
  it('TS-written secret round-trips via scripts/lib/user-secrets.mjs', async () => {
    setSecret(TEST_USER_A, 'GEMINI_API_KEY', 'AIza-parity-LONG-VALUE-1234');
    // The mjs side reads HERON_DATA_DIR (overrides the hardcoded
    // repo-relative path). Our TS impl wrote under {TMP}/data/users/...,
    // so point the mjs at {TMP}/data and the file resolves.
    const prevHeron = process.env.HERON_DATA_DIR;
    process.env.HERON_DATA_DIR = path.join(TMP, 'data');
    try {
      // Dynamic import -- module is cached but the env-var read at call
      // time is what matters for path resolution.
      const mjs = await import('../../../../scripts/lib/user-secrets.mjs');
      const out = mjs.getSecret(TEST_USER_A, 'GEMINI_API_KEY');
      expect(out).toBe('AIza-parity-LONG-VALUE-1234');
    } finally {
      if (prevHeron === undefined) delete process.env.HERON_DATA_DIR;
      else process.env.HERON_DATA_DIR = prevHeron;
    }
  });

  it('mjs getCredential() honors HERON_USER_ID and falls back to process.env', async () => {
    setSecret(TEST_USER_A, 'ANTHROPIC_API_KEY', 'sk-ant-per-user-WINS-LONG');
    const prevHeron = process.env.HERON_DATA_DIR;
    const prevUser = process.env.HERON_USER_ID;
    const prevEnv = process.env.ANTHROPIC_API_KEY;
    process.env.HERON_DATA_DIR = path.join(TMP, 'data');
    process.env.HERON_USER_ID = TEST_USER_A;
    process.env.ANTHROPIC_API_KEY = 'env-LOSES';
    try {
      const mjs = await import('../../../../scripts/lib/user-secrets.mjs');
      expect(mjs.getCredential('ANTHROPIC_API_KEY')).toBe('sk-ant-per-user-WINS-LONG');
      // Now unset HERON_USER_ID -- should fall through to process.env
      delete process.env.HERON_USER_ID;
      expect(mjs.getCredential('ANTHROPIC_API_KEY')).toBe('env-LOSES');
    } finally {
      if (prevHeron === undefined) delete process.env.HERON_DATA_DIR;
      else process.env.HERON_DATA_DIR = prevHeron;
      if (prevUser === undefined) delete process.env.HERON_USER_ID;
      else process.env.HERON_USER_ID = prevUser;
      if (prevEnv === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = prevEnv;
    }
  });
});

describe('user-secrets — migrateEnvToUserSecrets()', () => {
  // The migration helper calls into ./user-context (DB) + ./events.
  // Mock those at the boundary so the test stays a pure unit test.
  //
  // CI quirk: two competing `vi.doMock('./user-context', ...)` calls
  // (one in beforeEach, one in a single test) DID NOT reliably override
  // each other under Vitest 4 + full-suite + coverage on linux runners.
  // We use a shared mutable holder so the factory always returns the
  // freshest value -- no need to redeclare the mock per-test.
  const mockState = { ownerId: TEST_USER_A };

  beforeEach(() => {
    mockState.ownerId = TEST_USER_A;
    vi.doMock('./user-context', async (importOriginal) => {
      const real = (await importOriginal()) as Record<string, unknown>;
      return {
        ...real,
        SYSTEM_USER_ID,
        getOwnerUserId: async () => mockState.ownerId,
      };
    });
    vi.doMock('./events', () => ({
      logEvent: () => undefined,
      reportServerError: () => undefined,
    }));
  });

  afterEach(() => {
    vi.doUnmock('./user-context');
    vi.doUnmock('./events');
    vi.resetModules();
  });

  it('copies a matching .env value into the owner store', async () => {
    const { migrateEnvToUserSecrets: migrate } = await import('./user-secrets');
    process.env.GEMINI_API_KEY = 'env-LONG-key-1234';
    await migrate();
    expect(getSecret(TEST_USER_A, 'GEMINI_API_KEY')).toBe('env-LONG-key-1234');
    delete process.env.GEMINI_API_KEY;
  });

  it('does not clobber an existing per-user value', async () => {
    const { migrateEnvToUserSecrets: migrate } = await import('./user-secrets');
    setSecret(TEST_USER_A, 'GEMINI_API_KEY', 'user-LONG-value-AAAA');
    process.env.GEMINI_API_KEY = 'env-LONG-value-BBBB';
    await migrate();
    expect(getSecret(TEST_USER_A, 'GEMINI_API_KEY')).toBe('user-LONG-value-AAAA');
    delete process.env.GEMINI_API_KEY;
  });

  it('skips non-migratable keys', async () => {
    const { migrateEnvToUserSecrets: migrate } = await import('./user-secrets');
    process.env.BETTER_AUTH_URL = 'http://example.test';
    await migrate();
    expect(getSecret(TEST_USER_A, 'BETTER_AUTH_URL')).toBeNull();
    delete process.env.BETTER_AUTH_URL;
  });

  it('is a no-op when no owner exists', async () => {
    // Flip the shared mock state -- the factory reads it lazily, so the
    // next dynamic import of './user-context' from inside migrate() sees
    // SYSTEM_USER_ID. No second vi.doMock needed (and it WOULDN'T work
    // reliably in CI -- see describe-block comment above).
    mockState.ownerId = SYSTEM_USER_ID;
    vi.resetModules();
    const { migrateEnvToUserSecrets: migrate } = await import('./user-secrets');
    process.env.GEMINI_API_KEY = 'env-LONG-value-ZZZZ';
    await migrate();
    expect(getSecret(SYSTEM_USER_ID, 'GEMINI_API_KEY')).toBeNull();
    expect(getSecret(TEST_USER_A, 'GEMINI_API_KEY')).toBeNull();
    delete process.env.GEMINI_API_KEY;
  });

  it('is a no-op when BETTER_AUTH_SECRET missing', async () => {
    const { migrateEnvToUserSecrets: migrate } = await import('./user-secrets');
    delete process.env.BETTER_AUTH_SECRET;
    process.env.GEMINI_API_KEY = 'env-LONG-value-WWWW';
    await migrate(); // should not throw
    delete process.env.GEMINI_API_KEY;
  });

  it('re-running migrate is idempotent', async () => {
    const { migrateEnvToUserSecrets: migrate } = await import('./user-secrets');
    process.env.GEMINI_API_KEY = 'env-LONG-value-RRRR';
    await migrate();
    await migrate();
    expect(getSecret(TEST_USER_A, 'GEMINI_API_KEY')).toBe('env-LONG-value-RRRR');
    delete process.env.GEMINI_API_KEY;
  });
});

describe('user-secrets — atomicity + durability', () => {
  it('no .tmp file persists after a successful write', () => {
    setSecret(TEST_USER_A, 'X', 'y');
    const dir = path.dirname(secretsFileFor(TEST_USER_A));
    const leftovers = fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('survives multiple sequential writes to the same user', () => {
    setSecret(TEST_USER_A, 'A', '1');
    setSecret(TEST_USER_A, 'B', '2');
    setSecret(TEST_USER_A, 'C', '3');
    expect(getSecret(TEST_USER_A, 'A')).toBe('1');
    expect(getSecret(TEST_USER_A, 'B')).toBe('2');
    expect(getSecret(TEST_USER_A, 'C')).toBe('3');
  });

  it('parent directories are auto-created', () => {
    // Ensure the user's profile dir doesn't exist before the call --
    // the implementation must mkdirSync({recursive: true}) on demand.
    const dir = path.dirname(secretsFileFor(TEST_USER_A));
    fs.rmSync(dir, { recursive: true, force: true });
    expect(() => setSecret(TEST_USER_A, 'X', 'y')).not.toThrow();
    expect(fs.existsSync(secretsFileFor(TEST_USER_A))).toBe(true);
  });
});
