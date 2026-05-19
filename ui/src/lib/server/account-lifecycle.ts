/** Soft delete / restore / hard delete / GDPR export.
 *  Soft delete sets users.deletedAt = NOW + 30d (user can undo during
 *  the grace window; autopilot lifecycle-reap hard-deletes after).
 *  Hard delete wipes app.db rows, the per-user FS tree at
 *  data/users/{userId}/, anonymises audit_log (user_id -> NULL), then
 *  removes the auth.db users row. Export bundles every per-user row +
 *  FS inventory + raw markdown/yaml into a JSON file for download. */
import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { authDb, appDb } from './db';
import { ROOT } from './files';
import {
  users as authUsers,
  pendingDeletions,
  sessions,
  accounts,
  passkeys,
  auditLog,
  backupCodes,
  inviteCodes,
} from './db/auth-schema';
import { profiles, activityEvents, issues, uiPrefs } from './db/app-schema';
import crypto from 'node:crypto';

const GRACE_DAYS = 30;
const GRACE_MS = GRACE_DAYS * 24 * 60 * 60 * 1000;

export function newPdId(): string {
  return 'pd_' + crypto.randomBytes(6).toString('hex');
}

/** Mark the user soft-deleted. Reversible via restoreUser() until the
 *  cron reaper runs hardDeleteUser() after the grace window. */
export function softDeleteUser(userId: string, reason?: string): { scheduledFor: number } {
  const now = Date.now();
  const scheduledFor = now + GRACE_MS;
  authDb
    .update(authUsers)
    .set({ deletedAt: new Date(now), updatedAt: new Date(now) })
    .where(eq(authUsers.id, userId))
    .run();
  // Track in pending_deletions so the reaper has a quick index.
  const existing = authDb
    .select()
    .from(pendingDeletions)
    .where(eq(pendingDeletions.userId, userId))
    .get();
  if (existing) {
    authDb
      .update(pendingDeletions)
      .set({
        requestedAt: new Date(now),
        scheduledFor: new Date(scheduledFor),
        cancelledAt: null,
        completedAt: null,
      })
      .where(eq(pendingDeletions.userId, userId))
      .run();
  } else {
    authDb
      .insert(pendingDeletions)
      .values({
        id: newPdId(),
        userId,
        requestedAt: new Date(now),
        scheduledFor: new Date(scheduledFor),
        completedAt: null,
        cancelledAt: null,
      })
      .run();
  }
  // Kill any active sessions -- the user must re-auth to undo, which
  // they're prompted for at /login with a "Cancel deletion" CTA.
  authDb.delete(sessions).where(eq(sessions.userId, userId)).run();
  return { scheduledFor };
}

/** Cancel a pending deletion. Returns true if a pending deletion was
 *  cancelled, false if none existed. */
export function restoreUser(userId: string): boolean {
  const row = authDb
    .select()
    .from(pendingDeletions)
    .where(eq(pendingDeletions.userId, userId))
    .get();
  if (!row || row.completedAt) return false;
  const now = Date.now();
  authDb
    .update(authUsers)
    .set({ deletedAt: null, updatedAt: new Date(now) })
    .where(eq(authUsers.id, userId))
    .run();
  authDb
    .update(pendingDeletions)
    .set({ cancelledAt: new Date(now) })
    .where(eq(pendingDeletions.userId, userId))
    .run();
  return true;
}

/** PERMANENTLY delete the user and all their data. Run after the grace
 *  window via the reaper, OR directly via an opt-in "purge now" flow
 *  (which skips the 30-day wait -- useful for GDPR right-to-erasure
 *  requests when the user explicitly asks for immediate deletion). */
