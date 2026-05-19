/**
 * invite-codes -- owner-generated 6-digit codes for new user signups.
 *
 * Why local codes instead of email magic links: Heron is self-hosted
 * with no SMTP/third-party email dependency. Multiple users on ONE local
 * install means everyone is physically nearby -- the owner reads the code
 * off their screen and the invitee types it on theirs (like Apple TV
 * pairing). Codes expire after 30 minutes and are single-use.
 *
 * Generation: cryptographically random 6 digits (10^6 = 1M space). With
 * a 30-minute TTL, brute force is impractical for a low-traffic local
 * server (rate-limited attempts can be layered in when needed).
 *
 * Storage: app.db is the right home if we had jobs to do per-user-id,
 * but invite codes belong in auth.db's `invite_codes` table -- they're
 * an auth concern. Drizzle adapter handles read/write.
 *
 * Claim semantics: when a user enters a valid code at signup,
 * `claimInvite()` marks the code consumed and records which user took
 * it. The user is created with role 'member' (vs the first user who
 * gets 'owner'). The owner can later promote members to admins from
 * /settings/users.
 */
import crypto from 'node:crypto';
import { and, eq, isNull, lt, gt, sql } from 'drizzle-orm';
import { authDb } from './db';
import { inviteCodes, users } from './db/auth-schema';

const CODE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export type InviteCode = {
  id: string;
  code: string;
  ownerUserId: string;
  expiresAt: number;
  claimedByUserId: string | null;
  claimedAt: number | null;
  createdAt: number;
};

function newId(): string {
  return 'inv_' + crypto.randomBytes(8).toString('hex');
}

/** Cryptographically random 6-digit code, zero-padded. */
function generateCode(): string {
  // 0..999_999 → 6-digit string with leading zeros preserved.
  const n = crypto.randomInt(0, 1_000_000);
  return n.toString().padStart(6, '0');
}

function toJson(row: typeof inviteCodes.$inferSelect): InviteCode {
  return {
    id: row.id,
    code: row.code,
    ownerUserId: row.ownerUserId,
    expiresAt:
      typeof row.expiresAt === 'number' ? row.expiresAt : new Date(row.expiresAt).getTime(),
    claimedByUserId: row.claimedByUserId,
    claimedAt:
      row.claimedAt == null
        ? null
        : typeof row.claimedAt === 'number'
          ? row.claimedAt
          : new Date(row.claimedAt).getTime(),
    createdAt:
      typeof row.createdAt === 'number' ? row.createdAt : new Date(row.createdAt).getTime(),
  };
}

/** Generate a single-use invite code owned by the given user. Rejects
 *  collisions by retrying up to 10 times -- at 10^6 codes the chance is
 *  ~10⁻⁵ per attempt with a handful of unexpired codes. */
export function createInvite(ownerUserId: string): InviteCode {
  const now = Date.now();
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode();
    try {
      const id = newId();
      authDb
        .insert(inviteCodes)
        .values({
          id,
          code,
          ownerUserId,
          expiresAt: new Date(now + CODE_TTL_MS),
          claimedByUserId: null,
          claimedAt: null,
          createdAt: new Date(now),
        })
        .run();
      const row = authDb.select().from(inviteCodes).where(eq(inviteCodes.id, id)).get();
      if (row) return toJson(row);
    } catch {
      // UNIQUE collision -- retry with a new code.
    }
  }
  throw new Error('Failed to allocate a unique invite code after 10 attempts');
}

/** Validate a code WITHOUT consuming it. Returns the row if usable. */
export function lookupInvite(code: string): InviteCode | null {
  const row = authDb
    .select()
    .from(inviteCodes)
    .where(
      and(
        eq(inviteCodes.code, code),
        isNull(inviteCodes.claimedByUserId),
        gt(inviteCodes.expiresAt, new Date()),
      ),
    )
    .get();
  return row ? toJson(row) : null;
}

/** Consume the code on behalf of the given new user. Idempotent -- if the
 *  code is already claimed (or expired) returns null and the caller
 *  should refuse the signup attempt. */
export function claimInvite(code: string, claimingUserId: string): InviteCode | null {
  const candidate = lookupInvite(code);
  if (!candidate) return null;
  const now = Date.now();
  authDb
    .update(inviteCodes)
    .set({ claimedByUserId: claimingUserId, claimedAt: new Date(now) })
    .where(and(eq(inviteCodes.code, code), isNull(inviteCodes.claimedByUserId)))
    .run();
  const row = authDb.select().from(inviteCodes).where(eq(inviteCodes.code, code)).get();
  return row ? toJson(row) : null;
}

/** List every invite this user has generated, newest first. Used by the
 *  /settings/users page to show "you've generated 3 codes; 2 unused, 1
 *  claimed by X". */
export function listInvitesFromOwner(ownerUserId: string): InviteCode[] {
  const rows = authDb
    .select()
    .from(inviteCodes)
    .where(eq(inviteCodes.ownerUserId, ownerUserId))
    .all();
  return rows.map(toJson).sort((a, b) => b.createdAt - a.createdAt);
}

/** Revoke an unclaimed invite. Returns true if the code existed and was
 *  revoked, false if it was already claimed or missing. */
export function revokeInvite(ownerUserId: string, id: string): boolean {
  const result = authDb
    .delete(inviteCodes)
    .where(
      and(
        eq(inviteCodes.id, id),
        eq(inviteCodes.ownerUserId, ownerUserId),
        isNull(inviteCodes.claimedByUserId),
      ),
    )
    .run();
  return (result.changes ?? 0) > 0;
}

/** Total user count -- used to decide whether the next signup creates the
 *  owner (n=0) or requires an invite (n>0). */
export function userCount(): number {
  const row = authDb.select({ n: sql<number>`count(*)` }).from(users).get();
  return row?.n ?? 0;
}

/** Drop every expired unclaimed code. Run from autopilot weekly. */
export function pruneExpired(): number {
  const result = authDb
    .delete(inviteCodes)
    .where(and(isNull(inviteCodes.claimedByUserId), lt(inviteCodes.expiresAt, new Date())))
    .run();
  return result.changes ?? 0;
}
