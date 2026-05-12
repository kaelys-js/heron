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

/** Schema version. Bump when adding/removing tables.
 *
 *  v1 — Phase 1 initial schema (17 app.db tables including dead-on-arrival
 *       jobs/applications/reports/cv_content/etc).
 *  v2 — Trimmed app.db to 4 tables (profiles, activity_events, issues,
 *       ui_prefs). All per-user content files stay on the filesystem under
 *       data/users/{userId}/profiles/{slug}/... because the Claude CLI
 *       reads them directly. The dropped-table-cleanup migration below
 *       runs once when v1 → v2 is detected.
 */
const SCHEMA_VERSION = 2;

/** Tables that existed in v1 but were dropped in v2. Listed so the
 *  upgrade step can DROP them from existing installs. */
const APP_DROPPED_IN_V2 = [
  'jobs',
  'applications',
  'reports',
  'scan_history',
  'gemini_scores',
  'form_answers',
  'apply_state',
  'comp_overrides',
  'interview_schedule',
  'cv_content',
  'profile_yml_content',
  'portals_yml_content',
  'profile_md_content',
];

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

/** APP.DB tables — mirrors `app-schema.ts`.
 *
 *  Only the 4 tables the dashboard actually queries are defined:
 *  profiles, activity_events, issues, ui_prefs. Per-user content files
 *  (cv.md, profile.yml, portals.yml, _profile.md, applications.md,
 *  pipeline.md, scan-history.tsv, gemini-scores.tsv, reports/, output/,
 *  interview-prep/, form-answers-cache.jsonl, apply-state JSON,
 *  comp-overrides JSON, interview-schedule.jsonl) live on the filesystem
 *  under `data/users/{userId}/profiles/{slug}/...` because the Claude
 *  CLI reads them directly per AGENTS.md. User separation is enforced
 *  by the per-user path prefix; moving these into SQLite would break
 *  the CLI integration. */
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

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

let migrated = false;

function readVersion(handle: typeof authSqliteHandle): number {
  try {
    const row = handle.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as
      | { value?: string }
      | undefined;
    return row?.value ? parseInt(row.value, 10) : 0;
  } catch {
    return 0;
  }
}

/** Bootstrap both SQLite files. Idempotent — safe to call repeatedly.
 *
 * On v1 → v2 upgrade, drops the 13 app.db tables that were defined but
 * never written to in v1 (jobs, applications, reports, scan_history,
 * gemini_scores, form_answers, apply_state, comp_overrides,
 * interview_schedule, cv_content, profile_yml_content, portals_yml_content,
 * profile_md_content). The per-user data those tables would have held
 * already lives on the filesystem under data/users/{userId}/profiles/{slug}/.
 */
export function ensureSchema(): void {
  if (migrated) return;
  authSqliteHandle.exec(AUTH_DDL);
  appSqliteHandle.exec(APP_DDL);

  // Drop tables that existed in v1 but were removed in v2. Pre-v2 installs
  // never wrote any rows to these (they were aspirational), so DROP is
  // safe — no user data is destroyed.
  const appVersion = readVersion(appSqliteHandle);
  if (appVersion < 2) {
    for (const table of APP_DROPPED_IN_V2) {
      try {
        appSqliteHandle.exec(`DROP TABLE IF EXISTS ${table};`);
      } catch {
        /* table didn't exist — fine */
      }
    }
  }

  authSqliteHandle
    .prepare("INSERT OR REPLACE INTO schema_meta(key, value) VALUES ('version', ?)")
    .run(String(SCHEMA_VERSION));
  appSqliteHandle
    .prepare("INSERT OR REPLACE INTO schema_meta(key, value) VALUES ('version', ?)")
    .run(String(SCHEMA_VERSION));
  migrated = true;
}