export function hardDeleteUser(userId: string): void {
  // 1. Wipe app.db rows. Other per-user data lives on the filesystem
  //    under data/users/{userId}/profiles/{slug}/... -- that's wiped in
  //    step 2 below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userScopedTables: any[] = [uiPrefs, issues, activityEvents, profiles];
  for (const table of userScopedTables) {
    try {
      appDb.delete(table).where(eq(table.userId, userId)).run();
    } catch {
      // Continue on per-table failures so a single corrupt table doesn't
      // block the rest of the cleanup.
    }
  }

  // 2. FS tree under data/users/{userId}/.
  const userDir = path.join(ROOT, 'data', 'users', userId);
  try {
    fs.rmSync(userDir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
  const avatarDir = path.join(ROOT, 'data', 'avatars', userId);
  try {
    fs.rmSync(avatarDir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }

  // 3. Anonymise audit_log (set user_id to NULL but keep the rows).
  authDb.update(auditLog).set({ userId: null }).where(eq(auditLog.userId, userId)).run();

  // 4. Wipe auth.db. CASCADE handles sessions/accounts/passkeys/backup-codes;
  //    invite_codes drops the foreign key reference via SET NULL.
  authDb.delete(passkeys).where(eq(passkeys.userId, userId)).run();
  authDb.delete(backupCodes).where(eq(backupCodes.userId, userId)).run();
  authDb.delete(accounts).where(eq(accounts.userId, userId)).run();
  authDb.delete(sessions).where(eq(sessions.userId, userId)).run();
  authDb.delete(inviteCodes).where(eq(inviteCodes.ownerUserId, userId)).run();
  authDb.delete(pendingDeletions).where(eq(pendingDeletions.userId, userId)).run();
  authDb.delete(authUsers).where(eq(authUsers.id, userId)).run();
}

/** Run by the autopilot reaper job (daily). Returns ids that were purged. */
export function reapExpiredDeletions(): string[] {
  const now = Date.now();
  const due = authDb
    .select()
    .from(pendingDeletions)
    .where(eq(pendingDeletions.completedAt, null as unknown as Date))
    .all()
    .filter((r) => {
      const sf =
        typeof r.scheduledFor === 'number' ? r.scheduledFor : new Date(r.scheduledFor).getTime();
      return sf <= now && !r.cancelledAt;
    });
  const purged: string[] = [];
  for (const row of due) {
    try {
      hardDeleteUser(row.userId);
      purged.push(row.userId);
    } catch {
      /* keep going on per-user failures */
    }
  }
  return purged;
}

/** Build a GDPR export blob for the user -- every per-user row + the FS
 *  tree contents serialized as base64-encoded files. Caller writes to
 *  disk and streams it. */
export function buildExport(userId: string): { json: unknown; files: Record<string, string> } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collect = (table: any): unknown[] => {
    try {
      return appDb.select().from(table).where(eq(table.userId, userId)).all() as unknown[];
    } catch {
      return [];
    }
  };
  const data = {
    exportedAt: new Date().toISOString(),
    userId,
    user: authDb.select().from(authUsers).where(eq(authUsers.id, userId)).get(),
    profiles: collect(profiles),
    activityEvents: collect(activityEvents),
    issues: collect(issues),
    uiPrefs: collect(uiPrefs),
    sessions: authDb.select().from(sessions).where(eq(sessions.userId, userId)).all(),
    passkeys: authDb.select().from(passkeys).where(eq(passkeys.userId, userId)).all(),
    accounts: authDb.select().from(accounts).where(eq(accounts.userId, userId)).all(),
    auditLog: authDb.select().from(auditLog).where(eq(auditLog.userId, userId)).all(),
  };
  // Inventory the per-user filesystem tree. We base64-encode files so the
  // export is a single self-contained JSON blob (no zip dependency).
  const files: Record<string, string> = {};
  const userDir = path.join(ROOT, 'data', 'users', userId);
  if (fs.existsSync(userDir)) {
    walkDir(userDir, userDir, files);
  }
  return { json: data, files };
}

function walkDir(root: string, current: string, out: Record<string, string>): void {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) {
      walkDir(root, full, out);
    } else if (entry.isFile()) {
      try {
        const rel = path.relative(root, full);
        out[rel] = fs.readFileSync(full).toString('base64');
      } catch {
        /* skip unreadable files */
      }
    }
  }
}
