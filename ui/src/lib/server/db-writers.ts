/**
 * db-writers — DB-mirror writers for events / issues / per-user state.
 *
 * Each function below takes a userId + payload and writes a row to the
 * matching app.db table. Callers go through the existing FS-based modules
 * (events.ts, issues.ts, scan-history.ts, …) which now ALSO call into
 * here so the DB stays in sync with the file streams.
 *
 * Why this lives as a separate module instead of inside each FS module:
 *   • The FS modules already have circular imports between events.ts,
 *     issues.ts, and orchestrator.ts. Adding `appDb` imports there
 *     deepens that graph.
 *   • This module is the single boundary where "should we also write the
 *     DB?" lives — easy to toggle off if a migration step needs to
 *     pause writes for a moment.
 *   • Each writer is tolerant of DB failures — if the insert throws, we
 *     swallow it so a DB hiccup doesn't break the file-based source of
 *     truth.
 */
import crypto from 'node:crypto';
import { appDb } from './db';
import {
  activityEvents,
  issues as issuesTable,
  scanHistory,
  geminiScores,
  formAnswers,
  applyState,
  compOverrides,
  interviewSchedule,
} from './db/app-schema';
import { eq } from 'drizzle-orm';
import { SYSTEM_USER_ID } from './user-context';
import type { ActivityEvent, Issue } from '$lib/types';

function newId(prefix: string): string {
  return prefix + '_' + crypto.randomBytes(6).toString('hex');
}

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
    /* non-fatal — JSONL remains the source of truth */
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
    /* non-fatal — JSONL remains the source of truth */
  }
}

/** Mark an issue resolved in the DB (called after the JSONL write). */
export function dbResolveIssue(userId: string, id: string, resolvedAt: number): void {
  if (!shouldWrite(userId)) return;
  try {
    appDb
      .update(issuesTable)
      .set({ resolvedAt, updatedAt: resolvedAt })
      .where(eq(issuesTable.id, id))
      .run();
  } catch {
    /* non-fatal */
  }
}

/** Mirror a scan-history row. */
export function dbWriteScanRow(
  userId: string,
  profileId: string,
  row: { url: string; source: string; scannedAt: number },
): void {
  if (!shouldWrite(userId)) return;
  try {
    appDb
      .insert(scanHistory)
      .values({
        id: newId('sh'),
        userId,
        profileId,
        url: row.url,
        source: row.source,
        scannedAt: row.scannedAt,
      })
      .run();
  } catch {
    /* non-fatal — TSV remains the source of truth */
  }
}

/** Mirror a gemini-score row. */
export function dbWriteGeminiScore(
  userId: string,
  profileId: string,
  row: { jobId: string; score: number; rationale?: string; scoredAt: number },
): void {
  if (!shouldWrite(userId)) return;
  try {
    appDb
      .insert(geminiScores)
      .values({
        id: newId('gs'),
        userId,
        profileId,
        jobId: row.jobId,
        score: row.score,
        rationale: row.rationale ?? null,
        scoredAt: row.scoredAt,
      })
      .run();
  } catch {
    /* non-fatal */
  }
}

/** Upsert a form-answer cache row. */
export function dbUpsertFormAnswer(
  userId: string,
  profileId: string,
  row: { key: string; label?: string; answer: string; updatedAt: number },
): void {
  if (!shouldWrite(userId)) return;
  try {
    appDb
      .insert(formAnswers)
      .values({
        id: newId('fa'),
        userId,
        profileId,
        key: row.key,
        label: row.label ?? null,
        answer: row.answer,
        updatedAt: row.updatedAt,
        useCount: 0,
      })
      .onConflictDoUpdate({
        target: [formAnswers.userId, formAnswers.profileId, formAnswers.key],
        set: {
          label: row.label ?? null,
          answer: row.answer,
          updatedAt: row.updatedAt,
        },
      })
      .run();
  } catch {
    /* non-fatal — form-answers-cache.jsonl remains the source of truth */
  }
}

/** Upsert apply-state for an in-flight autonomous apply run. */
export function dbWriteApplyState(
  userId: string,
  state: {
    jobId: string;
    url: string;
    portal: string;
    profileId: string;
    startedAt: number;
    lastStep?: string;
    stepHistory?: string[];
    screenshotPath?: string;
    capturedAt?: number;
  },
): void {
  if (!shouldWrite(userId)) return;
  try {
    const id = 'as_' + state.jobId; // deterministic so upsert works
    appDb
      .insert(applyState)
      .values({
        id,
        userId,
        jobId: state.jobId,
        url: state.url,
        portal: state.portal,
        profileId: state.profileId,
        startedAt: state.startedAt,
        lastStep: state.lastStep ?? null,
        stepHistory: state.stepHistory ? JSON.stringify(state.stepHistory) : null,
        screenshotPath: state.screenshotPath ?? null,
        capturedAt: state.capturedAt ?? null,
      })
      .onConflictDoUpdate({
        target: applyState.id,
        set: {
          lastStep: state.lastStep ?? null,
          stepHistory: state.stepHistory ? JSON.stringify(state.stepHistory) : null,
          screenshotPath: state.screenshotPath ?? null,
          capturedAt: state.capturedAt ?? null,
        },
      })
      .run();
  } catch {
    /* non-fatal — apply-state JSON remains the source of truth */
  }
}

/** Mirror a comp-band override. */
export function dbUpsertCompOverride(
  userId: string,
  row: { key: string; band: string; updatedAt: number },
): void {
  if (!shouldWrite(userId)) return;
  try {
    appDb
      .insert(compOverrides)
      .values({
        id: newId('co'),
        userId,
        key: row.key,
        band: row.band,
        updatedAt: row.updatedAt,
      })
      .onConflictDoUpdate({
        target: [compOverrides.userId, compOverrides.key],
        set: {
          band: row.band,
          updatedAt: row.updatedAt,
        },
      })
      .run();
  } catch {
    /* non-fatal */
  }
}

/** Mirror an interview-schedule entry. */
export function dbWriteInterview(
  userId: string,
  row: {
    jobId: string;
    scheduledAt: number;
    stage?: string;
    format?: string;
    interviewers?: string[];
    notes?: string;
    reminders?: { fired24h?: boolean; fired30min?: boolean };
    createdAt: number;
    updatedAt: number;
  },
): void {
  if (!shouldWrite(userId)) return;
  try {
    appDb
      .insert(interviewSchedule)
      .values({
        id: newId('is'),
        userId,
        jobId: row.jobId,
        scheduledAt: row.scheduledAt,
        stage: row.stage ?? null,
        format: row.format ?? null,
        interviewers: row.interviewers ? JSON.stringify(row.interviewers) : null,
        notes: row.notes ?? null,
        reminders: row.reminders ? JSON.stringify(row.reminders) : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
      .run();
  } catch {
    /* non-fatal */
  }
}
