/**
 * db-writers -- DB-mirror writers for activity_events + issues.
 *
 * The JSONL files (`data/activity.jsonl`, `data/issues.jsonl`) remain the
 * cheap append-only source of truth. These functions mirror each write
 * into the matching app.db table so the UI can do indexed per-user
 * queries (e.g. "show me Alice's last 100 errors of source=apply-*").
 *
 * Each writer is tolerant of DB failures -- if the insert throws, we
 * swallow it so a DB hiccup doesn't break the file-based source of
 * truth. The UI falls back to the JSONL parser when the DB table is
 * empty (legacy install).
 *
 * Other tables in app.db (profiles, ui_prefs) have their own dedicated
 * modules (`profiles-db.ts`, `ui-prefs.ts`) that own both read and write.
 */
import { appDb } from './db';
import { activityEvents, issues as issuesTable } from './db/app-schema';
import { and, eq } from 'drizzle-orm';
import { SYSTEM_USER_ID } from './user-context';
import type { ActivityEvent, Issue } from '$lib/types';

function shouldWrite(userId: string | undefined | null): userId is string {
  return Boolean(userId && userId !== SYSTEM_USER_ID);
}

/** Mirror an activity event into app.db.activity_events. */
export function dbWriteActivity(ev: ActivityEvent): void {
  if (!shouldWrite(ev.userId)) return;
  try {
    appDb
      .insert(activityEvents)
      .values({
        id: ev.id,
        userId: ev.userId!,
        profileId: ev.profileId ?? null,
        level: ev.level,
        category: ev.category,
        source: ev.source,
        title: ev.title,
        message: ev.message ?? null,
        stack: ev.stack ?? null,
        link: ev.link ?? null,
        ts: ev.ts,
      })
      .run();
  } catch {
    /* non-fatal -- JSONL remains the source of truth */
  }
}

/** Mirror an issue into app.db.issues. Upsert on (user_id, dedupe_key)
 *  matches the JSONL dedup semantics. */
export function dbWriteIssue(issue: Issue): void {
  if (!shouldWrite(issue.userId)) return;
  try {
    const row = {
      id: issue.id,
      userId: issue.userId!,
      profileId: null,
      dedupeKey: issue.dedupeKey ?? issue.id, // composite-unique requires non-null
      level: issue.severity,
      source: issue.source,
      title: issue.summary,
      summary: issue.detail ?? null,
      jobId: null,
      data: issue.fix ? JSON.stringify(issue.fix) : null,
      resolvedAt: issue.resolvedAt ?? null,
      createdAt: issue.ts,
      updatedAt: issue.ts,
    };
    appDb
      .insert(issuesTable)
      .values(row)
      .onConflictDoUpdate({
        target: [issuesTable.userId, issuesTable.dedupeKey],
        set: {
          level: row.level,
          source: row.source,
          title: row.title,
          summary: row.summary,
          data: row.data,
          resolvedAt: row.resolvedAt,
          updatedAt: row.updatedAt,
        },
      })
      .run();
  } catch {
    /* non-fatal -- JSONL remains the source of truth */
  }
}

/** Mark an issue resolved in the DB (called after the JSONL write).
 *
 *  F24 -- filter by (userId, id) not just id. Issue ids are 12-char hex
 *  (24 bits of entropy from crypto.randomBytes(6)) -- collision risk
 *  across users is small but real. The JSONL resolver already filters
 *  via visibleToUser(); this defense-in-depth fix prevents user A
 *  resolving user B's issue if the ids ever collide. */
export function dbResolveIssue(userId: string, id: string, resolvedAt: number): void {
  if (!shouldWrite(userId)) return;
  try {
    appDb
      .update(issuesTable)
      .set({ resolvedAt, updatedAt: resolvedAt })
      .where(and(eq(issuesTable.id, id), eq(issuesTable.userId, userId)))
      .run();
  } catch {
    /* non-fatal */
  }
}
