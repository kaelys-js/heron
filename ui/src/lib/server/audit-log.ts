/**
 * audit-log -- append-only record of every security-relevant event.
 *
 * Events: signup, login, login-failed, logout, passkey-add, passkey-revoke,
 * oauth-link, oauth-unlink, deletion-requested, deletion-cancelled,
 * account-restored, account-purged, data-exported, role-changed,
 * backup-code-used, invite-generated, invite-claimed, invite-revoked.
 *
 * Even admins can't delete from this log (we never expose a DELETE
 * endpoint). The only path to purge is via hard account deletion, which
 * cascades through the user_id FK → 'set null' on audit_log so we keep
 * the historical row but anonymise it. That preserves the security
 * timeline while honouring GDPR right-to-erasure.
 *
 * No PII inside the JSON details blob -- only event-shape data
 * (ip address, user-agent, anonymous context). The user's email and
 * name live in `users` (and are cleared on hard delete).
 */
import crypto from 'node:crypto';
import { and, desc, eq, gte } from 'drizzle-orm';
import { authDb } from './db';
import { auditLog } from './db/auth-schema';
import { maybeCurrentUserId } from './user-context';

export type AuditEvent =
  | 'signup'
  | 'login'
  | 'login-failed'
  | 'logout'
  | 'passkey-add'
  | 'passkey-revoke'
  | 'oauth-link'
  | 'oauth-unlink'
  | 'deletion-requested'
  | 'deletion-cancelled'
  | 'account-restored'
  | 'account-purged'
  | 'data-exported'
  | 'role-changed'
  | 'backup-code-used'
  | 'invite-generated'
  | 'invite-claimed'
  | 'invite-revoked';

export type AuditEntry = {
  id: string;
  userId: string | null;
  eventType: AuditEvent;
  ipAddress: string | null;
  userAgent: string | null;
  details: unknown;
  ts: number;
};

function newId(): string {
  return 'a_' + crypto.randomBytes(8).toString('hex');
}

/** Record a security event for the current user. Caller may override
 *  userId (e.g. when recording a deletion event where the user has
 *  already been soft-deleted and the AsyncLocalStorage shows null). */
export function recordAuditEvent(
  eventType: AuditEvent,
  opts: {
    userId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    details?: unknown;
  } = {},
): void {
  const userId = opts.userId === null ? null : (opts.userId ?? maybeCurrentUserId() ?? null);
  authDb
    .insert(auditLog)
    .values({
      id: newId(),
      userId,
      eventType,
      ipAddress: opts.ipAddress ?? null,
      userAgent: opts.userAgent ?? null,
      details: opts.details == null ? null : JSON.stringify(opts.details),
      ts: new Date(),
    })
    .run();
}

/** Read this user's audit trail, newest first. Used by /settings/security. */
export function readAuditTrail(userId: string, since?: number): AuditEntry[] {
  const conditions = since
    ? and(eq(auditLog.userId, userId), gte(auditLog.ts, new Date(since)))
    : eq(auditLog.userId, userId);
  const rows = authDb.select().from(auditLog).where(conditions).orderBy(desc(auditLog.ts)).all();
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    eventType: row.eventType as AuditEvent,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    details: row.details ? safeParse(row.details) : null,
    ts: typeof row.ts === 'number' ? row.ts : new Date(row.ts).getTime(),
  }));
}

function safeParse(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}
