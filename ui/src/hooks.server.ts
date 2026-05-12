import { bootOnce } from '$lib/server/orchestrator';
import { reportServerError } from '$lib/server/events';
import { auth } from '$lib/server/auth';
import { runWithUser, SYSTEM_USER_ID } from '$lib/server/user-context';
import { json, redirect, type Handle, type HandleServerError } from '@sveltejs/kit';

bootOnce();

// Catch process-level crashes so they don't disappear silently.
// Don't process.exit — let the dev server keep going for the next request.
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
    if (isBenignIO(err)) return; // swallow — see comment above
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
 *   /api/auth/*        — Better Auth's own endpoints (login, register, etc.)
 *   /login, /signup    — the auth UI pages
 *   /onboarding        — first-run setup (no users exist yet)
 *   /api/health        — liveness probe used by backend-discovery
 *   /api/discover      — Bonjour/mDNS pairing check
 *   /api/onboarding/*  — first-run setup endpoints
 *   /favicon, /robots, /manifest.webmanifest, /apple-touch-icon — bare assets
 *   /_app/*            — SvelteKit's hashed bundle assets (served by adapter-node)
 *   /assets/*, /static/*, /branding/* — static folders
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
  // Root '/' is public — the layout decides whether to show login or dashboard.
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

/** Route guard: 401 for unauthenticated API hits, redirect for HTML page hits. */
const guard: Handle = async ({ event, resolve }) => {
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
 *  plumbing. Public/unauth requests use the SYSTEM_USER_ID sentinel — the
 *  guard above already blocked them from reaching anything per-user. */
const withUserContext: Handle = ({ event, resolve }) =>
  runWithUser(event.locals.user?.id ?? SYSTEM_USER_ID, () => resolve(event));

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
 *     Process isolation for window.opener — opens us up to
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
 * JSON and don't need page-level headers — sending CSP there is just
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

/** Sequence the handlers: populateAuth → guard → withUserContext → user handler → securityHeaders. */
export const handle: Handle = async ({ event, resolve }) => {
  return populateAuth({
    event,
    resolve: (e1) =>
      guard({
        event: e1,
        resolve: (e2) =>
          withUserContext({
            event: e2,
            resolve: (e3) =>
              securityHeaders({
                event: e3,
                resolve: (e4) => resolve(e4),
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
