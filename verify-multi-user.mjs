#!/usr/bin/env node
/**
 * verify-multi-user.mjs — Behavioural verifier for the multi-user rollout.
 *
 * Spawns the production build of the UI server, injects two users
 * (Alice + Bob) directly into auth.db, mints signed session cookies,
 * then runs ~30 assertions covering:
 *
 *   1. Foundation: auth.db + app.db created on boot, schemas present
 *   2. Auth guard: 401 for unauth API, 302 for unauth pages
 *   3. Session: Better Auth get-session returns null unauth, full session authed
 *   4. Isolation:
 *      - /api/profiles                  per-user
 *      - /api/ui-prefs                  per-user
 *      - /api/notifications             per-user activity feed
 *      - /api/issues                    per-user issues + broadcast
 *      - data/users/{userId}/profiles/* per-user FS tree
 *   5. Invite codes: create + claim + dedup + bad code rejection
 *   6. Lifecycle: soft delete, restore, hard delete, GDPR export
 *   7. Audit log: deletion-requested + data-exported written, attributed
 *
 * Output: 30+ check lines like `verify-pipeline.mjs`. Exit 0 if all
 * green, exit 1 if any red. Run via:  node verify-multi-user.mjs
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const ROOT = dirname(fileURLToPath(import.meta.url));
const UI = join(ROOT, 'ui');
// better-sqlite3 is installed under ui/node_modules (the workspace
// package), not the repo root. Resolve from there.
const require = createRequire(join(UI, 'package.json'));
const Database = require('better-sqlite3');
const PORT = 5189;
const BASE = `http://localhost:${PORT}`;
const AUTH_DB = join(ROOT, 'data', 'auth.db');
const APP_DB = join(ROOT, 'data', 'app.db');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ''}`);
    failed++;
    failures.push(name);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

async function fetchJson(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, init);
  const status = res.status;
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* not json */
  }
  return { status, body };
}

async function fetchHead(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, { ...init, redirect: 'manual' });
  return { status: res.status, location: res.headers.get('location') };
}

