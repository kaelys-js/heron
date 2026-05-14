/**
 * lib/server/auth-helpers — guards/extractors used by every protected
 * endpoint.
 *
 * Mocks the auth DB so role-lookup branches are testable without a real
 * SQLite file.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('./db', () => ({
  authDb: {
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => ({ role: 'member' }),
        }),
      }),
    }),
  },
}));
vi.mock('./db/auth-schema', () => ({
  users: { id: 'id', role: 'role' },
}));

const {
  requireUser,
  requireUserId,
  requireUserFromEvent,
  isAuthed,
  userIdFromEvent,
  userRole,
  requireRole,
} = await import('./auth-helpers');

function makeLocals(user: any = { id: 'u1' }): any {
  return { user };
}

describe('requireUser', () => {
  it('returns the user when present', () => {
    const locals = makeLocals({ id: 'u1' });
    expect(requireUser(locals).id).toBe('u1');
  });

  it('throws 401 when user is null', () => {
    expect(() => requireUser(makeLocals(null))).toThrow();
  });

  it('throws 401 when user is undefined', () => {
    expect(() => requireUser({ user: undefined } as any)).toThrow();
  });
});

describe('requireUserId', () => {
  it('returns user.id', () => {
    expect(requireUserId(makeLocals({ id: 'abc' }))).toBe('abc');
  });

  it('throws when unauthenticated', () => {
    expect(() => requireUserId(makeLocals(null))).toThrow();
  });
});

describe('requireUserFromEvent + userIdFromEvent', () => {
  it('requireUserFromEvent reads from event.locals', () => {
    expect(requireUserFromEvent({ locals: makeLocals({ id: 'q' }) }).id).toBe('q');
  });

  it('userIdFromEvent shortcut', () => {
    expect(userIdFromEvent({ locals: makeLocals({ id: 'r' }) })).toBe('r');
  });
});

describe('isAuthed type guard', () => {
  it('true for authed locals', () => {
    expect(isAuthed(makeLocals({ id: 'u' }))).toBe(true);
  });

  it('false when user is null', () => {
    expect(isAuthed(makeLocals(null))).toBe(false);
  });
});

describe('userRole', () => {
  it('returns inline role when present on user object', () => {
    const locals = makeLocals({ id: 'u', role: 'owner' });
    expect(userRole(locals)).toBe('owner');
  });

  it('falls back to DB lookup ("member" via mock) when no inline role', () => {
    const locals = makeLocals({ id: 'u' });
    expect(userRole(locals)).toBe('member');
  });

  it('throws when unauthenticated (delegates to requireUser)', () => {
    expect(() => userRole(makeLocals(null))).toThrow();
  });
});

describe('requireRole', () => {
  it('allows when role is in allowList (string form)', () => {
    const locals = makeLocals({ id: 'u', role: 'owner' });
    expect(() => requireRole(locals, 'owner')).not.toThrow();
  });

  it('allows when role is in allowList (array form)', () => {
    const locals = makeLocals({ id: 'u', role: 'admin' });
    expect(() => requireRole(locals, ['owner', 'admin'])).not.toThrow();
  });

  it('throws 403 when role is not allowed', () => {
    const locals = makeLocals({ id: 'u', role: 'member' });
    expect(() => requireRole(locals, 'owner')).toThrow();
  });

  it('throws 401 when unauthenticated (delegates to requireUser)', () => {
    expect(() => requireRole(makeLocals(null), 'owner')).toThrow();
  });

  it('returns the user object on success', () => {
    const locals = makeLocals({ id: 'u', role: 'owner' });
    const u = requireRole(locals, 'owner');
    expect(u.id).toBe('u');
  });
});
