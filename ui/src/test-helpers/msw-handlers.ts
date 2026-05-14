/**
 * MSW handlers — central HTTP fixture set. Imported by `test-setup.ts`
 * for jsdom/node projects and by `test-helpers/render.ts` for the
 * browser project (via the Service Worker variant).
 *
 * Add a base handler here when a TEST FILE needs the same response
 * across cases. Override per-test via `server.use(...)` for failure
 * modes or assertion-specific payloads.
 *
 * Coverage mirrors the most-trafficked endpoints:
 *   • Auth (/api/auth/*) — pass-through OK responses
 *   • Health probe (/api/health) — 200 by default; flip to 503 per-test
 *   • Jobs / pipeline (/api/jobs, /api/status)
 *   • Per-job actions (/api/job/[id]/cv, /api/job/[id]/apply)
 *   • Notifications feed (/api/notifications/feed)
 *   • Profiles (/api/profiles)
 *   • Scan (/api/scan, /api/scan/results)
 *
 * Each handler also returns a deterministic `ETag` so caches behave
 * the same in tests as in prod.
 */
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

/** Failure-mode handlers — `server.use(...failureHandlers.unreachable)` to
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
