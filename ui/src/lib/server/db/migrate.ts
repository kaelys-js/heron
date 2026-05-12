/**
 * db/migrate — first-boot schema bootstrap.
 *
 * career-ops doesn't ship a drizzle-kit-generated migration folder yet —
 * the schemas are still being iterated. For Phase 1 we use idempotent
 * CREATE TABLE IF NOT EXISTS statements derived from the Drizzle schema
 * objects. This is safe to run on every startup and is fast (~1ms when
 * tables already exist).
 *
 * When the schema stabilises we switch to drizzle-kit migrations.
 * Until then, ANY schema change requires:
 *   1. Edit the schema file
 *   2. Add a corresponding CREATE TABLE here (or ALTER for additions)
 *   3. Bump SCHEMA_VERSION below + write a one-shot migration step
 */
import { authSqliteHandle, appSqliteHandle } from './index';

const SCHEMA_VERSION = 1;

/** AUTH.DB tables — mirrors `auth-schema.ts`. */
const AUTH_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT UNIQUE NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  image TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  two_factor_enabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions(token);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts(user_id);

CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT,
  public_key TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_type TEXT NOT NULL,
  backed_up INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
CREATE INDEX IF NOT EXISTS passkeys_user_id_idx ON passkeys(user_id);

CREATE TABLE IF NOT EXISTS invite_codes (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT UNIQUE NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  claimed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  claimed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_codes (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
  event_type TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  details TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_log_user_id_idx ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS audit_log_ts_idx ON audit_log(ts);

CREATE TABLE IF NOT EXISTS pending_deletions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_at INTEGER NOT NULL,
  scheduled_for INTEGER NOT NULL,
  completed_at INTEGER,
  cancelled_at INTEGER
);
CREATE INDEX IF NOT EXISTS pending_deletions_user_id_idx ON pending_deletions(user_id);

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

/** APP.DB tables — mirrors `app-schema.ts`. */
const APP_DDL = `
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'blue',
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_slug_uniq ON profiles(user_id, slug);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'New',
  score REAL,
  gemini_score REAL,
  bg_risk TEXT,
  work_mode TEXT,
  location TEXT,
  salary TEXT,
  pdf_file TEXT,
  report_file TEXT,
  source TEXT,
  pipeline_index INTEGER,
  last_event INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS jobs_user_id_idx ON jobs(user_id);
CREATE INDEX IF NOT EXISTS jobs_profile_id_idx ON jobs(profile_id);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  status TEXT NOT NULL,
  applied_at INTEGER,
  notes TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS applications_user_id_idx ON applications(user_id);
CREATE INDEX IF NOT EXISTS applications_job_id_idx ON applications(job_id);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  content_md TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_user_id_idx ON reports(user_id);
CREATE INDEX IF NOT EXISTS reports_job_id_idx ON reports(job_id);

CREATE TABLE IF NOT EXISTS scan_history (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT NOT NULL,
  scanned_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scan_history_user_id_idx ON scan_history(user_id);

CREATE TABLE IF NOT EXISTS gemini_scores (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  score REAL NOT NULL,
  rationale TEXT,
  scored_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS gemini_scores_user_id_idx ON gemini_scores(user_id);

CREATE TABLE IF NOT EXISTS form_answers (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT,
  answer TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS form_answers_user_profile_key_uniq ON form_answers(user_id, profile_id, key);

CREATE TABLE IF NOT EXISTS apply_state (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  url TEXT NOT NULL,
  portal TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  last_step TEXT,
  step_history TEXT,
  screenshot_path TEXT,
  captured_at INTEGER
);
CREATE INDEX IF NOT EXISTS apply_state_user_id_idx ON apply_state(user_id);

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  profile_id TEXT,
  level TEXT NOT NULL,
  category TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  stack TEXT,
  link TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_events_user_id_idx ON activity_events(user_id);
CREATE INDEX IF NOT EXISTS activity_events_ts_idx ON activity_events(ts);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  profile_id TEXT,
  dedupe_key TEXT NOT NULL,
  level TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  job_id TEXT,
  data TEXT,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS issues_user_dedupe_uniq ON issues(user_id, dedupe_key);

CREATE TABLE IF NOT EXISTS ui_prefs (
  user_id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT,
  avatar_path TEXT,
  appearance TEXT NOT NULL DEFAULT 'system',
  theme TEXT NOT NULL DEFAULT 'default',
  notifications TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS comp_overrides (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  band TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS comp_overrides_user_key_uniq ON comp_overrides(user_id, key);

CREATE TABLE IF NOT EXISTS interview_schedule (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  scheduled_at INTEGER NOT NULL,
  stage TEXT,
  format TEXT,
  interviewers TEXT,
  notes TEXT,
  reminders TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS interview_schedule_user_id_idx ON interview_schedule(user_id);

CREATE TABLE IF NOT EXISTS cv_content (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  content_md TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS cv_content_user_profile_uniq ON cv_content(user_id, profile_id);

CREATE TABLE IF NOT EXISTS profile_yml_content (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  content_yml TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS profile_yml_user_profile_uniq ON profile_yml_content(user_id, profile_id);

CREATE TABLE IF NOT EXISTS portals_yml_content (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  content_yml TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS portals_yml_user_profile_uniq ON portals_yml_content(user_id, profile_id);

CREATE TABLE IF NOT EXISTS profile_md_content (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  content_md TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS profile_md_user_profile_uniq ON profile_md_content(user_id, profile_id);

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

let migrated = false;

/** Bootstrap both SQLite files. Idempotent — safe to call repeatedly. */
export function ensureSchema(): void {
  if (migrated) return;
  authSqliteHandle.exec(AUTH_DDL);
  appSqliteHandle.exec(APP_DDL);
  // Record the version for future migrations.
  authSqliteHandle
    .prepare("INSERT OR REPLACE INTO schema_meta(key, value) VALUES ('version', ?)")
    .run(String(SCHEMA_VERSION));
  appSqliteHandle
    .prepare("INSERT OR REPLACE INTO schema_meta(key, value) VALUES ('version', ?)")
    .run(String(SCHEMA_VERSION));
  migrated = true;
}
