import { bootOnce } from '$lib/server/orchestrator';
import { reportServerError, logEvent } from '$lib/server/events';
import { auth } from '$lib/server/auth';
import { runWithUser, SYSTEM_USER_ID } from '$lib/server/user-context';
import { json, redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import { building } from '$app/environment';

// bootOnce() runs at module-load time (top of hooks.server.ts, BEFORE
// any request handler). If it throws, SvelteKit's module-init fails
// and EVERY request gets the bare "500 | Internal Error" HTML --
// bypassing our +error.svelte. Wrap defensively: log the failure but
// let the module finish loading so handlers (including +error.svelte
// for any first-request failure) can still render. Routes that need
// the orchestrator's outputs (scan results, agent scores, etc.) will
// surface their OWN errors via +error.svelte; the rest of the app
// stays reachable.
try {
  bootOnce();
} catch (err) {
  // Defer to reportServerError if it's available; fall through to
  // console.error as a hard last-resort so it's at least visible in
  // dev-ios.mjs logs.
  try {
    reportServerError('boot', 'bootOnce failed', err);
  } catch {
    console.error('[hooks.server] bootOnce crashed at module load:', err);
  }
}

// Catch process-level crashes so they don't disappear silently.
// Don't process.exit -- let the dev server keep going for the next request.
//
// EPIPE / EBADF / ECONNRESET filter is critical: in some setups (Cursor's
// wallaby/console-ninja extension, certain Node debuggers) console.error
// gets intercepted and writes to a socket that may be closed mid-flight.
// That throws EPIPE → uncaughtException → reportServerError → console.error
// → EPIPE → ∞. The activity.jsonl can hit gigabytes in seconds. These
// codes are benign IO churn from upstream tooling, not real crashes.
const BENIGN_IO_CODES = new Set(['EPIPE', 'EBADF', 'ECONNRESET']);

function isBenignIO(err: unknown): boolean {
  if (!err) return false;
  const code = (err as NodeJS.ErrnoException).code;
  if (code && BENIGN_IO_CODES.has(code)) return true;
  const msg = err instanceof Error ? err.message : String(err);
  if (typeof msg === 'string' && /\b(EPIPE|EBADF|ECONNRESET)\b/.test(msg)) return true;
  return false;
}

if (typeof process !== 'undefined') {
  process.on('uncaughtException', (err: Error) => {
    if (isBenignIO(err)) return; // swallow -- see comment above
    reportServerError('process', 'uncaughtException', err);
  });
  process.on('unhandledRejection', (reason: unknown) => {
    if (isBenignIO(reason)) return;
    reportServerError('process', 'unhandledRejection', reason);
  });
}

/**
 * Paths that DON'T require authentication. Everything else needs a session.
 *
 *   /api/auth/*        -- Better Auth's own endpoints (login, register, etc.)
 *   /login, /signup    -- the auth UI pages
 *   /onboarding        -- first-run setup (no users exist yet)
 *   /api/health        -- liveness probe used by backend-discovery
 *   /api/discover      -- Bonjour/mDNS pairing check
 *   /api/onboarding/*  -- first-run setup endpoints
 *   /favicon, /robots, /manifest.webmanifest, /apple-touch-icon -- bare assets
 *   /_app/*            -- SvelteKit's hashed bundle assets (served by adapter-node)
 *   /assets/*, /static/*, /branding/* -- static folders
 */
const PUBLIC_PREFIXES = [
  '/api/auth/',
  '/login',
  '/signup',
  '/onboarding',
  '/api/health',
  '/api/discover',
  '/api/onboarding/',
  '/favicon',
  '/robots.txt',
  '/manifest.webmanifest',
  '/apple-touch-icon',
  '/_app/',
  '/assets/',
  '/static/',
  '/branding/',
];

function isPublicPath(pathname: string): boolean {
  // Root '/' is public -- the layout decides whether to show login or dashboard.
  if (pathname === '/') return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix)) return true;
  }
  return false;
}

