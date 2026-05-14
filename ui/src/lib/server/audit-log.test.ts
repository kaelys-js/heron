/**
 * lib/server/audit-log — append-only security event log.
 *
 * Mocks the auth DB so calls are captured + asserted without a real
 * SQLite file. Tests record + read + safeParse fallback.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const inserts: any[] = [];
const dbRows: any[] = [];
let lastInsertValues: any = null;

const mockChain = {
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
      inserts.push(v);
      return { run: () => undefined };
    },
  }),
};

vi.mock('./db', () => ({ authDb: mockChain }));
vi.mock('./db/auth-schema', () => ({ auditLog: { userId: 'userId', ts: 'ts' } }));
vi.mock('./user-context', () => ({
  maybeCurrentUserId: () => 'ctx-user',
}));
vi.mock('drizzle-orm', () => ({
  and: (...args: any[]) => args,
  desc: (col: any) => ({ desc: col }),
  eq: (col: any, val: any) => ({ eq: [col, val] }),
  gte: (col: any, val: any) => ({ gte: [col, val] }),
}));

const { recordAuditEvent, readAuditTrail } = await import('./audit-log');

describe('recordAuditEvent', () => {
  beforeEach(() => {
    inserts.length = 0;
    lastInsertValues = null;
  });

  it('inserts a row with the given event type', () => {
    recordAuditEvent('signup');
    expect(inserts.length).toBe(1);
    expect(lastInsertValues.eventType).toBe('signup');
  });

  it('auto-resolves userId from AsyncLocalStorage', () => {
    recordAuditEvent('login');
    expect(lastInsertValues.userId).toBe('ctx-user');
  });

  it('explicit userId overrides AsyncLocalStorage', () => {
    recordAuditEvent('login', { userId: 'override' });
    expect(lastInsertValues.userId).toBe('override');
  });

  it('explicit null userId is preserved (anonymised audit row)', () => {
    recordAuditEvent('account-purged', { userId: null });
    expect(lastInsertValues.userId).toBeNull();
  });

  it('captures ipAddress + userAgent when provided', () => {
    recordAuditEvent('login', { ipAddress: '127.0.0.1', userAgent: 'curl/8' });
    expect(lastInsertValues.ipAddress).toBe('127.0.0.1');
    expect(lastInsertValues.userAgent).toBe('curl/8');
  });

  it('serializes details to JSON', () => {
    recordAuditEvent('role-changed', { details: { from: 'member', to: 'admin' } });
    expect(typeof lastInsertValues.details).toBe('string');
    expect(JSON.parse(lastInsertValues.details)).toEqual({ from: 'member', to: 'admin' });
  });

  it('null details stays null (not JSON "null" string)', () => {
    recordAuditEvent('logout', { details: null });
    expect(lastInsertValues.details).toBeNull();
  });

  it('id is prefixed with "a_"', () => {
    recordAuditEvent('signup');
    expect(lastInsertValues.id).toMatch(/^a_/);
  });

  it('ts is a Date instance', () => {
    recordAuditEvent('signup');
    expect(lastInsertValues.ts).toBeInstanceOf(Date);
  });
});

describe('readAuditTrail', () => {
  beforeEach(() => {
    dbRows.length = 0;
  });

  it('maps rows with safeParse details', () => {
    dbRows.push({
      id: 'a_1',
      userId: 'u',
      eventType: 'login',
      ipAddress: '1.1.1.1',
      userAgent: 'ua',
      details: JSON.stringify({ ok: true }),
      ts: 1_000_000,
    });
    const out = readAuditTrail('u');
    expect(out.length).toBe(1);
    expect(out[0].details).toEqual({ ok: true });
  });

  it('handles malformed JSON details (falls back to raw string)', () => {
    dbRows.push({
      id: 'a_2',
      userId: 'u',
      eventType: 'login',
      ipAddress: null,
      userAgent: null,
      details: '{bad json',
      ts: 1_000_000,
    });
    const out = readAuditTrail('u');
    expect(out[0].details).toBe('{bad json');
  });

  it('handles null details', () => {
    dbRows.push({
      id: 'a_3',
      userId: 'u',
      eventType: 'login',
      ipAddress: null,
      userAgent: null,
      details: null,
      ts: 1_000_000,
    });
    const out = readAuditTrail('u');
    expect(out[0].details).toBeNull();
  });

  it('returns empty array when no rows', () => {
    expect(readAuditTrail('u')).toEqual([]);
  });

  it('preserves ts as number (epoch ms)', () => {
    dbRows.push({
      id: 'a_4',
      userId: 'u',
      eventType: 'login',
      ipAddress: null,
      userAgent: null,
      details: null,
      ts: new Date('2024-01-01T00:00:00Z'),
    });
    const out = readAuditTrail('u');
    expect(typeof out[0].ts).toBe('number');
  });
});
