import { bootOnce } from '$lib/server/orchestrator';
import { reportServerError, logEvent } from '$lib/server/events';
import { auth } from '$lib/server/auth';
import { runWithUser, SYSTEM_USER_ID } from '$lib/server/user-context';
import { screenshotBypassUser } from '$lib/server/screenshot-bypass';
import { json, redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { building, dev } from '$app/environment';
import { createHash } from 'node:crypto';

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
  if (!err) {
    return false;
  }
  const { code } = err as NodeJS.ErrnoException;
  if (code && BENIGN_IO_CODES.has(code)) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (typeof msg === 'string' && /\b(EPIPE|EBADF|ECONNRESET)\b/.test(msg)) {
    return true;
  }
  return false;
}

if (typeof process !== 'undefined') {
  process.on('uncaughtException', (err: Error) => {
    if (isBenignIO(err)) {
      return;
    } // swallow -- see comment above
    reportServerError('process', 'uncaughtException', err);
  });
  process.on('unhandledRejection', (reason: unknown) => {
    if (isBenignIO(reason)) {
      return;
    }
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
 *   /api/vitals        -- web-vitals beacons; fire pre-auth on cold loads
 *                         (login/signup), write no per-user data
 *   /api/telemetry     -- client technical-diagnostics + vitals sink; public
 *                         for the same reason as /api/vitals (fires pre-auth,
 *                         writes only quiet technical events, never Issues)
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
  // web-vitals beacons fire before auth hydration (on the login/signup pages
  // themselves), and the handler writes no per-user state. Without this the
  // guard 401s every beacon -> console-error noise on every cold load.
  '/api/vitals',
  // client technical-diagnostics + vitals sink. Same rationale as /api/vitals:
  // fires pre-auth on cold loads, writes only quiet technical activity events
  // (never Issues), so a 401 here would just spam console-errors on the very
  // errors we're trying to capture.
  '/api/telemetry',
  '/favicon',
  '/robots.txt',
  '/manifest.webmanifest',
  '/apple-touch-icon',
  '/_app/',
  '/assets/',
  '/static/',
  '/branding/',
];

function isPublicPath(pathname: string, devServer: boolean): boolean {
  // Root '/' is public -- the layout decides whether to show login or dashboard.
  if (pathname === '/') {
    return true;
  }
  // View gallery -- reachable WITHOUT a session only under the live dev server.
  // In a built/native app the owner reaches it via their real session; the
  // dev-tools opt-in cookie only relaxes the onboarding redirect (see
  // +layout.server.ts), NOT this auth gate -- a client-settable cookie must not
  // grant session-less access. Exact-segment match so /development etc. don't slip.
  if (devServer && (pathname === '/dev' || pathname.startsWith('/dev/'))) {
    return true;
  }
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

/** Best-effort, NON-secret identifier for whichever credential a request
 *  presented, used to attribute a session-lookup failure. Better Auth session
 *  tokens are opaque random ids (no decodable email), and the lookup that WOULD
 *  resolve a user just threw -- so we can't name the user. Instead we surface
 *  which auth method was used + a short SHA-256 fingerprint of the presented
 *  token, so recurring failures for the SAME credential group together in the
 *  log WITHOUT ever persisting the token itself. Returns 'no-credential' when
 *  neither a session cookie nor a bearer header is present. */
function failingCredentialLabel(request: Request): string {
  const hash = (secret: string): string =>
    createHash('sha256').update(secret).digest('hex').slice(0, 8);

  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    return `bearer token ${hash(auth.slice(7).trim())}`;
  }
  // Better Auth's session cookie is `<prefix>.session_token=<token>.<sig>`. We
  // fingerprint the whole cookie value (token+sig) -- it's enough to correlate
  // repeated failures and never reveals the secret.
  const cookie = request.headers.get('cookie') ?? '';
  const m = cookie.match(/(?:^|;\s*)[\w.-]*session_token=([^;]+)/);
  if (m) {
    return `session cookie ${hash(m[1])}`;
  }
  return 'no-credential';
}

/** Population: fill event.locals from the Better Auth session cookie.
 *  A real Better Auth session always wins. Only if NO session lands AND
 *  the double-gated screenshot bypass is active (HERON_SCREENSHOT_MODE=1
 *  AND HERON_DATA_DIR resolves under os.tmpdir()) do we inject the
 *  synthetic demo user. See `screenshot-bypass.ts` for the gate logic. */
const populateAuth: Handle = async ({ event, resolve }) => {
  try {
    const session = await auth.api.getSession({ headers: event.request.headers });
    event.locals.user = session?.user ?? null;
    event.locals.session = session?.session ?? null;
  } catch (err) {
    if (!isBenignIO(err)) {
      // requestId is set by the requestId handle step, which runs before
      // populateAuth -- so the session-lookup failure correlates to its request.
      // Attribute it to the failing credential (auth method + a non-secret token
      // fingerprint, never the raw token) so a recurring failure is greppable to
      // ONE session without leaking it. redact() masks any token that slips into
      // the error too, but the label is constructed not to carry one.
      reportServerError(
        'auth',
        `session lookup failed for ${failingCredentialLabel(event.request)}`,
        err,
        {
          requestId: event.locals.requestId,
        },
      );
    }
    event.locals.user = null;
    event.locals.session = null;
  }
  if (!event.locals.user) {
    const bypass = screenshotBypassUser();
    if (bypass) {
      // The synthetic user shape matches Better Auth's `user` enough for
      // the route guards downstream; no session token is fabricated.
      event.locals.user = bypass as unknown as App.Locals['user'];
    }
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
  if (building) {
    return resolve(event);
  }
  const path = event.url.pathname;
  if (isPublicPath(path, dev)) {
    return resolve(event);
  }
  if (event.locals.user) {
    return resolve(event);
  }

  // API requests get a JSON 401; HTML page navigations get redirected to login.
  if (path.startsWith('/api/')) {
    return json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  }
  throw redirect(302, `/login?redirectTo=${encodeURIComponent(path)}`);
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
  if (!path.startsWith('/api/auth/sign-up/')) {
    return resolve(event);
  }

  // Lazy-import to avoid pulling the auth DB into adapter-static's
  // build graph (the auth-DB import path bottoms out at better-sqlite3
  // which adapter-static refuses to bundle).
  const { authDb } = await import('$lib/server/db');
  const { users } = await import('$lib/server/db/auth-schema');
  const { sql, eq, and, isNull, gt } = await import('drizzle-orm');
  const { inviteCodes } = await import('$lib/server/db/auth-schema');

  const [{ n }] = authDb.select({ n: sql<number>`count(*)` }).from(users).all();
  if (n === 0) {
    return resolve(event);
  } // first-user path -- open

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
  if (!origin) {
    return false;
  }
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
    // Let the cross-origin caller (Capacitor WebView / LAN client) actually
    // READ our correlation + version + timing headers. The CORS spec hides
    // every non-safelisted response header from cross-origin JS unless it's
    // named here. (Same-origin web reads all headers natively, so this is a
    // no-op there -- it only matters for the WebView/Tailscale origins.)
    response.headers.set(
      'Access-Control-Expose-Headers',
      'X-Request-Id, X-App-Version, X-App-Build, Server-Timing',
    );
    // Let the Resource Timing API surface detailed timing (incl. our
    // Server-Timing) to the initiating origin for these cross-origin
    // requests. Scoped to the echoed allow-listed origin, never '*'.
    response.headers.set('Timing-Allow-Origin', origin!);
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
 *   Cache-Control: no-store  (ONLY on /api/*)
 *     API payloads are per-user + auth-scoped; never let a browser or
 *     shared intermediary cache them. Scoped to /api/* so SvelteKit's
 *     immutable hashing on /_app/* assets (and HTML caching) is untouched,
 *     and so a route that set its own Cache-Control wins (we don't clobber).
 *
 * NOTE: the Content-Security-Policy is NOT set by this handler. It's
 * configured in `svelte.config.ts` (`kit.csp`, mode 'auto' with the manual
 * app.html script hashes) and emitted by SvelteKit itself -- a per-response
 * header on the adapter-node build, baked into <meta> on the Capacitor
 * static build. This handler only adds the headers SvelteKit doesn't.
 * It runs for EVERY route, including /api/auth/*: nosniff / frame-options /
 * COOP are cheap and harmless on JSON responses, and a blanket pass is
 * simpler + safer than a per-prefix skip-list that could leak a header gap.
 */
const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  const { url } = event;
  const isHttps = url.protocol === 'https:';
  const { headers } = response;
  // Don't clobber if SvelteKit / the route already set these.
  if (!headers.has('X-Content-Type-Options')) {
    headers.set('X-Content-Type-Options', 'nosniff');
  }
  if (!headers.has('X-Frame-Options')) {
    headers.set('X-Frame-Options', 'DENY');
  }
  if (!headers.has('Referrer-Policy')) {
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  }
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
        // 'web-share' deliberately omitted: it's redundant with the spec
        // default (self) AND the Electron/Chromium WebView logs "Unrecognized
        // feature: 'web-share'" for it, spamming the desktop console.
      ].join(', '),
    );
  }
  if (!headers.has('Cross-Origin-Opener-Policy')) {
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  }
  if (!headers.has('Cross-Origin-Resource-Policy')) {
    headers.set('Cross-Origin-Resource-Policy', 'same-site');
  }
  if (isHttps && !headers.has('Strict-Transport-Security')) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  // Reporting API endpoint group. Paired with the CSP `report-to heron-telemetry`
  // directive (svelte.config.ts), this routes CSP / COOP / deprecation /
  // intervention reports to /api/telemetry, where they land as quiet
  // kind:'technical' diagnostics. Relative URL -- the browser resolves it against
  // the document origin, so it works behind any proxy without an origin mismatch.
  if (!headers.has('Reporting-Endpoints')) {
    headers.set('Reporting-Endpoints', 'heron-telemetry="/api/telemetry"');
  }
  // API payloads are per-user + auth-scoped -- never cache them. Scoped to
  // /api/* so SvelteKit's immutable /_app/* asset hashing is untouched, and
  // a route that already chose a Cache-Control policy keeps it.
  if (url.pathname.startsWith('/api/') && !headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'no-store');
  }
  return response;
};

