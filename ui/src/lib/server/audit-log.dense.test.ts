/**
 * lib/server/audit-log — dense matrix over every AuditEvent type.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

let lastInsertValues: any = null;
const dbRows: any[] = [];

vi.mock('./db', () => ({
  authDb: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            all: () => dbRows,
          }),
        }),
      }),
    }),
    insert: () => ({
      values: (v: any) => {
        lastInsertValues = v;
        return { run: () => undefined };
      },
    }),
  },
}));
vi.mock('./db/auth-schema', () => ({ auditLog: { userId: 'userId', ts: 'ts' } }));
vi.mock('./user-context', () => ({ maybeCurrentUserId: () => 'ctx' }));
vi.mock('drizzle-orm', () => ({
  and: (...a: any[]) => a,
  desc: (c: any) => ({ desc: c }),
  eq: (c: any, v: any) => ({ eq: [c, v] }),
  gte: (c: any, v: any) => ({ gte: [c, v] }),
}));

const { recordAuditEvent } = await import('./audit-log');

const EVENTS = [
  'signup',
  'login',
  'login-failed',
  'logout',
  'passkey-add',
  'passkey-revoke',
  'oauth-link',
  'oauth-unlink',
  'deletion-requested',
  'deletion-cancelled',
  'account-restored',
  'account-purged',
  'data-exported',
  'role-changed',
  'backup-code-used',
  'invite-generated',
  'invite-claimed',
  'invite-revoked',
] as const;

describe('recordAuditEvent — every event type', () => {
  beforeEach(() => {
    lastInsertValues = null;
  });

  it.each(EVENTS)('eventType %s persists', (eventType) => {
    recordAuditEvent(eventType);
    expect(lastInsertValues?.eventType).toBe(eventType);
  });

  it.each(EVENTS)('eventType %s gets an id prefix "a_"', (eventType) => {
    recordAuditEvent(eventType);
    expect(lastInsertValues?.id).toMatch(/^a_/);
  });

  it.each(EVENTS)('eventType %s receives a Date ts', (eventType) => {
    recordAuditEvent(eventType);
    expect(lastInsertValues?.ts).toBeInstanceOf(Date);
  });
});

describe('recordAuditEvent — userId resolution', () => {
  beforeEach(() => {
    lastInsertValues = null;
  });

  it.each([
    [{}, 'ctx'],
    [{ userId: 'override' }, 'override'],
    [{ userId: 'specific-user-123' }, 'specific-user-123'],
  ] as const)('opts=%o → userId=%s', (opts, expectedUserId) => {
    recordAuditEvent('login', opts);
    expect(lastInsertValues?.userId).toBe(expectedUserId);
  });

  it('explicit null userId is preserved', () => {
    recordAuditEvent('account-purged', { userId: null });
    expect(lastInsertValues?.userId).toBeNull();
  });
});

describe('recordAuditEvent — details serialisation', () => {
  beforeEach(() => {
    lastInsertValues = null;
  });

  it.each([
    [null, null],
    [undefined, null],
  ] as const)('details=%p → stored=%p', (details, expected) => {
    recordAuditEvent('login', { details });
    expect(lastInsertValues?.details).toBe(expected);
  });

  it.each([
    [{ from: 'a', to: 'b' }],
    [{ ip: '127.0.0.1', ua: 'curl' }],
    [{ nested: { x: 1 } }],
    [[1, 2, 3]],
    ['string-detail'],
    [42],
  ])('details=%o → JSON string', (details) => {
    recordAuditEvent('login', { details });
    expect(typeof lastInsertValues?.details).toBe('string');
    expect(JSON.parse(lastInsertValues!.details!)).toEqual(details);
  });
});

describe('recordAuditEvent — ipAddress + userAgent', () => {
  beforeEach(() => {
    lastInsertValues = null;
  });

  it.each([
    ['127.0.0.1', 'curl/8.0'],
    ['10.0.0.1', 'Mozilla/5.0'],
    ['::1', 'Safari/17'],
    [null, null],
  ] as const)('ip=%s ua=%s round-trip', (ipAddress, userAgent) => {
    recordAuditEvent('login', { ipAddress, userAgent });
    expect(lastInsertValues?.ipAddress).toBe(ipAddress);
    expect(lastInsertValues?.userAgent).toBe(userAgent);
  });
});
