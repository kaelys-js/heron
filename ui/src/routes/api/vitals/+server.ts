/** POST /api/vitals -- ingest web-vitals CLS / INP / LCP / TTFB / FCP
 *  beacons from +layout.svelte. Poor ratings log warn (surface as
 *  Issues); good / needs-improvement log info. No auth -- vitals fire
 *  before auth hydration on cold loads. GET returns the in-process
 *  beacon counter for e2e/web-vitals.spec.ts (Playwright's WebKit
 *  driver doesn't reliably notify page.route on sendBeacon; the
 *  counter is the server-truth fallback). */

import { logEvent } from '$lib/server/events';

interface VitalPayload {
  name: string;
  value: number;
  rating?: 'good' | 'needs-improvement' | 'poor';
  id?: string;
  url?: string;
  ts?: number;
}

// Module-level counter. Cleared on server restart -- the e2e flow
// reads before/after snapshots + asserts after > before, so the
// running total at any moment doesn't matter.
let beaconCount = 0;
let lastBeaconAt = 0;
let lastBeaconName: string | null = null;
let lastBeaconUrl: string | null = null;

export const POST = async ({ request }: { request: Request }) => {
  let body: VitalPayload | null = null;
  try {
    body = (await request.json()) as VitalPayload;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid-json' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (
    !body ||
    typeof body.name !== 'string' ||
    typeof body.value !== 'number' ||
    !Number.isFinite(body.value)
  ) {
    // `typeof number` accepts NaN + Infinity. Use Number.isFinite to
    // reject them -- a NaN LCP would corrupt downstream trend math.
    return new Response(JSON.stringify({ error: 'invalid-shape' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const rating = body.rating ?? 'unknown';
  const level: 'info' | 'warn' = rating === 'poor' ? 'warn' : 'info';
  // Only poor ratings actually surface as Issues -- good/needs-
  // improvement is too noisy. Issues filters by level >= warn.
  // `category: system` is the closest EventCategory to a runtime
  // performance metric (the union doesn't expose `metric` directly;
  // adding it would touch the schema + every downstream consumer).
  logEvent('vitals', `${body.name} ${rating}`, {
    level,
    category: 'system',
    message: `${body.name}=${body.value.toFixed(2)} (${rating}) on ${body.url ?? 'unknown'}`,
  });

  // Increment counter AFTER successful logging so failed beacons don't
  // inflate the count -- the e2e test reads this to verify the full
  // wire (web-vitals chunk -> sendBeacon -> /api/vitals receipt).
  beaconCount += 1;
  lastBeaconAt = Date.now();
  lastBeaconName = body.name;
  lastBeaconUrl = body.url ?? null;

  return new Response(null, { status: 204 });
};

/**
 * Test-only observability endpoint. Returns the cumulative number of
 * beacons received since process start, plus the last beacon's
 * timestamp / name / url for diagnostics. Public (no auth) because
 * the counter exposes no per-user state; only an integer counter
 * + the last beacon's metric name. Used by e2e/web-vitals.spec.ts
 * to verify webkit + mobile-safari actually emitted beacons even
 * when Playwright's client-side route handler doesn't fire on
 * sendBeacon().
 */
export const GET = async () => {
  return new Response(
    JSON.stringify({
      count: beaconCount,
      lastAt: lastBeaconAt,
      lastName: lastBeaconName,
      lastUrl: lastBeaconUrl,
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );
};
