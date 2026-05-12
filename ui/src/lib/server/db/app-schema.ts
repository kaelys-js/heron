/**
 * app-schema — Drizzle schema for the app.db SQLite file.
 *
 * Every row has a `userId` foreign key to auth.db's `users` table. Note:
 * Drizzle doesn't enforce cross-database FKs (we have two SQLite files);
 * the constraint is enforced application-side by hooks middleware + every
 * server-lib function being userId-scoped.
 *
 * Tables mirror the file-based data we replace:
 *   • profiles, jobs, applications, reports, scan_history, gemini_scores
 *   • form_answers, apply_state, activity_events, issues
 *   • ui_prefs, comp_overrides, interview_schedule
 *   • cv_content, profile_yml_content, portals_yml_content (user-editable
 *     markdown/yaml stored as TEXT blobs keyed by user+profile)
 *
 * Every table has user_id NOT NULL. Composite uniqueness on (user_id, slug)
 * etc. so two users can have profiles with the same slug.
 */
import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

/** A job posting. */
export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  profileId: text('profile_id').notNull(),
  company: text('company').notNull(),
  role: text('role').notNull(),
  url: text('url').notNull(),
  status: text('status').notNull().default('New'),
  score: real('score'),
  geminiScore: real('gemini_score'),
  bgRisk: text('bg_risk'),
  workMode: text('work_mode'),
  location: text('location'),
  salary: text('salary'),
  pdfFile: text('pdf_file'),
  reportFile: text('report_file'),
  source: text('source'),
  pipelineIndex: integer('pipeline_index'),
  lastEvent: integer('last_event'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** Application events (status transitions, etc.). */
export const applications = sqliteTable('applications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  profileId: text('profile_id').notNull(),
  jobId: text('job_id').notNull(),
  status: text('status').notNull(),
  appliedAt: integer('applied_at'),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
});

/** Evaluation reports (markdown blob per job). */
export const reports = sqliteTable('reports', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  profileId: text('profile_id').notNull(),
  jobId: text('job_id').notNull(),
  contentMd: text('content_md').notNull(),
  createdAt: integer('created_at').notNull(),
});

/** Scan history (dedupe). */
export const scanHistory = sqliteTable('scan_history', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  profileId: text('profile_id').notNull(),
  url: text('url').notNull(),
  source: text('source').notNull(),
  scannedAt: integer('scanned_at').notNull(),
});

/** Gemini fast-scoring cache. */
export const geminiScores = sqliteTable('gemini_scores', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  profileId: text('profile_id').notNull(),
  jobId: text('job_id').notNull(),
  score: real('score').notNull(),
  rationale: text('rationale'),
  scoredAt: integer('scored_at').notNull(),
});

/** Form-answer cache (used by autonomous apply). */
export const formAnswers = sqliteTable(
  'form_answers',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    profileId: text('profile_id').notNull(),
    key: text('key').notNull(),
    label: text('label'),
    answer: text('answer').notNull(),
    updatedAt: integer('updated_at').notNull(),
    useCount: integer('use_count').notNull().default(0),
  },
  (t) => [uniqueIndex('form_answers_user_profile_key_uniq').on(t.userId, t.profileId, t.key)],
);

/** Apply-state for in-flight autonomous apply runs. */
export const applyState = sqliteTable('apply_state', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  jobId: text('job_id').notNull(),
  url: text('url').notNull(),
  portal: text('portal').notNull(),
  profileId: text('profile_id').notNull(),
  startedAt: integer('started_at').notNull(),
  lastStep: text('last_step'),
  stepHistory: text('step_history'), // JSON array
  screenshotPath: text('screenshot_path'),
  capturedAt: integer('captured_at'),
});

/** Activity events (SSE stream contents). */
export const activityEvents = sqliteTable('activity_events', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  profileId: text('profile_id'),
  level: text('level').notNull(), // 'info' | 'success' | 'warn' | 'error'
  category: text('category').notNull(),
  source: text('source').notNull(),
  title: text('title').notNull(),
  message: text('message'),
  stack: text('stack'),
  link: text('link'),
  ts: integer('ts').notNull(),
});

/** Issues (Inbox). */
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

/** UI prefs (theme, notifications, avatar path). */
export const uiPrefs = sqliteTable('ui_prefs', {
  userId: text('user_id').primaryKey(),
  displayName: text('display_name'),
  avatarPath: text('avatar_path'),
  appearance: text('appearance').notNull().default('system'),
  theme: text('theme').notNull().default('default'),
  notifications: text('notifications'), // JSON
  updatedAt: integer('updated_at').notNull(),
});

/** Comp band overrides. */
export const compOverrides = sqliteTable(
  'comp_overrides',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    key: text('key').notNull(),
    band: text('band').notNull(), // JSON
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('comp_overrides_user_key_uniq').on(t.userId, t.key)],
);

/** Interview schedule (per job). */
export const interviewSchedule = sqliteTable('interview_schedule', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  jobId: text('job_id').notNull(),
  scheduledAt: integer('scheduled_at').notNull(),
  stage: text('stage'),
  format: text('format'),
  interviewers: text('interviewers'), // JSON array
  notes: text('notes'),
  reminders: text('reminders'), // JSON: { fired24h, fired30min }
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** CV markdown (per-profile, per-user). */
export const cvContent = sqliteTable(
  'cv_content',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    profileId: text('profile_id').notNull(),
    contentMd: text('content_md').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('cv_content_user_profile_uniq').on(t.userId, t.profileId)],
);

/** profile.yml content (per-profile, per-user). */
export const profileYmlContent = sqliteTable(
  'profile_yml_content',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    profileId: text('profile_id').notNull(),
    contentYml: text('content_yml').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('profile_yml_user_profile_uniq').on(t.userId, t.profileId)],
);

/** portals.yml content (per-profile, per-user). */
export const portalsYmlContent = sqliteTable(
  'portals_yml_content',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    profileId: text('profile_id').notNull(),
    contentYml: text('content_yml').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('portals_yml_user_profile_uniq').on(t.userId, t.profileId)],
);

/** _profile.md content (per-profile, per-user). */
export const profileMdContent = sqliteTable(
  'profile_md_content',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    profileId: text('profile_id').notNull(),
    contentMd: text('content_md').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('profile_md_user_profile_uniq').on(t.userId, t.profileId)],
);