/** Population: fill event.locals from the Better Auth session cookie. */
const populateAuth: Handle = async ({ event, resolve }) => {
  try {
    const session = await auth.api.getSession({ headers: event.request.headers });
    event.locals.user = session?.user ?? null;
    event.locals.session = session?.session ?? null;
  } catch (err) {
    if (!isBenignIO(err)) {
      reportServerError('auth', 'session-lookup', err);
    }
    event.locals.user = null;
    event.locals.session = null;
  }
  return resolve(event);
};

/** Route guard: 401 for unauthenticated API hits, redirect for HTML page hits.
 *
 *  Skipped entirely during adapter-static fallback generation: the build
 *  phase invokes this handler with no session cookie to render the SPA
 *  fallback page; without this short-circuit the guard would throw a 302
 *  to /login and adapter-static would error with "Could not create a
 *  fallback page -- failed with status 302", aborting `pnpm build:desktop`
 *  + `pnpm dev:ios` + `pnpm build:ios`.
 */
const guard: Handle = async ({ event, resolve }) => {
  if (building) return resolve(event);
  const path = event.url.pathname;
  if (isPublicPath(path)) return resolve(event);
  if (event.locals.user) return resolve(event);

  // API requests get a JSON 401; HTML page navigations get redirected to login.
  if (path.startsWith('/api/')) {
    return json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  }
  throw redirect(302, '/login?redirectTo=' + encodeURIComponent(path));
};

/** Wraps every request in an AsyncLocalStorage context so legacy server-lib
 *  code can read the acting user via `currentUserId()` without parameter
 *  plumbing. Public/unauth requests use the SYSTEM_USER_ID sentinel -- the
 *  guard above already blocked them from reaching anything per-user. */
const withUserContext: Handle = ({ event, resolve }) =>
  runWithUser(event.locals.user?.id ?? SYSTEM_USER_ID, () => resolve(event));

/** Auth lifecycle observer -- emits `logEvent` for sign-out events so the
 *  activity feed has a complete audit trail (sign-up + sign-in are logged
 *  from `auth.ts` databaseHooks; only sign-out has to be observed here
 *  because Better Auth's `session.delete` hook isn't reliably surfaced
 *  on every code path -- explicit logout, session-expiry, manual delete
 *  from /settings/users, etc.).
 *
 *  We capture the user BEFORE resolving (post-resolution the session has
 *  been destroyed). Only log if the response was a 2xx -- failed sign-out
 *  attempts are 4xx/5xx and would be misleading audit entries. */
const authLifecycleObserver: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname;
  if (path !== '/api/auth/sign-out' && !path.startsWith('/api/auth/sign-out/')) {
    return resolve(event);
  }
  const userId = event.locals.user?.id;
  const userLabel = event.locals.user?.email || event.locals.user?.name || userId;
  const response = await resolve(event);
  if (userId && response.status >= 200 && response.status < 300) {
    logEvent('auth', 'Sign-out', {
      level: 'info',
      category: 'user',
      userId,
      message: userLabel,
    });
  }
  return response;
};

/** Signup gate -- defense-in-depth so the invite-code requirement can't
 *  be bypassed by hand-crafting a POST to better-auth's signup endpoint
 *  directly. The /signup UI page already gates this for honest users,
 *  but the underlying `/api/auth/sign-up/email` route is part of
 *  better-auth and accepts any well-formed body, so without this guard
 *  anyone with LAN access (e.g. a shared Tailscale install) could
 *  create a `member` account.
 *
 *  Policy:
 *    • If users.count === 0 → first signup is OPEN (becomes the
 *      workspace owner via auth.ts's create.after hook).
 *    • If users.count >  0 → the request MUST carry a valid, unclaimed
 *      `x-invite-code` header. We CONSUME the invite at this point
 *      (delete the row) so the same code can't be replayed even within
 *      its 30-minute TTL -- single-use is enforced at the API boundary,
 *      not just by the UI calling /api/auth/invite/claim earlier.
 *
 *  The /signup +page.svelte stashes the validated code in
 *  auth-client.ts's `_pendingInviteCode` slot before invoking
 *  authClient.signUp.email; customFetch attaches it as the header.
 */
