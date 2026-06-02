/** app-schema -- Drizzle schema for app.db. Scope: only tables the
 *  dashboard queries. Per-user content (CV, profile.yml, portals.yml,
 *  applications.md, reports, etc.) stays on the filesystem under
 *  data/users/{uid}/profiles/{slug}/ because the AI CLI reads those
 *  paths directly per AGENTS.md.
 *  Tables: profiles (career-track list + active flag), ui_prefs
 *  (per-user theme/display name), activity_events + issues (indexed
 *  mirrors of the JSONL files).
 *  Every row has user_id (FK to auth.db.users enforced application-side
 *  -- Drizzle/SQLite don't support cross-file FKs). */
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** A career profile (e.g. "Engineer search", "Founder search"). */
export const profiles = sqliteTable(
  'profiles',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    color: text('color').notNull().default('blue'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('profiles_user_slug_uniq').on(t.userId, t.slug)],
);

/** Per-user mirror of activity events. The JSONL file at
 *  `data/activity.jsonl` remains the cheap append-only source of truth;
 *  this table exists for indexed per-user queries by the UI. */
export const activityEvents = sqliteTable('activity_events', {
  id: text('id').primaryKey(),
  // Nullable: system / broadcast / CSP / process-level diagnostics carry no
  // userId, and the mirror must hold them too -- else the DB is an incomplete
  // query surface vs the JSONL (support's "all errors in the last hour" must be
  // answerable from the indexed DB, not only by grepping the file).
  userId: text('user_id'),
  profileId: text('profile_id'),
  level: text('level').notNull(), // 'info' | 'success' | 'warn' | 'error'
  category: text('category').notNull(),
  source: text('source').notNull(),
  title: text('title').notNull(),
  message: text('message'),
  stack: text('stack'),
  link: text('link'),
  ts: integer('ts').notNull(),
  /** X-Request-Id correlation id (see ActivityEvent.requestId). */
  requestId: text('request_id'),
  /** Stable error fingerprint for grouping (see ActivityEvent.fingerprint). */
  fingerprint: text('fingerprint'),
});

/** Per-user mirror of the open-issues Inbox. The JSONL at
 *  `data/issues.jsonl` remains the cheap append-only source of truth. */
export const issues = sqliteTable(
  'issues',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    profileId: text('profile_id'),
    dedupeKey: text('dedupe_key').notNull(),
    level: text('level').notNull(),
    source: text('source').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    jobId: text('job_id'),
    data: text('data'), // JSON
    resolvedAt: integer('resolved_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('issues_user_dedupe_uniq').on(t.userId, t.dedupeKey)],
);

/** UI prefs (theme, notifications, avatar path) -- one row per user. */
export const uiPrefs = sqliteTable('ui_prefs', {
  userId: text('user_id').primaryKey(),
  displayName: text('display_name'),
  avatarPath: text('avatar_path'),
  appearance: text('appearance').notNull().default('system'),
  theme: text('theme').notNull().default('default'),
  notifications: text('notifications'), // JSON
  updatedAt: integer('updated_at').notNull(),
});
