/** MSW handlers -- central HTTP fixture set. Loaded by test-setup.ts for
 *  jsdom/node + by test-helpers/render.ts for the browser project via SW.
 *  Add a base handler here when multiple tests want the same response;
 *  per-test overrides go through `server.use(...)` for failure modes /
 *  assertion-specific payloads. Each handler emits a deterministic ETag
 *  so caches behave the same in test and prod. Covers /api/auth/*,
 *  /api/health, /api/jobs, /api/status, /api/job/[id]/{cv,apply},
 *  /api/notifications/feed, /api/profiles, /api/scan*. */
import { http, HttpResponse } from 'msw';

export const handlers = [
  // ── Health ───────────────────────────────────────────────────────
  http.get('*/api/health', () =>
    HttpResponse.json(
      { ok: true, ts: 0, version: 'test', uptime: 0 },
      { headers: { etag: 'health-1' } },
    ),
  ),

  // ── Version ──────────────────────────────────────────────────────
  http.get('*/api/version', () => HttpResponse.json({ version: '0.0.0-test', commit: 'deadbeef' })),

  // ── Auth ─────────────────────────────────────────────────────────
  http.post('*/api/auth/sign-in/passkey', () =>
    HttpResponse.json(
      { user: { id: 'test-user', email: 'test@example.com' } },
      {
        headers: { 'set-auth-token': 'test-bearer-token' },
      },
    ),
  ),
  http.post('*/api/auth/sign-out', () => HttpResponse.json({ ok: true })),
  http.get('*/api/auth/session', () =>
    HttpResponse.json({
      user: { id: 'test-user', email: 'test@example.com' },
      session: { id: 'test-session', expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
    }),
  ),

  // ── Jobs / pipeline ──────────────────────────────────────────────
  http.get('*/api/jobs', () => HttpResponse.json({ jobs: [] })),
  http.post('*/api/status', () => HttpResponse.json({ ok: true })),
  http.post('*/api/job/:id/cv', ({ params }) =>
    HttpResponse.json({ ok: true, jobId: params.id, pdf: `/output/${params.id}.pdf` }),
  ),
  http.post('*/api/job/:id/apply', () => HttpResponse.json({ ok: true })),
  http.post('*/api/job/:id/notes', () => HttpResponse.json({ ok: true })),

  // ── Notifications ────────────────────────────────────────────────
  http.get('*/api/notifications/feed', () => HttpResponse.json({ events: [], unreadIds: [] })),
  http.post('*/api/notifications/mark-read', () => HttpResponse.json({ ok: true })),
  http.post('*/api/notifications/clear', () => HttpResponse.json({ ok: true })),

  // ── Profiles ─────────────────────────────────────────────────────
  http.get('*/api/profiles', () =>
    HttpResponse.json({
      activeId: 'default',
      profiles: [{ id: 'default', name: 'Default', color: 'indigo' }],
    }),
  ),
  http.post('*/api/profiles/:id/activate', () => HttpResponse.json({ ok: true })),

  // ── Scan ─────────────────────────────────────────────────────────
  http.post('*/api/scan', () => HttpResponse.json({ ok: true, queued: 0 })),
  http.get('*/api/scan/results', () => HttpResponse.json({ results: [] })),

  // ── Stats / insights ─────────────────────────────────────────────
  http.get('*/api/stats', () => HttpResponse.json({ counts: {}, recent: [] })),
  http.get('*/api/insights', () => HttpResponse.json({ insights: [] })),
];

/** Failure-mode handlers -- `server.use(...failureHandlers.unreachable)` to
 *  simulate a fully-offline backend. */
export const failureHandlers = {
  unreachable: [http.all('*/api/*', () => HttpResponse.error())],
  unauthorized: [
    http.all('*/api/*', () => HttpResponse.json({ error: 'Unauthorized' }, { status: 401 })),
  ],
  serverError: [
    http.all('*/api/*', () =>
      HttpResponse.json({ error: 'Internal server error' }, { status: 500 }),
    ),
  ],
  slow: [
    http.all('*/api/*', async () => {
      await new Promise((r) => setTimeout(r, 5000));
      return HttpResponse.json({ ok: true });
    }),
  ],
};
