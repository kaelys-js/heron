/** GET /api/diagnostics -- the consent-driven, downloadable, redacted bundle.
 *
 *  WHY these assertions matter: the bundle carries this user's + broadcast events,
 *  so it MUST be auth-gated (an unauthenticated caller can't pull diagnostics) and
 *  MUST scope to the requesting user (recentForUser), never the whole multi-user
 *  feed. The download disposition is what makes it a deliberate share, not an
 *  inline page.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const recentForUser = vi.fn(() => [
  { id: 'e1', ts: 1, level: 'info', category: 'system', source: 's', title: 't' },
]);
vi.mock('$lib/server/events', () => ({ bus: { recentForUser } }));

const { GET } = await import('./+server');

function makeEvent(user: { id: string } | null) {
  return { locals: { user, requestId: 'req-diag' } as unknown as App.Locals };
}

describe('GET /api/diagnostics', () => {
  beforeEach(() => recentForUser.mockClear());

  it('401s an unauthenticated request without touching the event store', async () => {
    const r = await (GET as (e: unknown) => Promise<Response>)(makeEvent(null));
    expect(r.status).toBe(401);
    expect(recentForUser).not.toHaveBeenCalled();
  });

  it('returns a downloadable bundle scoped to the requesting user', async () => {
    const r = await (GET as (e: unknown) => Promise<Response>)(makeEvent({ id: 'u1' }));
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toContain('attachment');
    expect(recentForUser).toHaveBeenCalledWith('u1'); // scoped, not the whole feed
    const body = (await r.json()) as { events: unknown[]; platform: string; requestId: string };
    expect(body.events).toHaveLength(1);
    expect(body.platform).toBeTruthy();
    expect(body.requestId).toBe('req-diag');
  });
});
