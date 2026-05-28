/**
 * lib/server/auth -- Better Auth singleton.
 *
 * We can't test Better Auth's internals (it's a third party), but the
 * BEHAVIOUR we own -- first-user-becomes-owner, trusted-origins from
 * BRAND, env-gated rate limit, env-gated GitHub OAuth, secret
 * persistence -- is testable by mocking the DB + inspecting the exported
 * config / firing the registered hook callbacks directly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks before import ────────────────────────────────────────────
const countResult = { n: 0 };
const updateCalls: { table: string; values: Record<string, unknown>; whereId?: string }[] = [];

const authDbMock = {
  select: () => ({
    from: () => ({
      all: () => [{ n: countResult.n }],
    }),
  }),
  update: (_table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: (cond: unknown) => ({
        run: () => {
          updateCalls.push({
            table: 'users',
            values,
            whereId: (cond as { value?: string } | undefined)?.value,
          });
        },
      }),
    }),
  }),
};

vi.mock('./db', () => ({
  authDb: authDbMock,
}));

vi.mock('./db/migrate', () => ({
  ensureSchema: vi.fn(() => undefined),
}));

vi.mock('./db/auth-schema', () => ({
  users: {
    id: { name: 'id', table: 'users' },
    role: { name: 'role', table: 'users' },
  },
  sessions: { id: { name: 'id', table: 'sessions' } },
  accounts: { id: { name: 'id', table: 'accounts' } },
  verifications: { id: { name: 'id', table: 'verifications' } },
  passkeys: { id: { name: 'id', table: 'passkeys' } },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: string) => ({ col, value: val }),
  sql: (strings: TemplateStringsArray, ..._vals: unknown[]) => ({ template: strings.raw[0] }),
}));

const logEvents: { source: string; msg: string; meta: unknown }[] = [];
const serverErrors: { source: string; msg: string; err: unknown }[] = [];

vi.mock('./events', () => ({
  logEvent: (source: string, msg: string, meta: unknown) => {
    logEvents.push({ source, msg, meta });
  },
  reportServerError: (source: string, msg: string, err: unknown) => {
    serverErrors.push({ source, msg, err });
  },
}));

vi.mock('./env', () => ({
  writeEnv: vi.fn(),
}));

vi.mock('$lib/client/brand', () => ({
  BRAND: {
    displayName: 'TestBrand',
    urlScheme: 'testscheme',
  },
}));

// Better Auth + plugins -- we only need the call to record options.
const capturedOptions: { config: Record<string, unknown> } = { config: {} };

vi.mock('better-auth', () => ({
  betterAuth: (config: Record<string, unknown>) => {
    capturedOptions.config = config;
    return { __auth_singleton__: true, options: config };
  },
}));

vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: () => ({ __drizzle_adapter__: true }),
}));

vi.mock('better-auth/plugins', () => ({
  bearer: () => ({ __plugin__: 'bearer' }),
}));

vi.mock('@better-auth/passkey', () => ({
  passkey: (opts: Record<string, unknown>) => ({ __plugin__: 'passkey', opts }),
}));

// Import AFTER mocks are registered so module-load picks them up.
beforeEach(async () => {
  vi.resetModules();
  countResult.n = 0;
  updateCalls.length = 0;
  logEvents.length = 0;
  serverErrors.length = 0;
});

afterEach(() => {
  delete process.env.GITHUB_CLIENT_ID;
  delete process.env.GITHUB_CLIENT_SECRET;
  delete process.env.BETTER_AUTH_RATE_LIMIT;
  delete process.env.BETTER_AUTH_SECRET;
});

async function loadAuth() {
  return await import('./auth');
}

describe('better Auth config — secret', () => {
  it('generates + persists a secret on first boot when BETTER_AUTH_SECRET is missing', async () => {
    delete process.env.BETTER_AUTH_SECRET;
    await loadAuth();
    expect(process.env.BETTER_AUTH_SECRET).toBeDefined();
    expect((process.env.BETTER_AUTH_SECRET ?? '').length).toBeGreaterThanOrEqual(64);
  });

  it('preserves an existing secret if it is ≥ 32 chars', async () => {
    process.env.BETTER_AUTH_SECRET = 'a'.repeat(64);
    await loadAuth();
    expect(process.env.BETTER_AUTH_SECRET).toBe('a'.repeat(64));
  });

  it('regenerates a too-short secret rather than trusting it', async () => {
    process.env.BETTER_AUTH_SECRET = 'short';
    await loadAuth();
    expect(process.env.BETTER_AUTH_SECRET).not.toBe('short');
    expect((process.env.BETTER_AUTH_SECRET ?? '').length).toBeGreaterThanOrEqual(64);
  });
});

describe('better Auth config — trusted origins', () => {
  it('includes BRAND.urlScheme://localhost', async () => {
    await loadAuth();
    const origins = capturedOptions.config.trustedOrigins as string[];
    expect(origins).toContain('testscheme://localhost');
    expect(origins).toContain('testscheme://*');
  });

  it('allows wildcard localhost ports (http + https)', async () => {
    await loadAuth();
    const origins = capturedOptions.config.trustedOrigins as string[];
    expect(origins).toContain('http://localhost:*');
    expect(origins).toContain('https://localhost:*');
  });

  it('allows Capacitor scheme', async () => {
    await loadAuth();
    const origins = capturedOptions.config.trustedOrigins as string[];
    expect(origins).toContain('capacitor://localhost');
  });

  it('allows Tailscale magic DNS wildcards', async () => {
    await loadAuth();
    const origins = capturedOptions.config.trustedOrigins as string[];
    expect(origins).toContain('http://*.ts.net');
    expect(origins).toContain('https://*.ts.net');
  });
});

describe('better Auth config -- first-user-becomes-owner hook', () => {
  it('promotes the user to owner when total user count is 1 after creation', async () => {
    await loadAuth();
    const hooks = capturedOptions.config.databaseHooks as {
      user: { create: { after: (user: { id: string }) => Promise<void> } };
    };
    countResult.n = 1;
    await hooks.user.create.after({ id: 'user-A' });
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].values.role).toBe('owner');
    expect(updateCalls[0].whereId).toBe('user-A');
  });

  it('does NOT promote when count > 1 (subsequent signups stay member)', async () => {
    await loadAuth();
    const hooks = capturedOptions.config.databaseHooks as {
      user: { create: { after: (user: { id: string }) => Promise<void> } };
    };
    countResult.n = 5;
    await hooks.user.create.after({ id: 'user-F' });
    expect(updateCalls.length).toBe(0);
  });

  it('logs "User created (owner)" when first-user promotion fires', async () => {
    await loadAuth();
    const hooks = capturedOptions.config.databaseHooks as {
      user: { create: { after: (user: { id: string; email?: string }) => Promise<void> } };
    };
    countResult.n = 1;
    await hooks.user.create.after({ id: 'user-A', email: 'first@example.com' });
    const evt = logEvents.find((e) => e.source === 'auth');
    expect(evt?.msg).toMatch(/owner/);
  });

  it('logs plain "User created" for non-first users (no "(owner)" tag)', async () => {
    await loadAuth();
    const hooks = capturedOptions.config.databaseHooks as {
      user: { create: { after: (user: { id: string }) => Promise<void> } };
    };
    countResult.n = 3;
    await hooks.user.create.after({ id: 'user-C' });
    const evt = logEvents.find((e) => e.source === 'auth');
    expect(evt?.msg).toBe('User created');
  });

  it('reports a server error if DB update fails but does NOT throw', async () => {
    await loadAuth();
    const hooks = capturedOptions.config.databaseHooks as {
      user: { create: { after: (user: { id: string }) => Promise<void> } };
    };
    countResult.n = 1;
    // Sabotage update path
    const origUpdate = authDbMock.update;
    authDbMock.update = () => {
      throw new Error('forced DB failure');
    };
    await expect(hooks.user.create.after({ id: 'user-A' })).resolves.toBeUndefined();
    expect(serverErrors.length).toBe(1);
    expect(serverErrors[0].source).toBe('auth');
    expect(serverErrors[0].msg).toMatch(/Owner auto-promotion failed/);
    authDbMock.update = origUpdate;
  });
});

describe('better Auth config -- session.create.after hook (sign-in log)', () => {
  it('emits a "Sign-in" activity event with userId', async () => {
    await loadAuth();
    const hooks = capturedOptions.config.databaseHooks as {
      session: { create: { after: (s: { userId: string; ipAddress?: string }) => Promise<void> } };
    };
    await hooks.session.create.after({ userId: 'u-1', ipAddress: '127.0.0.1' });
    const evt = logEvents.find((e) => e.msg === 'Sign-in');
    expect(evt).toBeTruthy();
    expect((evt!.meta as { userId: string }).userId).toBe('u-1');
  });

  it('includes ipAddress in the message when present', async () => {
    await loadAuth();
    const hooks = capturedOptions.config.databaseHooks as {
      session: { create: { after: (s: { userId: string; ipAddress?: string }) => Promise<void> } };
    };
    await hooks.session.create.after({ userId: 'u-2', ipAddress: '10.0.0.5' });
    const evt = logEvents.find((e) => e.msg === 'Sign-in');
    expect((evt!.meta as { message?: string }).message).toContain('10.0.0.5');
  });

  it('omits ipAddress field gracefully when absent', async () => {
    await loadAuth();
    const hooks = capturedOptions.config.databaseHooks as {
      session: { create: { after: (s: { userId: string; ipAddress?: string }) => Promise<void> } };
    };
    await hooks.session.create.after({ userId: 'u-3' });
    const evt = logEvents.find((e) => e.msg === 'Sign-in');
    expect((evt!.meta as { message?: string }).message).toBeUndefined();
  });
});

describe('better Auth config -- rate limit env gate', () => {
  it('enables rate limit by default', async () => {
    delete process.env.BETTER_AUTH_RATE_LIMIT;
    await loadAuth();
    const rl = capturedOptions.config.rateLimit as { enabled: boolean };
    expect(rl.enabled).toBe(true);
  });

  it('disables rate limit when BETTER_AUTH_RATE_LIMIT=off', async () => {
    process.env.BETTER_AUTH_RATE_LIMIT = 'off';
    await loadAuth();
    const rl = capturedOptions.config.rateLimit as { enabled: boolean };
    expect(rl.enabled).toBe(false);
  });

  it('keeps rate limit enabled when BETTER_AUTH_RATE_LIMIT is any other value', async () => {
    process.env.BETTER_AUTH_RATE_LIMIT = 'on';
    await loadAuth();
    const rl = capturedOptions.config.rateLimit as { enabled: boolean };
    expect(rl.enabled).toBe(true);
  });
});

describe('better Auth config -- GitHub OAuth env gate', () => {
  it('oMITS the github provider when GITHUB_CLIENT_ID is missing', async () => {
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    await loadAuth();
    const providers = capturedOptions.config.socialProviders as Record<string, unknown>;
    expect(providers.github).toBeUndefined();
  });

  it('oMITS the github provider when only one of the env vars is set', async () => {
    process.env.GITHUB_CLIENT_ID = 'id-only';
    delete process.env.GITHUB_CLIENT_SECRET;
    await loadAuth();
    const providers = capturedOptions.config.socialProviders as Record<string, unknown>;
    expect(providers.github).toBeUndefined();
  });

  it('eNABLES the github provider when both env vars are set', async () => {
    process.env.GITHUB_CLIENT_ID = 'real-id';
    process.env.GITHUB_CLIENT_SECRET = 'real-secret';
    await loadAuth();
    const providers = capturedOptions.config.socialProviders as Record<
      string,
      { clientId: string; clientSecret: string }
    >;
    expect(providers.github).toBeDefined();
    expect(providers.github.clientId).toBe('real-id');
    expect(providers.github.clientSecret).toBe('real-secret');
  });
});

describe('better Auth config -- plugins', () => {
  it('includes the passkey plugin with rpName from BRAND.displayName', async () => {
    await loadAuth();
    const plugins = capturedOptions.config.plugins as {
      __plugin__?: string;
      opts?: { rpName: string };
    }[];
    const pk = plugins.find((p) => p.__plugin__ === 'passkey');
    expect(pk).toBeDefined();
    expect(pk!.opts!.rpName).toBe('TestBrand');
  });

  it('includes the bearer plugin (for Capacitor WebView Authorization header)', async () => {
    await loadAuth();
    const plugins = capturedOptions.config.plugins as { __plugin__?: string }[];
    expect(plugins.some((p) => p.__plugin__ === 'bearer')).toBe(true);
  });
});

describe('better Auth config -- session settings', () => {
  it('session expiry is 30 days', async () => {
    await loadAuth();
    const session = capturedOptions.config.session as { expiresIn: number };
    expect(session.expiresIn).toBe(60 * 60 * 24 * 30);
  });

  it('session cookieCache is enabled with a 5-min TTL', async () => {
    await loadAuth();
    const session = capturedOptions.config.session as {
      cookieCache: { enabled: boolean; maxAge: number };
    };
    expect(session.cookieCache.enabled).toBe(true);
    expect(session.cookieCache.maxAge).toBe(60 * 5);
  });
});