/** Sequence: requestId → cors (short-circuits OPTIONS) → populateAuth → guard
 *  → withUserContext → securityHeaders → user handler. CORS runs first after the
 *  id so preflights don't touch auth/context. The per-request id is generated up
 *  front (so it's on `event.locals` for every handler + handleError), emitted as
 *  the `X-Request-Id` response header, and injected as a `<meta>` so the client
 *  can read its own request's id (a page can't read its own response headers). */
export const handle: Handle = async ({ event, resolve }) => {
  const requestId = crypto.randomUUID();
  event.locals.requestId = requestId;
  const startedAt = performance.now();
  // Build identity, computed once. `__APP_VERSION__` (semver) + `__APP_BUILD__`
  // (short git SHA) are Vite defines; the `typeof` guard keeps this safe in the
  // test env where the defines aren't applied. Surfaced as response headers AND
  // a <meta> so a page can read its own build without a network round-trip.
  const appVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
  const appBuild = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : '';
  const versionMeta = appVersion
    ? `<meta name="app-version" content="${appVersion}${appBuild ? `+${appBuild}` : ''}" />`
    : '';
  // Captured in the innermost resolve closure so Server-Timing can split the
  // middleware/auth phase from the render phase (see below).
  let resolveStartedAt = 0;

  const response = await cors({
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
                            resolve: (e6) => {
                              resolveStartedAt = performance.now();
                              return resolve(e6, {
                                transformPageChunk: ({ html }) =>
                                  html.replace(
                                    '</head>',
                                    `<meta name="x-request-id" content="${requestId}" />${versionMeta}</head>`,
                                  ),
                              });
                            },
                          }),
                      }),
                  }),
              }),
          }),
      }),
  });

  // Strip any server-fingerprinting header an adapter / proxy may have added
  // (adapter-node doesn't, but a fronting Express/nginx might). Removing
  // X-Powered-By is a cheap, standard hardening step -- we expose USEFUL build
  // info (X-App-Version/Build) deliberately, not incidental stack fingerprints.
  response.headers.delete('X-Powered-By');

  // Correlation id on every (non-fatal) response -- client fetches can read it,
  // support can grep logs for it, and handleError reuses it as the error ref.
  if (!response.headers.has('X-Request-Id')) {
    response.headers.set('X-Request-Id', requestId);
  }
  // App version + build SHA on every response -- lets clients, log-scrapers, and
  // support pin the EXACT build a response came from (semver alone can't tell two
  // builds of the same version apart). Both are read cross-origin via the CORS
  // Access-Control-Expose-Headers list set in `cors`.
  if (appVersion && !response.headers.has('X-App-Version')) {
    response.headers.set('X-App-Version', appVersion);
  }
  if (appBuild && !response.headers.has('X-App-Build')) {
    response.headers.set('X-App-Build', appBuild);
  }
  // Server-Timing on EVERY response, split into phases for the browser Network
  // "Timing" panel + Resource Timing: `total` (whole hook), `middleware` (the
  // requestId→cors→auth→guard→…→securityHeaders chain up to render), and
  // `render` (SvelteKit resolve). Durations only -- no payload/path leakage;
  // cross-origin reads are gated by Timing-Allow-Origin set in `cors`.
  if (!response.headers.has('Server-Timing')) {
    const end = performance.now();
    const mark = resolveStartedAt || end;
    response.headers.set(
      'Server-Timing',
      [
        `total;dur=${(end - startedAt).toFixed(1)}`,
        `middleware;dur=${(mark - startedAt).toFixed(1)}`,
        `render;dur=${(end - mark).toFixed(1)}`,
      ].join(', '),
    );
  }
  // Optional per-request lifecycle log (HERON_LOG_REQUESTS=on; OFF by default to
  // avoid feed noise). One info-level technical event tying method/path/status/
  // duration to the requestId -- gives a normal request to anchor an error
  // against + cheap p95/hot-path visibility. Skips the long-lived SSE stream so a
  // multi-minute feed connection isn't logged as one giant "request". Mute it
  // from disk anytime with HERON_LOG_MUTE=request while keeping the live feed.
  if (process.env.HERON_LOG_REQUESTS === 'on' && !event.url.pathname.startsWith('/api/stream')) {
    logEvent('request', `${event.request.method} ${event.url.pathname} ${response.status}`, {
      level: 'info',
      category: 'system',
      kind: 'technical',
      message: `${Math.round(performance.now() - startedAt)}ms`,
      requestId,
    });
  }
  return response;
};

