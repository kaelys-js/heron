/**
 * auth — Better Auth singleton.
 *
 * Authentication strategy for career-ops:
 *
 *   • Passkeys (WebAuthn): primary credential type. Sync via iCloud
 *     Keychain (Apple) / Google Password Manager (Android+Chrome). No
 *     password to leak, no email round-trip, works offline once enrolled.
 *
 *   • GitHub OAuth: optional, env-gated. Set GITHUB_CLIENT_ID +
 *     GITHUB_CLIENT_SECRET in .env to enable. Lets a developer sign in
 *     with their existing GitHub account on first launch without
 *     creating yet another credential.
 *
 *   • Local invite codes: replaces email magic links. The first user
 *     ("owner") generates a 6-digit code from the running dashboard; the
 *     invitee enters it on the signup page. Codes expire after 30min and
 *     are single-use. Works offline, no SMTP, no third-party.
 *
 *   • Email + password is DISABLED. We never want passwords in this app.
 *
 * Database: drizzle-adapter against the `auth.db` SQLite file. Schema
 * defined in `db/auth-schema.ts`; create-on-first-boot DDL in
 * `db/migrate.ts:ensureSchema()`.
 *
 * Secret: BETTER_AUTH_SECRET in .env. If missing on first boot we
 * generate one and persist it (via `writeEnv()`) so the user never sees
 * "missing secret" errors.
 *
 * Base URL: BETTER_AUTH_URL or auto-derived. SvelteKit's RequestEvent
 * passes the full URL through so the auth callbacks always know the
 * right origin (works in dev :5173, Capacitor capacitor://, Electron
 * file://).
 */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { passkey } from '@better-auth/passkey';
import crypto from 'node:crypto';
import { authDb } from './db';
import { ensureSchema } from './db/migrate';
import * as authSchema from './db/auth-schema';
import { writeEnv } from './env';

// Run the idempotent DDL bootstrap before Better Auth touches the DB.
ensureSchema();

/** Ensure a stable secret exists; persist to .env on first boot. */
function getOrCreateSecret(): string {
  let secret = process.env.BETTER_AUTH_SECRET;
  if (secret && secret.length >= 32) return secret;
  secret = crypto.randomBytes(32).toString('hex'); // 64 hex chars
  process.env.BETTER_AUTH_SECRET = secret;
  try {
    // writeEnv() ignores keys it doesn't know about — fall back to
    // appending directly so the value persists.
    persistSecretToEnv(secret);
  } catch {
    /* read-only filesystem or similar — secret stays in-memory for this run. */
  }
  return secret;
}

function persistSecretToEnv(secret: string): void {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const ROOT = path.resolve(process.cwd(), '..');
  const ENV_FILE = path.join(ROOT, '.env');
  let existing = '';
  if (fs.existsSync(ENV_FILE)) existing = fs.readFileSync(ENV_FILE, 'utf8');
  if (/^BETTER_AUTH_SECRET=/m.test(existing)) {
    existing = existing.replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET=${secret}`);
  } else {
    existing = existing.replace(/\s*$/, '') + `\nBETTER_AUTH_SECRET=${secret}\n`;
  }
  fs.writeFileSync(ENV_FILE, existing);
}

const BETTER_AUTH_SECRET = getOrCreateSecret();
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || 'http://localhost:5173';

const githubClientId = process.env.GITHUB_CLIENT_ID;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
const githubEnabled = Boolean(githubClientId && githubClientSecret);

// Map Drizzle tables to Better Auth's model names. With `usePlural: true`
// (set on the adapter below), the keys here MUST be plural and match
// Better Auth's expected pluralised model names exactly.
const drizzleSchema = {
  users: authSchema.users,
  sessions: authSchema.sessions,
  accounts: authSchema.accounts,
  verifications: authSchema.verifications,
  passkeys: authSchema.passkeys,
};

export const auth = betterAuth({
  appName: 'career-ops',
  secret: BETTER_AUTH_SECRET,
  baseURL: BETTER_AUTH_URL,

  database: drizzleAdapter(authDb, {
    provider: 'sqlite',
    schema: drizzleSchema,
    // Better Auth's default plural-name strategy matches our schema
    // (`users`, `sessions`, `accounts`, `verifications`).
    usePlural: true,
  }),

  // Email+password disabled — we use passkeys + GitHub + invite codes.
  emailAndPassword: {
    enabled: false,
  },

  // Same-origin only in normal browser/web mode. Capacitor + Electron
  // talk to the embedded server over http://localhost which is also
  // same-origin once the WebView is loaded, so no extra origins needed.
  trustedOrigins: [
    'http://localhost:5173',
    'http://localhost:4173',
    'http://localhost:5174',
    'capacitor://localhost',
    'http://localhost',
  ],

  socialProviders: githubEnabled
    ? {
        github: {
          clientId: githubClientId!,
          clientSecret: githubClientSecret!,
        },
      }
    : {},

  plugins: [
    passkey({
      rpName: 'career-ops',
      // rpID is the host (no port, no protocol). Same for dev + prod
      // because everything runs on localhost or the user's LAN IP.
      rpID: new URL(BETTER_AUTH_URL).hostname,
      origin: BETTER_AUTH_URL,
    }),
  ],

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh token if older than 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 min — speeds up every authed request
    },
  },

  // Better Auth respects this list of advanced cookie attrs even in
  // localhost development. `sameSite: 'lax'` is the right default for
  // OAuth callbacks; we override to 'none' in cross-origin contexts
  // (none currently used).
  advanced: {
    cookiePrefix: 'career-ops',
    useSecureCookies: false, // localhost dev — Capacitor/Electron also OK
  },
});

/** Whether GitHub OAuth is wired (env vars present). UI uses this to
 *  decide whether to show the "Sign in with GitHub" button. */
export const isGithubEnabled = (): boolean => githubEnabled;

/** Re-export `auth.api` for direct calls (e.g. server-only helpers). */
export const authApi = auth.api;
