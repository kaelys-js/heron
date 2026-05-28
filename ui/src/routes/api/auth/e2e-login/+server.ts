/** POST /api/auth/e2e-login -- E2E-only bearer-token minter for Playwright.
 *  Mints a session row in auth.db for the seeded TEST_USER_ID + returns
 *  the token; better-auth's bearer plugin resolves Authorization headers
 *  back to the session on subsequent requests.
 *  Two orthogonal 404 guards keep prod safe: HERON_E2E_DATA_DIR env var
 *  must be set AND the requested userId must equal "u_e2e". Either guard
 *  failing returns 404 (indistinguishable from a missing route). */

import { error } from '@sveltejs/kit';
import crypto from 'node:crypto';
import { authDb } from '$lib/server/db';
import { sessions, users } from '$lib/server/db/auth-schema';
import { eq } from 'drizzle-orm';

const E2E_USER_ID = 'u_e2e';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24; // 24h -- ample for any single CI run

export const POST = async ({ request }: { request: Request }) => {
  // Guard 1: env-gated. Without HERON_E2E_DATA_DIR the endpoint is
  // indistinguishable from a missing route.
  if (!process.env.HERON_E2E_DATA_DIR) {
    throw error(404, 'Not Found');
  }

  // Guard 2: hardcoded principal. Reject any attempt to mint a session
  // for any other userId.
  let body: { userId?: string } | null = null;
  try {
    body = (await request.json()) as { userId?: string };
  } catch {
    throw error(404, 'Not Found');
  }
  if (body?.userId !== E2E_USER_ID) {
    throw error(404, 'Not Found');
  }

  // Confirm the seeded user actually exists. global-setup.ts inserts
  // it; if it's missing, the test-infra wiring is broken and we want
  // a loud 500 (not a silent 404) so the operator notices.
  const existing = authDb.select().from(users).where(eq(users.id, E2E_USER_ID)).get();
  if (!existing) {
    return new Response(
      JSON.stringify({
        error: 'e2e-user-missing',
        message:
          'Seeded user u_e2e not found in auth.db. Check that ' +
          'global-setup.ts ran and HERON_DATA_DIR matches HERON_E2E_DATA_DIR.',
      }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }

  // Mint a session row. Better Auth's bearer plugin (enabled in
  // lib/server/auth.ts) resolves a request's `Authorization: Bearer X`
  // header by looking up `sessions.token = X` and treating that row as
  // the active session. We write the row directly; the test harness
  // gets the token back + attaches it to every request.
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const sessionId = crypto.randomBytes(16).toString('hex');
  const token = crypto.randomBytes(32).toString('base64url');

  authDb
    .insert(sessions)
    .values({
      id: sessionId,
      userId: E2E_USER_ID,
      token,
      expiresAt,
      createdAt: now,
      updatedAt: now,
      ipAddress: '127.0.0.1',
      userAgent: 'playwright-e2e',
    })
    .run();

  return new Response(
    JSON.stringify({ ok: true, userId: E2E_USER_ID, token, expiresAt: expiresAt.toISOString() }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        // Token material must NEVER land in a shared cache / CDN /
        // browser store. no-store covers every cache tier.
        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
        pragma: 'no-cache',
      },
    },
  );
};
