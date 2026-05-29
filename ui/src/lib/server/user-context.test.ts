/**
 * user-context.test -- AsyncLocalStorage-backed user-id context.
 *
 * Real AsyncLocalStorage in node env -- no mocking needed. Tests cover
 * runWithUser / runAsUser / currentUserId / maybeCurrentUserId /
 * currentUserIdOrDefault / userContextEnv. listSchedulableUsers is
 * exercised separately because it touches the DB.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  runWithUser,
  runAsUser,
  currentUserId,
  maybeCurrentUserId,
  currentUserIdOrDefault,
  userContextEnv,
  SYSTEM_USER_ID,
} from './user-context';

afterEach(() => {
  delete process.env.HERON_USER_ID;
});

describe('sYSTEM_USER_ID', () => {
  it('is the canonical "__system__" string', () => {
    expect(SYSTEM_USER_ID).toBe('__system__');
  });
});

describe('runWithUser / currentUserId', () => {
  it('makes currentUserId() return the supplied id inside the run', () => {
    const result = runWithUser('uid-alice', () => currentUserId());
    expect(result).toBe('uid-alice');
  });

  it('throws when called outside any user context', () => {
    expect(() => currentUserId()).toThrow(/outside of a user context/);
  });

  it('does NOT leak context outside the run scope', () => {
    runWithUser('uid-temp', () => 'inside');
    expect(() => currentUserId()).toThrow();
  });

  it('returns the result of the inner function', () => {
    const result = runWithUser('uid', () => 42);
    expect(result).toBe(42);
  });

  it('supports nested runs (inner overrides outer)', () => {
    const result = runWithUser('outer', () => runWithUser('inner', () => currentUserId()));
    expect(result).toBe('inner');
  });
});

describe('runAsUser (async variant)', () => {
  it('awaits the inner promise + returns its value', async () => {
    const result = await runAsUser('uid-async', async () => {
      // Simulate an async boundary -- ALS must survive it.
      await new Promise((r) => setTimeout(r, 1));
      return currentUserId();
    });
    expect(result).toBe('uid-async');
  });

  it('accepts a non-Promise return + still wraps it', async () => {
    const result = await runAsUser('uid-sync', () => currentUserId());
    expect(result).toBe('uid-sync');
  });
});

describe('maybeCurrentUserId', () => {
  it('returns the id inside a context', () => {
    runWithUser('uid', () => {
      expect(maybeCurrentUserId()).toBe('uid');
    });
  });

  it('returns null outside any context', () => {
    expect(maybeCurrentUserId()).toBeNull();
  });
});

describe('currentUserIdOrDefault', () => {
  it('returns the id inside a context', () => {
    runWithUser('uid', () => {
      expect(currentUserIdOrDefault()).toBe('uid');
    });
  });

  it('returns the SYSTEM sentinel outside any context', () => {
    expect(currentUserIdOrDefault()).toBe(SYSTEM_USER_ID);
  });
});

describe('userContextEnv', () => {
  it('returns a passthrough of process.env outside a context (no HERON_USER_ID injected)', () => {
    const env = userContextEnv();
    expect(env.HERON_USER_ID).toBeUndefined();
  });

  it('injects HERON_USER_ID inside a context', () => {
    runWithUser('uid-env', () => {
      const env = userContextEnv();
      expect(env.HERON_USER_ID).toBe('uid-env');
    });
  });

  it('does NOT inject HERON_USER_ID for the SYSTEM sentinel', () => {
    runWithUser(SYSTEM_USER_ID, () => {
      const env = userContextEnv();
      expect(env.HERON_USER_ID).toBeUndefined();
    });
  });

  it('merges extra env vars on top of process.env', () => {
    runWithUser('uid', () => {
      const env = userContextEnv({ FOO: 'bar', BAZ: 'qux' });
      expect(env.FOO).toBe('bar');
      expect(env.BAZ).toBe('qux');
      expect(env.HERON_USER_ID).toBe('uid');
    });
  });

  it('extras override matching process.env keys', () => {
    process.env.HERON_SHOULD_OVERRIDE = 'from-process';
    runWithUser('uid', () => {
      const env = userContextEnv({ HERON_SHOULD_OVERRIDE: 'from-extra' });
      expect(env.HERON_SHOULD_OVERRIDE).toBe('from-extra');
    });
    delete process.env.HERON_SHOULD_OVERRIDE;
  });
});
