/**
 * auth -- Better Auth singleton.
 *
 * Authentication strategy for heron:
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
import { bearer } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { authDb } from './db';
import { ensureSchema } from './db/migrate';
import * as authSchema from './db/auth-schema';
import { writeEnv } from './env';
import { logEvent, reportServerError } from './events';
import { BRAND } from '$lib/client/brand';

// Run the idempotent DDL bootstrap before Better Auth touches the DB.
ensureSchema();

/** Ensure a stable secret exists; persist to .env on first boot. */
function getOrCreateSecret(): string {
  let secret = process.env.BETTER_AUTH_SECRET;
  if (secret && secret.length >= 32) return secret;
  secret = crypto.randomBytes(32).toString('hex'); // 64 hex chars
  process.env.BETTER_AUTH_SECRET = secret;
  try {
    // writeEnv() ignores keys it doesn't know about -- fall back to
    // appending directly so the value persists.
    persistSecretToEnv(secret);
  } catch (e) {
    // Read-only filesystem or similar -- the secret will stay in-memory
    // for this run, which means every restart re-generates and every
    // session is invalidated. Surface it so the operator knows.
    // eslint-disable-next-line no-console
    console.warn(
      '[auth] Could not persist BETTER_AUTH_SECRET to .env; sessions will not survive restart:',
      e instanceof Error ? e.message : String(e),
    );
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
  // Sourced from BRAND so a rebrand in branding/brand.json propagates
  // automatically. Previously hardcoded "heron" which would
  // silently drift on rename.
  appName: BRAND.name,
  secret: BETTER_AUTH_SECRET,
  baseURL: BETTER_AUTH_URL,

  database: drizzleAdapter(authDb, {
    provider: 'sqlite',
    schema: drizzleSchema,
    // Better Auth's default plural-name strategy matches our schema
    // (`users`, `sessions`, `accounts`, `verifications`).
    usePlural: true,
  }),

  // Email+password: enabled ONLY because Better Auth's signUp.email
  // endpoint is how we create new user rows (the actual login is
  // passkey-only via the /login page; the password field is never shown
  // to the user and gets a random UUID we never surface).
  //
  // To prevent password-based sign-in, we set `disableSignUp: false`
  // (signUp must work to create the row) but the /login UI exposes
  // only the passkey button. A determined attacker who guesses the
  // random UUID + email could in theory sign in, but the UUID has
  // 122 bits of entropy and isn't logged anywhere.
  emailAndPassword: {
    enabled: true,
    disableSignUp: false,
    autoSignIn: true, // sign the user in immediately after sign-up
    requireEmailVerification: false,
  },

  /**
   * Auto-promote the FIRST user on a fresh install to role='owner'.
   *
   * Better Auth's default INSERT writes role='member' (the column default).
   * On an install that previously had no users, the very next signup IS
   * the install owner. We can't reliably check user-count BEFORE the
   * insert (race with concurrent first signups), so we check AFTER and
   * upgrade the role if this user's id was the lowest-created.
   *
   * Subsequent signups (after an invite-code claim) keep role='member' --
   * the owner can promote them to 'admin' via /settings/users.
   */
  databaseHooks: {
    user: {
      create: {
        after: async (user: { id: string; email?: string; name?: string }) => {
          let promotedToOwner = false;
          try {
            const [{ n }] = authDb
              .select({ n: sql<number>`count(*)` })
              .from(authSchema.users)
              .all();
            if (n === 1) {
              authDb
                .update(authSchema.users)
                .set({ role: 'owner' })
                .where(eq(authSchema.users.id, user.id))
                .run();
              promotedToOwner = true;
            }
          } catch (e) {
            // Non-fatal -- the user keeps their default 'member' role.
            // /settings/users gives a path to fix this manually later.
            // Surface so we can audit when owner-promotion misfires.
            reportServerError('auth', 'Owner auto-promotion failed', e, {
              category: 'user',
              userId: user.id,
            });
          }
          logEvent('auth', 'User created' + (promotedToOwner ? ' (owner)' : ''), {
            level: 'info',
            category: 'user',
            userId: user.id,
            message: user.email || user.name || user.id,
          });
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          // Sign-in events. Better Auth creates a session after a
          // successful passkey/email/OAuth completion, so this single
          // hook covers every auth path.
          logEvent('auth', 'Sign-in', {
            level: 'info',
            category: 'user',
            userId: session.userId,
            message: session.ipAddress ? 'ip=' + session.ipAddress : undefined,
          });
        },
      },
    },
  },

  // Trusted origins for CSRF + cookie purposes.
  //
  //   • http://localhost (no port) -- Capacitor WebView + Electron
  //   • capacitor://localhost      -- Capacitor iOS scheme
  //   • http://localhost:*         -- every dev / preview / verifier port
  //   • Tailscale magic-DNS        -- *.ts.net for remote LAN access
  //
  // Better Auth supports wildcard ports via `localhost:*` and subdomain
  // wildcards via `*.ts.net`. These are the only patterns we ever want
  // to talk auth from.
  trustedOrigins: [
    'http://localhost',
    'http://localhost:*',
    'https://localhost:*',
    'capacitor://localhost',
    // Custom URL scheme used by the iOS WebView. Pulled from BRAND so
    // a urlScheme rename in branding/brand.json doesn't silently lock
    // the iOS WebView out of better-auth's CSRF allow-list.
    `${BRAND.urlScheme}://localhost`,
    `${BRAND.urlScheme}://*`,
    'http://*.ts.net',
    'https://*.ts.net',
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
      // rpName is the user-facing "Relying Party Name" shown in the
      // iOS / browser passkey dialogs ("Sign in to <brand> with your
      // passkey"). Pulled from BRAND so it tracks the display-name
      // rebrand in branding/brand.json automatically.
      rpName: BRAND.displayName,
      // rpID is the host (no port, no protocol). Same for dev + prod
      // because everything runs on localhost or the user's LAN IP.
      rpID: new URL(BETTER_AUTH_URL).hostname,
      origin: BETTER_AUTH_URL,
    }),
    // bearer -- adds Authorization-header session support alongside cookies.
    // Required for the Capacitor WebView (origin `heron://localhost`),
    // where cookies set on the backend origin (`http://lan-ip:5173`) don't
    // travel back to the WebView. After every sign-in/sign-up the response
    // carries `Set-Auth-Token: <token>`; the client (auth-client.ts custom
    // fetch) captures it, stores in Capacitor Preferences, and replays on
    // every subsequent request as `Authorization: Bearer <token>`. Web
    // browsers keep using cookies -- both paths coexist transparently.
    bearer(),
  ],

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh token if older than 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 min -- speeds up every authed request
    },
  },

  // Defense against brute-force / credential-stuffing on auth endpoints.
  // Better Auth's built-in limiter sits in-memory; defaults are fine
  // for a single-instance install. If you ever shard across processes
  // pass a custom `storage` adapter that backs onto Redis or similar.
  //
  //   • window: rolling 60s
  //   • max:    10 requests / window / IP for sensitive endpoints
  //     (sign-in, sign-up, password reset, OAuth callback). Other
  //     endpoints inherit the global default.
  //   • The limiter applies per remote IP; behind Tailscale the IP is
  //     the device's tailnet address (unique per user device).
  rateLimit: {
    // Disable in CI / test envs so verify-multi-user can fire its 100+
    // sequential auth-cookie requests without false-positive 429s.
    // Production limits still apply when BETTER_AUTH_RATE_LIMIT isn't 'off'.
    enabled: process.env.BETTER_AUTH_RATE_LIMIT !== 'off',
    window: 60,
    max: 60,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/sign-up/email': { window: 60, max: 5 },
      '/sign-in/passkey': { window: 60, max: 10 },
      '/sign-up/passkey': { window: 60, max: 10 },
      '/forget-password': { window: 60, max: 3 },
      '/reset-password': { window: 60, max: 3 },
    },
  },

  // Better Auth respects this list of advanced cookie attrs even in
  // localhost development.
  //
  // useSecureCookies is env-gated: when BETTER_AUTH_URL starts with
  // https:// (production / Tailscale magic-DNS deployment), the cookie's
  // Secure flag is set so the browser never sends it over plain HTTP.
  // In localhost dev the flag is off so http://localhost can still
  // round-trip the session.
  //
  // crossSubDomainCookies stays off -- Heron is single-origin
  // (no shared cookie across `app.example.com` / `api.example.com`).
  // Leaving it off is defence-in-depth: a hijacked sibling sub-domain
  // can't read or replay the session cookie.
  //
  // cookieAttributes spells out every attribute explicitly rather than
  // relying on Better Auth defaults, so a future version that changes
  // defaults can't silently weaken our cookie security.
  advanced: {
    // Cookie names will be prefixed by this -- for `heron` the
    // session cookie becomes `heron.session_token`. Pulled from
    // BRAND so the cookie name tracks the brand rename. NOTE: changing
    // this invalidates existing sessions across all clients -- a
    // rebrand will sign every user out (intended; clean break).
    cookiePrefix: BRAND.name,
    useSecureCookies: BETTER_AUTH_URL.startsWith('https://'),
    crossSubDomainCookies: { enabled: false },
    cookies: {
      session_token: {
        attributes: {
          httpOnly: true,
          // SameSite=Lax -- Set-Cookie travels on top-level navigation
          // (OAuth callback redirects need this) but blocked on cross-
          // site fetch / iframe. Strict would break GitHub OAuth callback.
          sameSite: 'lax',
          // Secure -- only set when running over HTTPS. The dev shell
          // (http://localhost) keeps it off so cookies round-trip locally.
          secure: BETTER_AUTH_URL.startsWith('https://'),
          path: '/',
        },
      },
    },
  },
});

/** Whether GitHub OAuth is wired (env vars present). UI uses this to
 *  decide whether to show the "Sign in with GitHub" button. */
export const isGithubEnabled = (): boolean => githubEnabled;

/** Re-export `auth.api` for direct calls (e.g. server-only helpers). */
export const authApi = auth.api;