export const handleError: HandleServerError = ({ error, event, status, message }) => {
  const url = event.url.pathname;
  // Reuse the per-request id (set by the requestId handle step) so the error
  // reference == X-Request-Id == the log line. Fall back to a fresh id if a
  // pre-handle failure means locals was never populated.
  const errorId = event.locals?.requestId ?? crypto.randomUUID();
  // Thread the same id into the logged event so the activity-log row, the
  // X-Request-Id response header, and the on-screen "ref" are all one value.
  reportServerError('server', `[${status}] ${url} · ref ${errorId}`, error, { requestId: errorId });
  const code = (error as Record<string, unknown>)?.code as string | undefined;
  const details = (error as Record<string, unknown>)?.details;
  const human = status >= 500 ? 'Something broke on our end.' : message;
  const stack = dev ? (error as Error)?.stack : undefined;
  return {
    // `· ref <id>` carries the correlation id into error.html (only %message% is
    // templated into that catastrophic fallback). In DEV we also append the stack
    // after a `::stack::` marker so the fallback can show developer details too --
    // error.html's inline script parses it out + cleans the visible message.
    // Prod: no stack appended. +error.svelte uses the dedicated `stack` field /
    // preset copy and strips this whole suffix on the unknown-status fallback.
    message: `${human} · ref ${errorId}${stack ? `\n::stack::\n${stack}` : ''}`,
    code,
    details,
    errorId,
    ...(stack ? { stack } : {}),
  };
};
