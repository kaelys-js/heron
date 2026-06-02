/**
 * hooks.server -- the SvelteKit request middleware chain.
 *
 *   cors → populateAuth → authLifecycleObserver → guard → signupGate
 *   → withUserContext → securityHeaders → user handler
 *
 * We can't import the individual handlers (only `handle` + `handleError`
 * are exported), so we exercise the full pipeline by feeding synthetic
 * SvelteKit events through `handle` and asserting on the response.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Module-level mocks ──────────────────────────────────────────────
const sessions = new Map<
  string,
  { user: { id: string; email?: string }; session: { id: string } }
>();
let invalidSessionThrows = false;

vi.mock('$lib/server/orchestrator', () => ({
  bootOnce: vi.fn(),
}));

const reportedErrors: { source: string; msg: string }[] = [];
const loggedEvents: { source: string; msg: string; meta?: unknown }[] = [];
vi.mock('$lib/server/events', () => ({
  reportServerError: (source: string, msg: string) => {
    reportedErrors.push({ source, msg });
  },
  logEvent: (source: string, msg: string, meta?: unknown) => {
    loggedEvents.push({ source, msg, meta });
  },
}));

vi.mock('$lib/server/auth', () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        if (invalidSessionThrows) {
          throw new Error('forced auth failure');
        }
        const tok = headers.get('cookie') ?? headers.get('authorization') ?? '';
        const match = tok.match(/sid=([\w-]+)/) ?? tok.match(/Bearer\s+([\w-]+)/);
        const sid = match?.[1];
        return sid ? (sessions.get(sid) ?? null) : null;
      },
    },
  },
}));

let lastUserContext: string | null = null;
vi.mock('$lib/server/user-context', () => ({
  SYSTEM_USER_ID: '__system__',
  runWithUser: async <T>(userId: string, fn: () => Promise<T> | T): Promise<T> => {
    lastUserContext = userId;
    return await fn();
  },
}));

vi.mock('$app/environment', () => ({
  building: false,
  dev: false,
}));

// Better-Auth signup-gate DB import is lazy -- we can pass through with a
// stub that returns 0 users so the first-user path is always open during
// these tests (signup-gate behaviour is its own test below).
let userCount = 0;
const deletedInviteIds: string[] = [];
const inviteRows: { code: string; id: string }[] = [];
vi.mock('$lib/server/db', () => ({
  authDb: {
    select: () => ({
      from: () => ({
        all: () => [{ n: userCount }],
        where: () => ({ get: () => inviteRows.find((r) => true) ?? null }),
      }),
    }),
    delete: () => ({
      where: (cond: { value?: string }) => ({
        run: () => {
          if (cond.value) {
            deletedInviteIds.push(cond.value);
          }
        },
      }),
    }),
  },
}));
vi.mock('$lib/server/db/auth-schema', () => ({
  users: { id: { name: 'id' } },
  inviteCodes: { id: { name: 'id' }, code: { name: 'code' } },
}));
vi.mock('drizzle-orm', () => ({
  sql: (s: TemplateStringsArray) => ({ template: s.raw[0] }),
  eq: (_col: unknown, v: string) => ({ value: v }),
  and: (...args: unknown[]) => args,
  isNull: () => ({}),
  gt: () => ({}),
}));

const { handle, handleError } = await import('./hooks.server');

beforeEach(() => {
  sessions.clear();
  invalidSessionThrows = false;
  reportedErrors.length = 0;
  loggedEvents.length = 0;
  lastUserContext = null;
  userCount = 0;
  deletedInviteIds.length = 0;
  inviteRows.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

function evt(
  url: string,
  opts: { method?: string; headers?: Record<string, string> } = {},
): {
  url: URL;
  request: Request;
  locals: { user: null | unknown; session: null | unknown };
  cookies: { get: (name: string) => string | undefined };
} {
  return {
    url: new URL(url),
    request: new Request(url, {
      method: opts.method ?? 'GET',
      headers: opts.headers ?? {},
    }),
    locals: { user: null, session: null },
    // Real RequestEvent always exposes a cookies API; the guard reads it for
    // the dev-tools opt-in. No devtools cookie in these tests -> get() is null.
    cookies: { get: () => undefined },
  };
}

async function run(event: ReturnType<typeof evt>, resolved?: () => Response): Promise<Response> {
  // Cast through `unknown` because SvelteKit's Handle type expects a
  // full RequestEvent object (locals, route, params, cookies, fetch,
  // platform, isDataRequest, isSubRequest, isRemoteRequest, request).
  // Our synthetic event only fills the fields the handlers actually
  // touch (url, request, locals); the rest are surfaced as undefined
  // and the handlers don't reach them.
  return await (
    handle as unknown as (args: { event: unknown; resolve: () => Response }) => Promise<Response>
  )({
    event,
    resolve: () => resolved?.() ?? new Response('ok', { status: 200 }),
  });
}

describe('hooks — CORS preflight', () => {
  it('oPTIONS from Capacitor origin returns 204 + CORS headers', async () => {
    const e = evt('http://localhost:5173/api/jobs', {
      method: 'OPTIONS',
      headers: { Origin: 'heron://localhost' },
    });
    const r = await run(e);
    expect(r.status).toBe(204);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('heron://localhost');
    expect(r.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(r.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('oPTIONS from unknown origin does NOT 204 (falls through)', async () => {
    const e = evt('http://localhost:5173/api/jobs', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example.com' },
    });
    const r = await run(e);
    // Falls through → guard kicks in for /api/* → 401
    expect(r.status).toBe(401);
  });

  it('oPTIONS without an Origin header does NOT 204', async () => {
    const e = evt('http://localhost:5173/api/jobs', { method: 'OPTIONS' });
    const r = await run(e);
    expect(r.status).not.toBe(204);
  });

  it('gET from allowed origin echoes CORS headers on the response', async () => {
    sessions.set('s1', { user: { id: 'u-1', email: 'a@b' }, session: { id: 's1' } });
    const e = evt('http://localhost:5173/api/jobs', {
      headers: { Origin: 'http://localhost:5174', Cookie: 'sid=s1' },
    });
    const r = await run(e);
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5174');
    expect(r.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(r.headers.get('Vary')).toBe('Origin');
  });

  it('exposes correlation + version + timing headers to the cross-origin client', async () => {
    // WHY: without Access-Control-Expose-Headers the CORS layer hides every
    // non-safelisted response header from cross-origin JS (the Capacitor
    // WebView / LAN client), so api.ts could never read X-Request-Id off a
    // failed fetch. Timing-Allow-Origin does the same for Resource Timing /
    // Server-Timing. Both must name the echoed allow-listed origin, not '*'.
    sessions.set('s1', { user: { id: 'u-1', email: 'a@b' }, session: { id: 's1' } });
    const e = evt('http://localhost:5173/api/jobs', {
      headers: { Origin: 'heron://localhost', Cookie: 'sid=s1' },
    });
    const r = await run(e);
    const expose = r.headers.get('Access-Control-Expose-Headers') ?? '';
    expect(expose).toContain('X-Request-Id');
    expect(expose).toContain('X-App-Version');
    expect(expose).toContain('X-App-Build');
    expect(expose).toContain('Server-Timing');
    expect(r.headers.get('Timing-Allow-Origin')).toBe('heron://localhost');
  });

  it('does NOT expose headers / Timing-Allow-Origin same-origin (no Origin header)', async () => {
    // Same-origin JS reads every header natively, so emitting Expose-Headers
    // there is misleading noise -- it must be gated on an allow-listed Origin.
    const r = await run(evt('http://localhost:5173/login'));
    expect(r.headers.get('Access-Control-Expose-Headers')).toBeNull();
    expect(r.headers.get('Timing-Allow-Origin')).toBeNull();
  });
});

describe('hooks -- guard (auth)', () => {
  it('401 JSON for unauthenticated /api/* requests', async () => {
    const r = await run(evt('http://localhost:5173/api/jobs'));
    expect(r.status).toBe(401);
    const body = await r.json();
    expect(body.error).toBe('unauthenticated');
  });

  it('302 redirect for unauthenticated HTML page nav (SvelteKit throws Redirect)', async () => {
    // SvelteKit's `redirect()` THROWS a Redirect object rather than
    // returning a Response. Catch + assert on the thrown shape.
    try {
      await run(evt('http://localhost:5173/inbox'));
      throw new Error('expected redirect to throw');
    } catch (e) {
      const r = e as { status: number; location: string };
      expect(r.status).toBe(302);
      expect(r.location).toContain('/login');
      expect(r.location).toContain('redirectTo=%2Finbox');
    }
  });

  it('public paths bypass the guard even without a session', async () => {
    const r = await run(evt('http://localhost:5173/login'));
    expect(r.status).toBe(200);
  });

  it('/about is public (linked from the login/signup footers; must render logged-out)', async () => {
    // The About surface is reachable BEFORE auth -- the footer links would dead-
    // end at /login if the guard 302'd it. It carries no per-user data, so a
    // session-less hit must reach the handler (200), not redirect.
    const r = await run(evt('http://localhost:5173/about'));
    expect(r.status).toBe(200);
  });

  it('/api/health is public', async () => {
    const r = await run(evt('http://localhost:5173/api/health'));
    expect(r.status).toBe(200);
  });

  it('/api/vitals is public (web-vitals beacons fire pre-auth, no 401 spam)', async () => {
    const r = await run(evt('http://localhost:5173/api/vitals'));
    expect(r.status).not.toBe(401);
  });

  it('/api/auth/* is public (Better Auth handles its own routes)', async () => {
    const r = await run(evt('http://localhost:5173/api/auth/sign-in'));
    expect(r.status).toBe(200);
  });

  it('authenticated user reaches the handler', async () => {
    sessions.set('s1', { user: { id: 'u-1' }, session: { id: 's1' } });
    const r = await run(evt('http://localhost:5173/api/jobs', { headers: { Cookie: 'sid=s1' } }));
    expect(r.status).toBe(200);
  });
});

describe('hooks -- populateAuth', () => {
  it('reads bearer token from Authorization header', async () => {
    sessions.set('tok-abc', { user: { id: 'u-2', email: 'x@y' }, session: { id: 'sB' } });
    const r = await run(
      evt('http://localhost:5173/api/jobs', { headers: { Authorization: 'Bearer tok-abc' } }),
    );
    expect(r.status).toBe(200);
  });

  it('reads sid cookie when no bearer header', async () => {
    sessions.set('s9', { user: { id: 'u-3' }, session: { id: 's9' } });
    const r = await run(evt('http://localhost:5173/api/jobs', { headers: { Cookie: 'sid=s9' } }));
    expect(r.status).toBe(200);
  });

  it('survives auth.getSession throwing -- reports + falls through as anon', async () => {
    invalidSessionThrows = true;
    const r = await run(evt('http://localhost:5173/api/jobs'));
    expect(r.status).toBe(401); // treated as unauthenticated
    expect(reportedErrors.some((e) => e.source === 'auth')).toBe(true);
  });

  it('attributes a failing bearer-token lookup WITHOUT logging the raw token', async () => {
    // WHY: a recurring auth failure must be greppable to ONE credential so
    // support can tell "this user's session is broken" from "auth is down" --
    // but the raw token is a secret and must NEVER reach the log. The title
    // names the method + a fingerprint, not the token.
    invalidSessionThrows = true;
    await run(
      evt('http://localhost:5173/api/jobs', {
        headers: { Authorization: 'Bearer super-secret-token-value' },
      }),
    );
    const authErr = reportedErrors.find((e) => e.source === 'auth');
    expect(authErr?.msg).toContain('bearer token');
    expect(authErr?.msg).not.toContain('super-secret-token-value');
  });

  it('attributes a failing session-cookie lookup to a non-secret fingerprint', async () => {
    invalidSessionThrows = true;
    await run(
      evt('http://localhost:5173/api/jobs', {
        headers: { Cookie: 'better-auth.session_token=tok.sig-secret' },
      }),
    );
    const authErr = reportedErrors.find((e) => e.source === 'auth');
    expect(authErr?.msg).toContain('session cookie');
    expect(authErr?.msg).not.toContain('tok.sig-secret');
  });

  it('labels a credential-less failing lookup as no-credential', async () => {
    invalidSessionThrows = true;
    await run(evt('http://localhost:5173/api/jobs'));
    const authErr = reportedErrors.find((e) => e.source === 'auth');
    expect(authErr?.msg).toContain('no-credential');
  });
});

describe('hooks -- withUserContext', () => {
  it('sets user-context to session userId for authenticated requests', async () => {
    sessions.set('s1', { user: { id: 'u-7' }, session: { id: 's1' } });
    await run(evt('http://localhost:5173/api/jobs', { headers: { Cookie: 'sid=s1' } }));
    expect(lastUserContext).toBe('u-7');
  });

  it('sets user-context to SYSTEM_USER_ID for unauthenticated public hits', async () => {
    await run(evt('http://localhost:5173/login'));
    expect(lastUserContext).toBe('__system__');
  });
});

describe('hooks -- security headers', () => {
  it('always sets X-Content-Type-Options: nosniff', async () => {
    const r = await run(evt('http://localhost:5173/login'));
    expect(r.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('sets X-Request-Id on every response (correlation id)', async () => {
    const r = await run(evt('http://localhost:5173/login'));
    // (crypto.randomUUID is the deterministic test-uuid mock here.)
    expect(r.headers.get('X-Request-Id')).toMatch(/^test-uuid-/);
  });

  it('sets X-App-Version on every response (pin the build a response came from)', async () => {
    // __APP_VERSION__ is mirrored into the vitest define from root
    // package.json (see vitest.base.ts), so it resolves the same literal
    // here as in a real build.
    const r = await run(evt('http://localhost:5173/login'));
    expect(r.headers.get('X-App-Version')).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('sets X-App-Build (git SHA) so support can pin the EXACT build', async () => {
    // __APP_BUILD__ is mirrored to the literal 'testsha' in the vitest define;
    // a real build sets the short git SHA. (Empty define -> header absent.)
    const r = await run(evt('http://localhost:5173/login'));
    expect(r.headers.get('X-App-Build')).toBe('testsha');
  });

  it('sets a PHASED Server-Timing on EVERY response (total + middleware + render)', async () => {
    // WHY phased: the Network "Timing" panel can then show where a slow request
    // spent its time (auth/middleware vs render) without a profiler. Durations
    // only -- no path/payload leakage.
    const r = await run(evt('http://localhost:5173/login'));
    const st = r.headers.get('Server-Timing') ?? '';
    expect(st).toMatch(/\btotal;dur=[\d.]+/);
    expect(st).toMatch(/\bmiddleware;dur=[\d.]+/);
    expect(st).toMatch(/\brender;dur=[\d.]+/);
  });

  it('sets Reporting-Endpoints pointing at the telemetry diagnostics sink', async () => {
    // Paired with the CSP report-to directive (svelte.config.ts) so CSP / COOP /
    // deprecation reports flow to /api/telemetry.
    const r = await run(evt('http://localhost:5173/login'));
    const re = r.headers.get('Reporting-Endpoints') ?? '';
    expect(re).toContain('heron-telemetry');
    expect(re).toContain('/api/telemetry');
  });

  it('strips X-Powered-By if an adapter / proxy set it (no stack fingerprint)', async () => {
    const r = await run(evt('http://localhost:5173/login'), () => {
      const res = new Response('ok', { status: 200 });
      res.headers.set('X-Powered-By', 'Express');
      return res;
    });
    expect(r.headers.get('X-Powered-By')).toBeNull();
  });

  it('sets Cache-Control: no-store on /api/* (auth-scoped payloads never cached)', async () => {
    // /api/health is public so it reaches the handler with a 200.
    const r = await run(evt('http://localhost:5173/api/health'));
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });

  it('does NOT force no-store on non-API routes (asset/page caching intact)', async () => {
    const r = await run(evt('http://localhost:5173/login'));
    expect(r.headers.get('Cache-Control')).toBeNull();
  });

  it('always sets X-Frame-Options: DENY', async () => {
    const r = await run(evt('http://localhost:5173/login'));
    expect(r.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('always sets Referrer-Policy', async () => {
    const r = await run(evt('http://localhost:5173/login'));
    expect(r.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('permissions-Policy allows microphone (mock-interview) + denies geo', async () => {
    const r = await run(evt('http://localhost:5173/login'));
    const pp = r.headers.get('Permissions-Policy') ?? '';
    expect(pp).toContain('microphone=(self)');
    expect(pp).toContain('geolocation=()');
  });

  it('permissions-Policy omits web-share (Electron-unrecognized -> console spam)', async () => {
    const r = await run(evt('http://localhost:5173/login'));
    const pp = r.headers.get('Permissions-Policy') ?? '';
    expect(pp).not.toContain('web-share');
  });

  it('hSTS is set on HTTPS responses', async () => {
    const r = await run(evt('https://heron.example.com/login'));
    expect(r.headers.get('Strict-Transport-Security')).toContain('max-age=');
  });

  it('hSTS is NOT set on HTTP (localhost)', async () => {
    const r = await run(evt('http://localhost:5173/login'));
    expect(r.headers.get('Strict-Transport-Security')).toBeNull();
  });
});

describe('hooks -- signupGate', () => {
  it('first signup (users.count === 0) bypasses the gate', async () => {
    userCount = 0;
    const r = await run(evt('http://localhost:5173/api/auth/sign-up/email', { method: 'POST' }));
    expect(r.status).toBe(200);
  });

  it('subsequent signup without x-invite-code is rejected 403', async () => {
    userCount = 5;
    const r = await run(evt('http://localhost:5173/api/auth/sign-up/email', { method: 'POST' }));
    expect(r.status).toBe(403);
    const body = await r.json();
    expect(body.error).toBe('invite-required');
  });

  it('invalid invite-code format is rejected 403', async () => {
    userCount = 5;
    const r = await run(
      evt('http://localhost:5173/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'x-invite-code': 'not-digits' },
      }),
    );
    expect(r.status).toBe(403);
  });

  it('unknown invite-code is rejected 403 with invite-invalid', async () => {
    userCount = 5;
    inviteRows.length = 0; // no rows match
    const r = await run(
      evt('http://localhost:5173/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'x-invite-code': '123456' },
      }),
    );
    expect(r.status).toBe(403);
    const body = await r.json();
    expect(body.error).toBe('invite-invalid');
  });
});

describe('hooks -- authLifecycleObserver', () => {
  it('emits "Sign-out" activity event on successful 2xx sign-out', async () => {
    sessions.set('s1', { user: { id: 'u-1', email: 'a@b' }, session: { id: 's1' } });
    const r = await run(
      evt('http://localhost:5173/api/auth/sign-out', {
        method: 'POST',
        headers: { Cookie: 'sid=s1' },
      }),
    );
    expect(r.status).toBe(200);
    expect(loggedEvents.some((e) => e.msg === 'Sign-out')).toBe(true);
  });
});

describe('handleError', () => {
  it('reports + maps 5xx to a generic message', () => {
    const r = handleError({
      error: new Error('boom'),
      event: { url: new URL('http://localhost/api/jobs') } as never,
      status: 500,
      message: 'Internal Server Error',
    }) as unknown as { message: string };
    // 5xx maps to the generic human line; a ` · ref <id>` suffix carries the
    // correlation id into the catastrophic error.html fallback (only %message%
    // is templated there). The human prefix must be preserved.
    expect(r.message).toMatch(/^Something broke on our end\. · ref \S+$/);
    expect(reportedErrors.length).toBe(1);
  });

  it('passes through 4xx messages (+ appends the correlation ref)', () => {
    const r = handleError({
      error: { code: 'NOT_FOUND' },
      event: { url: new URL('http://localhost/api/jobs/1') } as never,
      status: 404,
      message: 'Not Found',
    }) as unknown as { message: string; code: string };
    expect(r.message).toMatch(/^Not Found · ref \S+$/);
    expect(r.code).toBe('NOT_FOUND');
  });

  it('returns a correlation errorId AND embeds it in the report (logs ↔ page)', () => {
    // WHY: the error page shows this id (copyable) so a user can quote it to
    // support; the SAME id must be in the server log message so support can find
    // the matching error. A returned id that isn't logged would be useless.
    const r = handleError({
      error: new Error('boom'),
      event: { url: new URL('http://localhost/api/jobs') } as never,
      status: 500,
      message: 'Internal Server Error',
    }) as unknown as { errorId: string };
    // (crypto.randomUUID is mocked deterministically in this suite, so assert a
    // non-empty id + the correlation rather than a strict uuid shape.)
    expect(typeof r.errorId).toBe('string');
    expect(r.errorId.length).toBeGreaterThan(0);
    expect(reportedErrors.at(-1)?.msg).toContain(r.errorId);
  });

  it('reuses event.locals.requestId as the error reference (one id end-to-end)', () => {
    // The error reference shown on-screen == X-Request-Id == the log line, so
    // support can pivot between them. handleError reads the id off locals.
    const r = handleError({
      error: new Error('boom'),
      event: { url: new URL('http://localhost/x'), locals: { requestId: 'req-abc-123' } } as never,
      status: 500,
      message: 'Internal Server Error',
    }) as unknown as { errorId: string; message: string };
    expect(r.errorId).toBe('req-abc-123');
    expect(r.message).toContain('req-abc-123');
  });
});