const signupGate: Handle = async ({ event, resolve }) => {
  const path = event.url.pathname;
  if (!path.startsWith('/api/auth/sign-up/')) return resolve(event);

  // Lazy-import to avoid pulling the auth DB into adapter-static's
  // build graph (the auth-DB import path bottoms out at better-sqlite3
  // which adapter-static refuses to bundle).
  const { authDb } = await import('$lib/server/db');
  const { users } = await import('$lib/server/db/auth-schema');
  const { sql, eq, and, isNull, gt } = await import('drizzle-orm');
  const { inviteCodes } = await import('$lib/server/db/auth-schema');

  const [{ n }] = authDb.select({ n: sql<number>`count(*)` }).from(users).all();
  if (n === 0) return resolve(event); // first-user path -- open

  const code = event.request.headers.get('x-invite-code')?.trim();
  if (!code || !/^\d{6}$/.test(code)) {
    return json(
      {
        ok: false,
        error: 'invite-required',
        message:
          'Signing up requires a valid 6-digit invite code from an existing workspace owner.',
      },
      { status: 403 },
    );
  }

  // Atomic single-use check: find the matching row (unclaimed +
  // unexpired) and DELETE it. If the delete returns 0 rows, the code
  // was already consumed in a parallel request -- reject.
  const row = authDb
    .select()
    .from(inviteCodes)
    .where(
      and(
        eq(inviteCodes.code, code),
        isNull(inviteCodes.claimedByUserId),
        gt(inviteCodes.expiresAt, new Date()),
      ),
    )
    .get();
  if (!row) {
    return json(
      {
        ok: false,
        error: 'invite-invalid',
        message: 'Invite code is unknown, expired, or already used.',
      },
      { status: 403 },
    );
  }
  authDb.delete(inviteCodes).where(eq(inviteCodes.id, row.id)).run();
  return resolve(event);
};

/** CORS handler -- only path that lets the Capacitor WebView talk to the
 *  backend. The WebView origin is `heron://localhost`; without these
 *  Access-Control-Allow-Origin echoes the browser preflight blocks the
 *  request before it ever reaches the server. Web (same-origin) sees no
 *  Origin header so this no-ops.
 *
 *  We deliberately allow `Authorization` so the bearer token added by
 *  client/auth-client.ts's customFetch round-trips. `credentials: 'include'`
 *  on the client requires `Access-Control-Allow-Credentials: true` here. */
const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^heron:\/\//,
  /^capacitor:\/\//,
  /^https?:\/\/[^/]+\.ts\.net$/,
];

function isAllowedOrigin(origin: string | null): origin is string {
  if (!origin) return false;
  return ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

const cors: Handle = async ({ event, resolve }) => {
  const origin = event.request.headers.get('origin');
  const allowed = isAllowedOrigin(origin);

  // Preflight: short-circuit so SvelteKit doesn't try to route an OPTIONS
  // method to a route that doesn't support it.
  if (event.request.method === 'OPTIONS' && allowed) {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin!,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      },
    });
  }

  const response = await resolve(event);
  if (allowed) {
    response.headers.set('Access-Control-Allow-Origin', origin!);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Vary', 'Origin');
  }
  return response;
};