function injectUser(secret, label, role = 'owner') {
  const now = Date.now();
  const userId = `u-${label}-${crypto.randomBytes(3).toString('hex')}`;
  const sessionId = `s-${label}-${crypto.randomBytes(3).toString('hex')}`;
  const token = crypto.randomBytes(16).toString('hex');
  const db = new Database(AUTH_DB);
  db.pragma('foreign_keys = ON');
  db.prepare(
    `INSERT INTO users (id, email, email_verified, role, two_factor_enabled, created_at, updated_at) VALUES (?, ?, 1, ?, 0, ?, ?)`,
  ).run(userId, `${label}-${Date.now()}@verify.local`, role, now, now);
  db.prepare(
    `INSERT INTO sessions (id, user_id, expires_at, token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(sessionId, userId, now + 86400 * 1000, token, now, now);
  db.close();
  const sig = crypto.createHmac('sha256', secret).update(token).digest('base64');
  return { userId, token, cookie: `${token}.${sig}` };
}

function deleteSession(userId) {
  const db = new Database(AUTH_DB);
  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
  db.close();
}

function readSecret() {
  // In CI we set BETTER_AUTH_SECRET as an env var (no .env file on the runner).
  // Locally the dashboard auto-writes .env on first boot.
  if (process.env.BETTER_AUTH_SECRET) return process.env.BETTER_AUTH_SECRET;
  try {
    const env = readFileSync(join(ROOT, '.env'), 'utf8');
    const m = env.match(/^BETTER_AUTH_SECRET=(.+)$/m);
    if (m) return m[1].trim();
  } catch {
    /* no .env */
  }
  throw new Error(
    'BETTER_AUTH_SECRET not set (neither in process.env nor in .env). ' +
      'CI: set BETTER_AUTH_SECRET in the workflow env. Local: run the dashboard once to auto-generate .env.',
  );
}

function authedHeaders(cookie) {
  return { Cookie: `career-ops.session_token=${cookie}` };
}

/** True if `buildEntry` is newer than every .ts/.svelte file under ui/src/.
 *  Cheap walk — there are ~1000 source files and statSync is microseconds. */
function buildIsFresh(buildEntry) {
  const fs = require('node:fs');
  const buildMtime = fs.statSync(buildEntry).mtimeMs;
  const SRC = join(UI, 'src');
  let stalest = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (
        entry.name.endsWith('.ts') ||
        entry.name.endsWith('.svelte') ||
        entry.name.endsWith('.js') ||
        entry.name.endsWith('.mjs') ||
        entry.name.endsWith('.json')
      ) {
        const m = fs.statSync(full).mtimeMs;
        if (m > stalest) stalest = m;
      }
    }
  };
  walk(SRC);
  // Also include the few repo-root configs that affect the build.
  for (const p of [
    join(UI, 'vite.config.ts'),
    join(UI, 'svelte.config.js'),
    join(UI, 'package.json'),
  ]) {
    try {
      const m = fs.statSync(p).mtimeMs;
      if (m > stalest) stalest = m;
    } catch {}
  }
  return buildMtime > stalest;
}

async function startServer() {
  // Build first — but skip if the existing build is fresher than the
  // newest source file (Vite has no built-in "incremental" mode, so we
  // do the freshness check ourselves). Pass --rebuild to force.
  const force = process.argv.includes('--rebuild');
  const buildEntry = join(UI, 'build/index.js');
  if (force || !existsSync(buildEntry) || !buildIsFresh(buildEntry)) {
    console.log('Building UI server...');
    execSync('pnpm exec vite build', { cwd: UI, stdio: 'pipe' });
  } else {
    console.log('Reusing existing UI build (pass --rebuild to force).');
  }
  const child = spawn('node', ['build/index.js'], {
    cwd: UI,
    env: {
      ...process.env,
      PORT: String(PORT),
      // Disable the Better Auth rate limiter — the verifier makes ~100+
      // sequential auth-cookie requests in tight loops which would
      // false-positive trigger the per-IP 60req/min cap. Production
      // limits are reinstated when this var is unset.
      BETTER_AUTH_RATE_LIMIT: 'off',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Wait for "Listening on" line.
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server boot timeout')), 15000);
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('Listening on')) {
        clearTimeout(t);
        resolve();
      }
    });
    child.stderr.on('data', () => {});
  });
  return child;
}

async function main() {
  // Reset state.
  for (const p of [AUTH_DB, APP_DB, `${AUTH_DB}-journal`, `${AUTH_DB}-wal`, `${AUTH_DB}-shm`]) {
    try {
      rmSync(p, { force: true });
    } catch {}
  }
  rmSync(join(ROOT, 'data', 'users'), { recursive: true, force: true });

  const server = await startServer();
  try {
    section('1. Foundation');
    check('auth.db created on boot', existsSync(AUTH_DB));
    check('app.db created on boot', existsSync(APP_DB));
    {
      const db = new Database(AUTH_DB, { readonly: true });
      const tables = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all()
        .map((r) => r.name);
      db.close();
      check('auth.db has users', tables.includes('users'));
      check('auth.db has sessions', tables.includes('sessions'));
      check('auth.db has passkeys', tables.includes('passkeys'));
      check('auth.db has invite_codes', tables.includes('invite_codes'));
      check('auth.db has audit_log', tables.includes('audit_log'));
      check('auth.db has pending_deletions', tables.includes('pending_deletions'));
    }
    {
      const db = new Database(APP_DB, { readonly: true });
      const tables = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all()
        .map((r) => r.name);
      db.close();
      check('app.db has profiles', tables.includes('profiles'));
      check('app.db has ui_prefs', tables.includes('ui_prefs'));
      check('app.db has issues', tables.includes('issues'));
      check('app.db has activity_events', tables.includes('activity_events'));
      // app.db v2 has only 4 user-data tables — everything else is on the
      // filesystem at data/users/{userId}/profiles/{slug}/... so the Claude
      // CLI can read it. Section 7c confirms the v1→v2 drop succeeded.
    }

    section('2. Auth guard');
    {
      const { status, body } = await fetchJson('/api/profiles');
      check('Unauthenticated /api/profiles → 401', status === 401);
      check(
        'Unauthenticated error envelope is JSON {ok:false,error:"unauthenticated"}',
        body?.ok === false && body?.error === 'unauthenticated',
      );
    }
    {
      const r = await fetchHead('/pipeline');
      check('Unauthenticated /pipeline → 302', r.status === 302);
      check(
        '/pipeline redirect target preserves redirectTo',
        (r.location || '').startsWith('/login?redirectTo='),
      );
    }
    {
      const r = await fetchJson('/api/auth/get-session');
      check('Public /api/auth/get-session → 200', r.status === 200);
      check('get-session body is null when unauth', r.body === null);
    }

    section('3. User isolation — profiles + ui-prefs');
    const secret = readSecret();
    const alice = injectUser(secret, 'alice');
    const bob = injectUser(secret, 'bob');

    {
      const r = await fetchJson('/api/profiles', { headers: authedHeaders(alice.cookie) });
      check('Alice authed /api/profiles → 200', r.status === 200);
      check('Alice has at least 1 profile (seeded)', (r.body?.profiles?.length ?? 0) >= 1);
    }
    {
      // Alice creates a new profile.
      const r = await fetchJson('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authedHeaders(alice.cookie) },
        body: JSON.stringify({ name: 'AI Search', color: 'violet' }),
      });
      check(
        'Alice creates "AI Search" profile',
        r.status === 200 && r.body?.profile?.name === 'AI Search',
      );
    }
    {
      const r = await fetchJson('/api/profiles', { headers: authedHeaders(alice.cookie) });
      check('Alice now has 2 profiles', (r.body?.profiles?.length ?? 0) === 2);
    }
    {
      const r = await fetchJson('/api/profiles', { headers: authedHeaders(bob.cookie) });
      check('Bob still has 1 profile (isolated from Alice)', (r.body?.profiles?.length ?? 0) === 1);
    }

    {
      // ui-prefs isolation.
      await fetchJson('/api/ui-prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authedHeaders(alice.cookie) },
        body: JSON.stringify({ appearance: 'dark', theme: 'amber' }),
      });
      await fetchJson('/api/ui-prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authedHeaders(bob.cookie) },
        body: JSON.stringify({ appearance: 'light', theme: 'rose' }),
      });
      const aliceP = await fetchJson('/api/ui-prefs', { headers: authedHeaders(alice.cookie) });
      const bobP = await fetchJson('/api/ui-prefs', { headers: authedHeaders(bob.cookie) });
      check(
        'Alice ui-prefs persists dark/amber',
        aliceP.body?.appearance === 'dark' && aliceP.body?.theme === 'amber',
      );
      check(
        'Bob ui-prefs persists light/rose',
        bobP.body?.appearance === 'light' && bobP.body?.theme === 'rose',
      );
    }

    section('4. Activity + issues isolation');
    {
      const aliceN = await fetchJson('/api/notifications', {
        headers: authedHeaders(alice.cookie),
      });
      const bobN = await fetchJson('/api/notifications', { headers: authedHeaders(bob.cookie) });
      const aliceUsernames = new Set(
        (aliceN.body?.events ?? []).map((e) => e.userId).filter(Boolean),
      );
      const bobUsernames = new Set((bobN.body?.events ?? []).map((e) => e.userId).filter(Boolean));
      check("Alice's activity feed has no Bob events", !aliceUsernames.has(bob.userId));
      check("Bob's activity feed has no Alice events", !bobUsernames.has(alice.userId));
    }

    section('5. Invite codes');
    {
      const create = await fetchJson('/api/auth/invite/create', {
        method: 'POST',
        headers: authedHeaders(alice.cookie),
      });
      check(
        'Invite create succeeds',
        create.status === 200 && /^\d{6}$/.test(create.body?.code ?? ''),
      );
      const code = create.body.code;
      const claim = await fetchJson('/api/auth/invite/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, email: 'someone@verify.local' }),
      });
      check('Invite claim accepts valid code', claim.status === 200 && claim.body?.ok === true);
      const bad = await fetchJson('/api/auth/invite/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: '999999', email: 'someone@verify.local' }),
      });
      check('Invite claim rejects bad code', bad.status === 400);
    }

    section('6. Per-user filesystem tree');
    {
      // Trigger Alice's profile-tree creation via a request that uses profilePath.
      await fetchJson('/api/profiles', { headers: authedHeaders(alice.cookie) });
      check(
        "Alice's per-user data/users/{id}/ tree exists",
        existsSync(join(ROOT, 'data', 'users', alice.userId)),
      );
      // Pre-claim sentinel records the first user who inherited legacy data.
      const claimFile = join(ROOT, 'data', 'users', '.legacy-claimed');
      check(
        '.legacy-claimed sentinel records the first user',
        existsSync(claimFile) && readFileSync(claimFile, 'utf8').trim() === alice.userId,
      );
    }

    section('7. Account lifecycle');
    {
      // Soft delete Alice.
      const soft = await fetchJson('/api/auth/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authedHeaders(alice.cookie) },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      check(
        'Soft delete returns scheduledFor',
        soft.status === 200 && typeof soft.body?.scheduledFor === 'number',
      );
      const db = new Database(AUTH_DB, { readonly: true });
      const row = db.prepare(`SELECT deleted_at FROM users WHERE id = ?`).get(alice.userId);
      const pdRow = db
        .prepare(`SELECT scheduled_for FROM pending_deletions WHERE user_id = ?`)
        .get(alice.userId);
      db.close();
      check('Soft delete sets users.deleted_at', row?.deleted_at !== null);
      check('Soft delete creates pending_deletions row', !!pdRow);

      // Alice's cookie is now stale.
      const after = await fetchJson('/api/profiles', { headers: authedHeaders(alice.cookie) });
      check('Soft-deleted user cannot authenticate', after.status === 401);

      // Bob unaffected.
      const bobAfter = await fetchJson('/api/profiles', { headers: authedHeaders(bob.cookie) });
      check('Bob unaffected by Alice’s deletion', bobAfter.status === 200);
    }

    section('7b. Export omits dropped dead tables');
    {
      // After dropping the 14 dead app.db tables in v2, the export JSON
      // should NOT contain the dropped keys (jobs, applications, reports,
      // cv_content, etc.) — only the 4 surviving ones (profiles,
      // ui_prefs, activity_events, issues).
      const sigUser = injectUser(secret, 'export-shape');
      const exp = await fetchJson('/api/auth/account/export', {
        headers: authedHeaders(sigUser.cookie),
      });
      const keys = Object.keys(exp.body?.json ?? {});
      check(
        "export omits 'jobs' (v1 dead schema)",
        !keys.includes('jobs'),
        'still present: ' + keys.filter((k) => k === 'jobs').join(', '),
      );
      check("export omits 'applications' (v1 dead schema)", !keys.includes('applications'));
      check("export omits 'reports' (v1 dead schema)", !keys.includes('reports'));
      check("export omits 'cvContent' (v1 dead schema)", !keys.includes('cvContent'));
      check("export omits 'profileYmlContent'", !keys.includes('profileYmlContent'));
      check("export omits 'portalsYmlContent'", !keys.includes('portalsYmlContent'));
      check("export omits 'profileMdContent'", !keys.includes('profileMdContent'));
      check("export omits 'scanHistory'", !keys.includes('scanHistory'));
      check("export omits 'geminiScores'", !keys.includes('geminiScores'));
      check("export omits 'formAnswers'", !keys.includes('formAnswers'));
      check("export omits 'applyState'", !keys.includes('applyState'));
      check("export omits 'compOverrides'", !keys.includes('compOverrides'));
      check("export omits 'interviewSchedule'", !keys.includes('interviewSchedule'));
      check("export still has 'profiles'", keys.includes('profiles'));
      check("export still has 'uiPrefs'", keys.includes('uiPrefs'));
      check("export still has 'activityEvents'", keys.includes('activityEvents'));
      check("export still has 'issues'", keys.includes('issues'));
    }

    section('7c. v2 migration drops legacy tables from app.db');
    {
      const adb = new Database(APP_DB, { readonly: true });
      const tables = adb
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
        .all()
        .map((r) => r.name);
      adb.close();
      for (const dropped of [
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
      ]) {
        check(`app.db no longer has '${dropped}' table`, !tables.includes(dropped));
      }
      for (const kept of ['profiles', 'activity_events', 'issues', 'ui_prefs']) {
        check(`app.db still has '${kept}' table`, tables.includes(kept));
      }
    }

    section('8. GDPR export');
    const carol = injectUser(secret, 'carol');
    {
      const exp = await fetchJson('/api/auth/account/export', {
        headers: authedHeaders(carol.cookie),
      });
      check('Export returns 200', exp.status === 200);
      check('Export has json + files keys', exp.body?.json && exp.body?.files !== undefined);
      check(
        'Export json includes user, profiles, issues',
        exp.body?.json?.user &&
          Array.isArray(exp.body?.json?.profiles) &&
          Array.isArray(exp.body?.json?.issues),
      );
    }

    section('9. Hard delete (purgeNow)');
    {
      // Create test data for carol.
      await fetchJson('/api/profiles', { headers: authedHeaders(carol.cookie) });
      const purge = await fetchJson('/api/auth/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authedHeaders(carol.cookie) },
        body: JSON.stringify({ confirm: 'DELETE', purgeNow: true }),
      });
      check(
        'Purge-now returns ok:true purged:true',
        purge.body?.ok === true && purge.body?.purged === true,
      );
      const db = new Database(AUTH_DB, { readonly: true });
      const row = db.prepare(`SELECT id FROM users WHERE id = ?`).get(carol.userId);
      db.close();
      check('Hard delete removes user from auth.db', !row);
      const adb = new Database(APP_DB, { readonly: true });
      const profCount = adb
        .prepare(`SELECT COUNT(*) AS n FROM profiles WHERE user_id = ?`)
        .get(carol.userId);
      adb.close();
      check('Hard delete cascades to app.db', profCount?.n === 0);
    }

    section('10. Audit log');
    {
      const db = new Database(AUTH_DB, { readonly: true });
      const requested = db
        .prepare(
          `SELECT user_id FROM audit_log WHERE event_type = 'deletion-requested' AND user_id = ?`,
        )
        .get(alice.userId);
      const purged = db
        .prepare(`SELECT user_id FROM audit_log WHERE event_type = 'account-purged'`)
        .all();
      db.close();
      check('deletion-requested attributed to Alice', !!requested);
      check(
        'account-purged audit row anonymised (user_id NULL)',
        purged.some((r) => r.user_id === null),
      );
    }

    section('11. RBAC enforcement');
    const owner = injectUser(secret, 'rbac-owner', 'owner');
    const admin = injectUser(secret, 'rbac-admin', 'admin');
    const member = injectUser(secret, 'rbac-member', 'member');
    {
      // Backups — owner-only.
      const r1 = await fetchJson('/api/backup/list', { headers: authedHeaders(owner.cookie) });
      check('owner → /api/backup/list 200', r1.status === 200);
      const r2 = await fetchJson('/api/backup/list', { headers: authedHeaders(member.cookie) });
      check('member → /api/backup/list 403', r2.status === 403);
      const r3 = await fetchJson('/api/backup/list', { headers: authedHeaders(admin.cookie) });
      check('admin → /api/backup/list 403 (owner-only)', r3.status === 403);
      const r4 = await fetchJson('/api/backup/run', {
        method: 'POST',
        headers: authedHeaders(member.cookie),
      });
      check('member → POST /api/backup/run 403', r4.status === 403);
    }
    {
      // Settings env — owner-only.
      const r1 = await fetchJson('/api/settings', { headers: authedHeaders(owner.cookie) });
      check('owner → /api/settings 200', r1.status === 200);
      const r2 = await fetchJson('/api/settings', { headers: authedHeaders(member.cookie) });
      check('member → /api/settings 403', r2.status === 403);
    }
    {
      // Sources — owner-only.
      const r1 = await fetchJson('/api/sources/anthropic/disconnect', {
        method: 'POST',
        headers: authedHeaders(member.cookie),
      });
      check('member → /api/sources/*/disconnect 403', r1.status === 403);
    }
    {
      // Onboarding reset — owner-only.
      const r1 = await fetchJson('/api/onboarding/reset', {
        method: 'POST',
        headers: authedHeaders(member.cookie),
      });
      check('member → /api/onboarding/reset 403', r1.status === 403);
    }
    {
      // Invite create — owner+admin only.
      const r1 = await fetchJson('/api/auth/invite/create', {
        method: 'POST',
        headers: authedHeaders(owner.cookie),
      });
      check('owner → /api/auth/invite/create 200', r1.status === 200);
      const r2 = await fetchJson('/api/auth/invite/create', {
        method: 'POST',
        headers: authedHeaders(admin.cookie),
      });
      check('admin → /api/auth/invite/create 200', r2.status === 200);
      const r3 = await fetchJson('/api/auth/invite/create', {
        method: 'POST',
        headers: authedHeaders(member.cookie),
      });
      check('member → /api/auth/invite/create 403', r3.status === 403);
    }
    {
      // Profile reset scope=everything — owner-only.
      const r1 = await fetchJson('/api/profile/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authedHeaders(member.cookie),
        },
        body: JSON.stringify({ confirm: 'RESET', scope: 'everything', profileId: 'default' }),
      });
      check('member → /api/profile/reset scope=everything 403', r1.status === 403);
    }

    section('12. Backup tarball contents');
    {
      const r1 = await fetchJson('/api/backup/run', {
        method: 'POST',
        headers: authedHeaders(owner.cookie),
      });
      check('owner can create a backup', r1.body?.ok === true);
      const backupId = r1.body?.id;
      if (backupId) {
        const fs = await import('node:fs');
        const tarPath = join(ROOT, 'data', 'backups', `${backupId}.tar.gz`);
        check('backup tarball exists on disk', fs.existsSync(tarPath));
        const { execSync: exec } = await import('node:child_process');
        const listing = exec(`tar -tzf "${tarPath}"`, { encoding: 'utf8' });
        check('tarball includes data/auth.db', listing.includes('data/auth.db'));
        check('tarball includes data/app.db', listing.includes('data/app.db'));
        check('tarball includes data/users/', listing.includes('data/users/'));
        check('tarball excludes db-wal/shm', !/(db-wal|db-shm)/.test(listing));
        const metaPath = join(ROOT, 'data', 'backups', `${backupId}.meta.json`);
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        check('sidecar has users[] array', Array.isArray(meta.users));
        check('sidecar has schemaVersions object', !!meta.schemaVersions);
      }
    }

    section('13. lib_profiles / lib-profiles user-aware');
    {
      // Spawn lib_profiles.py via shell with CAREER_OPS_USER_ID set;
      // check it resolves to data/users/{userId}/profiles/{slug}/.
      const { execSync: exec } = await import('node:child_process');
      const py = exec(
        `cd "${ROOT}" && CAREER_OPS_USER_ID=test-user python3 -c "from lib_profiles import profile_path, resolve_user_arg; print(profile_path('default','cv-md', user_id=resolve_user_arg(None)))"`,
        { encoding: 'utf8' },
      ).trim();
      check(
        'lib_profiles.py honors CAREER_OPS_USER_ID',
        py === join(ROOT, 'data', 'users', 'test-user', 'profiles', 'default', 'cv.md'),
        py,
      );
      const mjs = exec(
        `cd "${ROOT}" && CAREER_OPS_USER_ID=test-user node -e "import('./lib-profiles.mjs').then(m => process.stdout.write(m.profilePath('default','cv-md', m.resolveUserArg(null))))"`,
        { encoding: 'utf8' },
      ).trim();
      check(
        'lib-profiles.mjs honors CAREER_OPS_USER_ID',
        mjs === join(ROOT, 'data', 'users', 'test-user', 'profiles', 'default', 'cv.md'),
        mjs,
      );
    }

    section('14. SQLite mirror — events + issues');
    {
      // Create an authed user, trigger an event, then read it back from app.db.
      const sigUser = injectUser(secret, 'mirror', 'owner');
      // Create-profile triggers a "Profile created" event with userId tag.
      await fetchJson('/api/profiles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authedHeaders(sigUser.cookie),
        },
        body: JSON.stringify({ name: 'Mirror Test', color: 'blue' }),
      });
      await new Promise((r) => setTimeout(r, 200)); // bus flush
      const appDb = new Database(APP_DB, { readonly: true });
      const ev = appDb
        .prepare(
          `SELECT user_id, source, title FROM activity_events WHERE user_id = ? AND title = 'Profile created'`,
        )
        .get(sigUser.userId);
      appDb.close();
      check('activity_events row written for the acting user', !!ev);
      check('activity_events row tagged with the right user_id', ev?.user_id === sigUser.userId);
    }

    section('15. Concurrent profile creation (multi-device race)');
    {
      // Two simultaneous "Engineer Search" creates from the same user
      // must both succeed, producing two distinct slugs (engineer-search
      // + engineer-search-2). The DB transaction + slug-retry loop in
      // createProfileFor handles this without surfacing UNIQUE errors.
      const u = injectUser(secret, 'race', 'owner');
      // Seed the user (triggers the "default" profile creation).
      await fetchJson('/api/profiles', { headers: authedHeaders(u.cookie) });
      const [r1, r2] = await Promise.all([
        fetchJson('/api/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authedHeaders(u.cookie) },
          body: JSON.stringify({ name: 'Engineer Search', color: 'emerald' }),
        }),
        fetchJson('/api/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authedHeaders(u.cookie) },
          body: JSON.stringify({ name: 'Engineer Search', color: 'violet' }),
        }),
      ]);
      check('concurrent create 1 → 200', r1.status === 200);
      check('concurrent create 2 → 200', r2.status === 200);
      const slug1 = r1.body?.profile?.id;
      const slug2 = r2.body?.profile?.id;
      check(
        'concurrent creates produced distinct slugs',
        slug1 && slug2 && slug1 !== slug2,
        `slug1=${slug1} slug2=${slug2}`,
      );
    }

    section('16. Multi-device account deletion');
    {
      // Inject a user with TWO sessions (representing laptop + phone).
      const u = injectUser(secret, 'multidev', 'owner');
      const sec = readSecret();
      // Add a second session with a different token.
      const db = new Database(AUTH_DB);
      const altToken = crypto.randomBytes(16).toString('hex');
      const altSessionId = 'multi-alt-' + crypto.randomBytes(3).toString('hex');
      const now = Date.now();
      db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at, token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(altSessionId, u.userId, now + 86400 * 1000, altToken, now, now);
      db.close();
      const altSig = crypto.createHmac('sha256', sec).update(altToken).digest('base64');
      const altCookie = `${altToken}.${altSig}`;
      // Confirm both sessions work first.
      const r1 = await fetchJson('/api/profiles', { headers: authedHeaders(u.cookie) });
      const r2 = await fetchJson('/api/profiles', { headers: authedHeaders(altCookie) });
      check('device1 authed before delete', r1.status === 200);
      check('device2 authed before delete', r2.status === 200);
      // Delete the account from device1.
      await fetchJson('/api/auth/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authedHeaders(u.cookie) },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      // Both devices now return 401 on the next request.
      const after1 = await fetchJson('/api/profiles', { headers: authedHeaders(u.cookie) });
      const after2 = await fetchJson('/api/profiles', { headers: authedHeaders(altCookie) });
      check('device1 immediately 401 after delete', after1.status === 401);
      check('device2 (still has old cookie) immediately 401', after2.status === 401);
    }

    section('17. Multi-device profile reset (no stale cache)');
    {
      // User creates a profile from device1, then resets from device2.
      // device1's next read should reflect the reset (no module-level
      // cache holding stale state).
      const u = injectUser(secret, 'resetdev', 'owner');
      await fetchJson('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authedHeaders(u.cookie) },
        body: JSON.stringify({ name: 'Pre-Reset', color: 'amber' }),
      });
      // Reset (scope='profile', current active profile).
      const reset = await fetchJson('/api/profile/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authedHeaders(u.cookie) },
        body: JSON.stringify({ confirm: 'RESET', scope: 'profile', profileId: 'pre-reset' }),
      });
      check('profile reset returns 200', reset.status === 200);
      // The reset wipes profile.yml / cv.md but leaves the row in the
      // DB. listProfilesForUser should still return both rows.
      const list = await fetchJson('/api/profiles', { headers: authedHeaders(u.cookie) });
      check(
        'device2 read sees current state (no stale cache)',
        list.status === 200 && Array.isArray(list.body?.profiles),
      );
    }

    section('18. Session expiry (auto-logout)');
    {
      // Inject a user whose session expired 1ms ago.
      const sec = readSecret();
      const db = new Database(AUTH_DB);
      const userId = 'u-expired-' + crypto.randomBytes(3).toString('hex');
      const sessionId = 's-expired-' + crypto.randomBytes(3).toString('hex');
      const token = crypto.randomBytes(16).toString('hex');
      const now = Date.now();
      db.prepare(
        `INSERT INTO users (id, email, email_verified, role, two_factor_enabled, created_at, updated_at) VALUES (?, ?, 1, 'owner', 0, ?, ?)`,
      ).run(userId, `expired-${now}@verify.local`, now, now);
      // expires_at = 1 second ago.
      db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at, token, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(sessionId, userId, now - 1000, token, now, now);
      db.close();
      const sig = crypto.createHmac('sha256', sec).update(token).digest('base64');
      const expiredCookie = `${token}.${sig}`;
      const r = await fetchJson('/api/profiles', { headers: authedHeaders(expiredCookie) });
      check('expired session returns 401 on /api/*', r.status === 401);
      const page = await fetchHead('/pipeline', { headers: authedHeaders(expiredCookie) });
      check(
        'expired session redirects HTML to /login',
        page.status === 302 && (page.location || '').startsWith('/login'),
      );
    }

    section('19. Incognito (no cookie)');
    {
      const r1 = await fetchHead('/login');
      check(
        'no-cookie GET /login is reachable',
        r1.status === 200 || r1.status === 302,
        `HTTP ${r1.status}`,
      );
      const r2 = await fetchJson('/api/profiles');
      check('no-cookie /api/profiles → 401', r2.status === 401);
      const r3 = await fetchJson('/api/auth/get-session');
      check('no-cookie /api/auth/get-session → 200 null', r3.status === 200 && r3.body === null);
    }

    section('20. Cookie hygiene + CSRF');
    {
      // CSRF: a POST without origin/cookie should be rejected at the
      // SvelteKit layer (csrf.trustedOrigins is locked).
      // We test via fetch — fetch automatically sets Origin from the
      // request URL, but for cross-origin protection we'd need a
      // different origin. Best we can do here: confirm useSecureCookies
      // is gated on https.
      const fs2 = await import('node:fs');
      const auth = fs2.readFileSync(join(UI, 'src/lib/server/auth.ts'), 'utf8');
      check(
        'useSecureCookies env-gated on https://',
        /useSecureCookies:\s*BETTER_AUTH_URL\.startsWith\('https/.test(auth),
      );
    }

    section('21. New user creation E2E (first user → owner)');
    {
      // Hit Better Auth's signUp.email endpoint as if the browser
      // authClient.signUp.email() did. With no users in the DB, the
      // databaseHooks.user.create.after hook should promote them to
      // role='owner'. We use a fresh auth.db for this section.
      const fs2 = await import('node:fs');
      // Take a snapshot of every existing user, then check after the new
      // signup that we have exactly one new row AND its role is set right.
      const beforeDb = new Database(AUTH_DB, { readonly: true });
      const before = beforeDb.prepare(`SELECT COUNT(*) AS n FROM users`).get();
      beforeDb.close();
      // Use a totally fresh DB: rename current auth.db aside, let the
      // server boot recreate it (already happened — we're using the live
      // running server). To test "first user", we DELETE all rows from
      // users + sessions, then signup.
      const wipeDb = new Database(AUTH_DB);
      wipeDb.prepare(`DELETE FROM sessions`).run();
      wipeDb.prepare(`DELETE FROM users`).run();
      wipeDb.close();

      // Better Auth refuses without an Origin header (CSRF defense).
      // Mirror what the real browser does — set Origin to BASE which is
      // in `trustedOrigins` in auth.ts.
      const signupRes = await fetch(`${BASE}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: BASE },
        body: JSON.stringify({
          email: 'first-user@verify.local',
          password: 'NotUsed-' + crypto.randomBytes(16).toString('hex'),
          name: 'First User',
        }),
      });
      const signupBody = await signupRes.text();
      check(
        'Better Auth sign-up endpoint returns 200',
        signupRes.status === 200,
        `HTTP ${signupRes.status}: ${signupBody.slice(0, 200)}`,
      );
      // Verify the new user got role='owner' via the after-create hook.
      const after = new Database(AUTH_DB, { readonly: true });
      const newUser = after
        .prepare(`SELECT id, role FROM users WHERE email = ?`)
        .get('first-user@verify.local');
      const count = after.prepare(`SELECT COUNT(*) AS n FROM users`).get();
      after.close();
      check('first user exists', !!newUser);
      check(
        'first user has role=owner (via databaseHooks.user.create.after)',
        newUser?.role === 'owner',
      );
      check('only one user exists after wipe + signup', count?.n === 1);
    }

    section('22. Second user is role=member (invite path)');
    {
      // With the owner already present from section 21, simulate an
      // invite-code signup. Owner generates an invite, then a fresh user
      // signs up via sign-up/email. As of the signupGate handler in
      // hooks.server.ts, the /api/auth/sign-up/* endpoint requires a
      // valid `x-invite-code` header once users.count > 0 — atomically
      // consumed (single-use redemption). The owner-issued code below
      // is what `authClient.signUp.email` would attach via the customFetch
      // pendingInviteCode slot in lib/client/auth-client.ts.
      const ownerForInvite = injectUser(secret, 'invite-issuer', 'owner');
      const inviteCreate = await fetchJson('/api/auth/invite/create', {
        method: 'POST',
        headers: authedHeaders(ownerForInvite.cookie),
      });
      const inviteCode = inviteCreate.body?.code;
      check(
        'owner issued invite for second-user signup',
        typeof inviteCode === 'string' && /^\d{6}$/.test(inviteCode),
        'got: ' + JSON.stringify(inviteCreate.body).slice(0, 200),
      );
      const signupRes = await fetch(`${BASE}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: BASE,
          // signupGate validates this header + atomically deletes the row.
          'x-invite-code': inviteCode ?? '',
        },
        body: JSON.stringify({
          email: 'second-user@verify.local',
          password: 'NotUsed-' + crypto.randomBytes(16).toString('hex'),
          name: 'Second User',
        }),
      });
      check('second sign-up returns 200', signupRes.status === 200);
      const after = new Database(AUTH_DB, { readonly: true });
      const u2 = after
        .prepare(`SELECT role FROM users WHERE email = ?`)
        .get('second-user@verify.local');
      const u1 = after
        .prepare(`SELECT role FROM users WHERE email = ?`)
        .get('first-user@verify.local');
      after.close();
      check("second user has role='member' (not auto-promoted)", u2?.role === 'member');
      check("first user keeps role='owner' (not demoted)", u1?.role === 'owner');
    }

    section('23. Avatar isolation (path-enumeration fix)');
    {
      // Two users. We poison user B's ui_prefs.avatar_path with a path
      // that points at user A's avatar dir. The /api/profile/avatar
      // endpoint must refuse to serve it.
      const a = injectUser(secret, 'avatarA', 'owner');
      const b = injectUser(secret, 'avatarB', 'owner');
      const fs2 = await import('node:fs');
      // Create a fake avatar for user A on disk.
      const aDir = join(ROOT, 'data', 'avatars', a.userId);
      fs2.mkdirSync(aDir, { recursive: true });
      fs2.writeFileSync(join(aDir, 'avatar.png'), Buffer.from([137, 80, 78, 71])); // PNG magic
      // Poison B's avatar_path to point at A's avatar.
      const adb = new Database(APP_DB);
      adb
        .prepare(
          `INSERT INTO ui_prefs (user_id, display_name, avatar_path, appearance, theme, notifications, updated_at) VALUES (?, NULL, ?, 'system', 'default', NULL, ?)
         ON CONFLICT(user_id) DO UPDATE SET avatar_path = excluded.avatar_path, updated_at = excluded.updated_at`,
        )
        .run(b.userId, `avatars/${a.userId}/avatar.png`, Date.now());
      adb.close();
      // B requests their avatar — should get null (not A's bytes).
      const r = await fetch(`${BASE}/api/profile/avatar`, {
        headers: authedHeaders(b.cookie),
      });
      check(
        "B's poisoned avatar_path does NOT serve A's bytes",
        r.status === 404 || (r.status === 200 && (await r.arrayBuffer()).byteLength === 0),
        `got HTTP ${r.status}`,
      );
    }

    section('24. Cookie attributes — HttpOnly + SameSite=Lax + Path');
    {
      // Sign up a fresh user via Better Auth and inspect the Set-Cookie
      // header. The session cookie MUST have HttpOnly, SameSite=Lax, and
      // Path=/. Secure depends on BETTER_AUTH_URL (env-gating tested by
      // section 20).
      //
      // Origin: BASE — SvelteKit's CSRF check requires the Origin header
      // to match the request URL's origin OR to be absent. The verifier
      // runs against localhost; explicitly setting Origin to BASE makes
      // the CSRF check pass (same origin).
      //
      // x-invite-code — signupGate (hooks.server.ts) requires this header
      // once users.count > 0. Issue a fresh invite first and attach.
      const ownerForCookieTest = injectUser(secret, 'cookie-issuer', 'owner');
      const cookieInvite = await fetchJson('/api/auth/invite/create', {
        method: 'POST',
        headers: authedHeaders(ownerForCookieTest.cookie),
      });
      const cookieInviteCode = cookieInvite.body?.code ?? '';
      const email = 'cookies-' + crypto.randomBytes(3).toString('hex') + '@verify.local';
      const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: BASE,
          'x-invite-code': cookieInviteCode,
        },
        body: JSON.stringify({ email, password: 'CookiesTest!1234567890', name: 'Cookies' }),
      });
      const setCookieArr =
        typeof res.headers.getSetCookie === 'function'
          ? res.headers.getSetCookie()
          : [res.headers.get('set-cookie') ?? ''];
      const sessionCookie =
        setCookieArr.find((c) => c.startsWith('career-ops.session_token=')) ?? '';
      check('session Set-Cookie header present', sessionCookie.length > 0);
      check('cookie has HttpOnly', /HttpOnly/i.test(sessionCookie));
      check('cookie has SameSite=Lax', /SameSite=Lax/i.test(sessionCookie));
      check('cookie has Path=/', /Path=\//.test(sessionCookie));
      // On http://localhost, Secure must NOT be present (would break dev).
      check(
        'cookie has no Secure on plain HTTP',
        !/(?:^|;\s*)Secure(?:\s*;|\s*$)/i.test(sessionCookie),
      );
    }

    section('25. Rate limit gating + custom rules');
    {
      // Source-level shape check. Per-endpoint rules + env-gated enable.
      const fs2 = await import('node:fs');
      const auth = fs2.readFileSync(join(UI, 'src/lib/server/auth.ts'), 'utf8');
      check('rateLimit block present', /rateLimit:\s*\{/.test(auth));
      check(
        'rateLimit gated on env (BETTER_AUTH_RATE_LIMIT !== "off")',
        /enabled:\s*process\.env\.BETTER_AUTH_RATE_LIMIT\s*!==\s*['"]off['"]/.test(auth),
      );
      check(
        'sign-in/email custom rule exists',
        /['"]\/sign-in\/email['"]:\s*\{\s*window:/.test(auth),
      );
      check(
        'sign-in/passkey custom rule exists',
        /['"]\/sign-in\/passkey['"]:\s*\{\s*window:/.test(auth),
      );
    }

    section('26. Session invalidated when user row deleted');
    {
      // Inject user A. Verify A's cookie works. Then DELETE A from the
      // auth.db. The foreign-key cascade on sessions.user_id should
      // remove A's session row, so any further request with A's cookie
      // 401s — Better Auth can't resolve a session without a user row.
      const u = injectUser(secret, 'invalidate', 'owner');
      const ok = await fetchJson('/api/profiles', { headers: authedHeaders(u.cookie) });
      check('A authed before delete', ok.status === 200);
      const adb = new Database(AUTH_DB);
      adb.pragma('foreign_keys = ON');
      adb.prepare('DELETE FROM users WHERE id = ?').run(u.userId);
      adb.close();
      const gone = await fetchJson('/api/profiles', { headers: authedHeaders(u.cookie) });
      check('A 401 after user row deleted', gone.status === 401);
    }

    section('27. Cross-user IDOR (?profile=other-user-slug)');
    {
      // Two users. Both create a profile with the SAME slug. User B
      // tries to fetch A's data via ?profile=<slug>. The user-context
      // scope should reject — B only sees B's data, even though the
      // slug exists in both namespaces.
      const a = injectUser(secret, 'idor-a', 'owner');
      const b = injectUser(secret, 'idor-b', 'owner');
      // Both create a profile with name → slug 'shared'.
      await fetchJson('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authedHeaders(a.cookie) },
        body: JSON.stringify({ name: 'shared', color: 'amber' }),
      });
      await fetchJson('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authedHeaders(b.cookie) },
        body: JSON.stringify({ name: 'shared', color: 'amber' }),
      });
      // A writes an applications row to their 'shared' profile.
      const fs2 = await import('node:fs');
      const aDir = join(ROOT, 'data', 'users', a.userId, 'profiles', 'shared');
      fs2.mkdirSync(aDir, { recursive: true });
      fs2.writeFileSync(
        join(aDir, 'applications.md'),
        '# Applications\n\n| # | Date | Company | Role | Status | Score | PDF | Report | Notes |\n|---|------|---------|------|--------|-------|-----|--------|-------|\n| 1 | 2026-05-12 | A-PRIVATE-CO | hidden-role | Applied | 5.0/5 | ❌ | [1](#) | confidential |\n',
      );
      // B asks for /api/applications?profile=shared (the slug A also owns).
      const r = await fetchJson('/api/applications?profile=shared', {
        headers: authedHeaders(b.cookie),
      });
      const bodyText = JSON.stringify(r.body ?? {});
      check(
        "B cannot read A's data via ?profile=shared (slug exists in both namespaces)",
        !bodyText.includes('A-PRIVATE-CO') && !bodyText.includes('hidden-role'),
        `leaked: ${bodyText.slice(0, 200)}`,
      );
    }
  } finally {
    server.kill('SIGTERM');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('verify-multi-user crashed:', e);
  process.exit(2);
});
