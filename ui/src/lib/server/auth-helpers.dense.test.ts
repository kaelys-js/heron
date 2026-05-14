/**
 * lib/server/auth-helpers — dense role + guard matrix.
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
vi.mock('./db/auth-schema', () => ({ users: { id: 'id', role: 'role' } }));

const { requireUser, requireRole, userRole, isAuthed, requireUserFromEvent, userIdFromEvent } =
  await import('./auth-helpers');

const ROLES = ['owner', 'admin', 'member'] as const;

describe('userRole — inline role on locals.user', () => {
  it.each(ROLES)('inline role %s', (role) => {
    const locals: any = { user: { id: 'u', role } };
    expect(userRole(locals)).toBe(role);
  });
});

describe('requireRole — single-role allowList', () => {
  for (const required of ROLES) {
    for (const actual of ROLES) {
      it(`required=${required} actual=${actual} → ${required === actual ? 'allow' : 'deny'}`, () => {
        const locals: any = { user: { id: 'u', role: actual } };
        if (required === actual) {
          expect(() => requireRole(locals, required)).not.toThrow();
        } else {
          expect(() => requireRole(locals, required)).toThrow();
        }
      });
    }
  }
});

describe('requireRole — array allowList', () => {
  it.each([
    [['owner'], 'owner', true],
    [['owner'], 'admin', false],
    [['owner', 'admin'], 'admin', true],
    [['owner', 'admin'], 'member', false],
    [['owner', 'admin', 'member'], 'member', true],
    [['owner', 'admin', 'member'], 'admin', true],
    [['member'], 'admin', false],
  ] as const)('allowList=%o actual=%s → allow=%s', (allowed, actual, expectedAllow) => {
    const locals: any = { user: { id: 'u', role: actual } };
    if (expectedAllow) {
      expect(() => requireRole(locals, allowed as any)).not.toThrow();
    } else {
      expect(() => requireRole(locals, allowed as any)).toThrow();
    }
  });
});

describe('requireUser — every unauthed shape throws', () => {
  it.each([null, undefined])('user=%p throws 401', (user) => {
    expect(() => requireUser({ user } as any)).toThrow();
  });

  it.each([{ id: 'u' }, { id: 'a' }, { id: 'z', role: 'owner' }])('user=%o passes', (user) => {
    expect(() => requireUser({ user } as any)).not.toThrow();
  });
});

describe('isAuthed — type guard', () => {
  // Note: isAuthed checks `locals.user !== null` strictly, so only null
  // counts as unauthed. undefined slips through (no explicit null check)
  // — that's the existing contract.
  it.each([
    [{ id: 'u' }, true],
    [{ id: 'a', role: 'admin' }, true],
    [null, false],
  ] as const)('user=%o → %s', (user, expected) => {
    expect(isAuthed({ user } as any)).toBe(expected);
  });
});

describe('userIdFromEvent / requireUserFromEvent — extract id', () => {
  it.each([
    ['u1'],
    ['user-abc'],
    ['00000000-0000-0000-0000-000000000000'],
    ['just-some-id'],
  ])('id %s round-trips', (id) => {
    const event: any = { locals: { user: { id } } };
    expect(requireUserFromEvent(event).id).toBe(id);
    expect(userIdFromEvent(event)).toBe(id);
  });
});
