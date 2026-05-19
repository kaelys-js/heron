/**
 * GET /api/health -- minimal liveness probe.
 *
 * F22 -- pre-fix this endpoint exposed per-user pipeline metadata
 * (file size + mtime + reports count) to anonymous callers. The
 * authenticated /api/stats + /api/insights endpoints carry that data
 * now; /api/health stays minimal so the public backend-discovery
 * probe doesn't leak anything.
 *
 * Backend-discovery clients (online-status.ts, backend-discovery.ts)
 * only care about HTTP 200 + the JSON body's `ok: true` shape, so the
 * minimal response is back-compat.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/events', () => ({
  reportServerError: vi.fn(),
  logEvent: vi.fn(),
}));

const { GET } = await import('./+server');

async function call() {
  const r = (await (GET as unknown as (e: unknown) => Promise<Response>)(
    {} as unknown,
  )) as Response;
  return { status: r.status, body: await r.json() };
}

describe('GET /api/health', () => {
  it('returns 200 + { ok: true, service: "heron" }', async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.service).toBe('heron');
  });

  it('does NOT leak pipeline metadata (F22 regression guard)', async () => {
    const r = await call();
    // Pre-F22 these fields were present; the audit closed it. Re-adding
    // them is the wrong direction -- keep them out.
    expect(r.body.pipeline).toBeUndefined();
    expect(r.body.gemini).toBeUndefined();
    expect(r.body.anthropic).toBeUndefined();
    expect(r.body.reports).toBeUndefined();
    expect(r.body.runningTasks).toBeUndefined();
    expect(r.body.lastScanAt).toBeUndefined();
  });

  it('does NOT expose semver (fingerprinting risk)', async () => {
    const r = await call();
    // Returning the actual semver lets attackers enumerate CVE-
    // vulnerable installs. Authenticated /api/version covers the
    // dashboard-internal version check.
    expect(r.body.version).toBeUndefined();
  });
});