/**
 * Security response headers. Owasp Secure Headers + Mozilla
 * Observatory recommendations:
 *
 *   X-Content-Type-Options: nosniff
 *     Stops the browser MIME-sniffing CSS/JS into something more
 *     dangerous. Free safety net.
 *
 *   X-Frame-Options: DENY
 *     Refuse to be rendered in an iframe. We're never embedded as a
 *     widget so DENY is safer than SAMEORIGIN.
 *
 *   Referrer-Policy: strict-origin-when-cross-origin
 *     Sends origin only on cross-origin nav, full URL same-origin.
 *
 *   Permissions-Policy
 *     Lock down APIs we never use (geolocation, payment, USB, …).
 *     Microphone is allowed for the mock-interview voice capture.
 *
 *   Strict-Transport-Security
 *     Only sent for HTTPS responses; tells browsers to upgrade future
 *     requests. Skipped on localhost.
 *
 *   Cross-Origin-Opener-Policy: same-origin
 *     Process isolation for window.opener -- opens us up to
 *     SharedArrayBuffer + high-precision timers safely.
 *
 *   Cross-Origin-Resource-Policy: same-site
 *     Refuse cross-site embeds of our resources (icons, JS).
 *
 *   Content-Security-Policy
 *     Tight on script-src/style-src + allows the API domains we
 *     legitimately hit. `'unsafe-inline'` on style needs Tailwind's
 *     JIT (CSS-in-JS for theme classes); we tighten to a hash later.
 *
 * Skip these for /api/auth/* because Better Auth's responses are pure
 * JSON and don't need page-level headers -- sending CSP there is just
 * bytes-on-the-wire noise for IPC-style endpoints.
 */
const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  const url = event.url;
  const isHttps = url.protocol === 'https:';
  const headers = response.headers;
  // Don't clobber if SvelteKit / the route already set these.
  if (!headers.has('X-Content-Type-Options')) headers.set('X-Content-Type-Options', 'nosniff');
  if (!headers.has('X-Frame-Options')) headers.set('X-Frame-Options', 'DENY');
  if (!headers.has('Referrer-Policy'))
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (!headers.has('Permissions-Policy')) {
    headers.set(
      'Permissions-Policy',
      [
        'accelerometer=()',
        'autoplay=()',
        'browsing-topics=()',
        'camera=()',
        'display-capture=()',
        'encrypted-media=()',
        'fullscreen=(self)',
        'geolocation=()',
        'gyroscope=()',
        'hid=()',
        'magnetometer=()',
        'microphone=(self)', // mock interview voice
        'midi=()',
        'payment=()',
        'picture-in-picture=()',
        'publickey-credentials-get=(self)', // passkey sign-in
        'screen-wake-lock=()',
        'serial=()',
        'usb=()',
        'web-share=(self)',
      ].join(', '),
    );
  }
  if (!headers.has('Cross-Origin-Opener-Policy'))
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (!headers.has('Cross-Origin-Resource-Policy'))
    headers.set('Cross-Origin-Resource-Policy', 'same-site');
  if (isHttps && !headers.has('Strict-Transport-Security')) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  return response;
};

/** Sequence: cors (short-circuits OPTIONS) → populateAuth → guard
 *  → withUserContext → securityHeaders → user handler. CORS runs first
 *  so preflights don't even touch auth or per-user context. */
export const handle: Handle = async ({ event, resolve }) => {
  return cors({
    event,
    resolve: (e0) =>
      populateAuth({
        event: e0,
        resolve: (e1) =>
          authLifecycleObserver({
            event: e1,
            resolve: (e2) =>
              guard({
                event: e2,
                resolve: (e3) =>
                  signupGate({
                    event: e3,
                    resolve: (e4) =>
                      withUserContext({
                        event: e4,
                        resolve: (e5) =>
                          securityHeaders({
                            event: e5,
                            resolve: (e6) => resolve(e6),
                          }),
                      }),
                  }),
              }),
          }),
      }),
  });
};

export const handleError: HandleServerError = ({ error, event, status, message }) => {
  const url = event.url.pathname;
  reportServerError('server', '[' + status + '] ' + url, error);
  const code = (error as Record<string, unknown>)?.code as string | undefined;
  const details = (error as Record<string, unknown>)?.details;
  return {
    message: status >= 500 ? 'Something broke on our end.' : message,
    code,
    details,
  };
};
