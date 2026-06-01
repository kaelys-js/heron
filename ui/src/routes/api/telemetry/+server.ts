/** POST /api/telemetry -- the public, rate-limited diagnostics sink for
 *  client-originated TECHNICAL reports (uncaught JS errors, unhandled
 *  rejections, render/boundary crashes, SvelteKit load errors, network
 *  failures) AND web-vitals beacons. Both branches funnel to the activity
 *  feed as quiet `kind: 'technical'` events -- they NEVER open an Issue and
 *  never reportIssue. Product-loud surfacing (Issues + bell + OS notify) is
 *  the server's job via reportIssue, not anything a browser can POST here.
 *
 *  Public (no auth): client diagnostics fire pre-auth on cold loads + the
 *  endpoint writes no per-user-owned state beyond best-effort attribution
 *  to whatever session happens to be present. Rate-limited per IP+session
 *  via a small in-memory token bucket so a misbehaving / malicious client
 *  can't flood the activity log. Always returns fast (204 on accept, 429
 *  when over the cap, 400 on a malformed body).
 *
 *  Request body is one of:
 *    { type: 'error',  level, source, summary, detail?, stack?, route?, requestId? }
 *    { type: 'vitals', name, value, rating?, route?, id? }
 */

import { logEvent } from '$lib/server/events';
import type { EventLevel } from '$lib/types';

// ── Rate limiter ──────────────────────────────────────────────────────
// In-memory token bucket keyed by IP+session. No shared limiter util exists
// in the codebase (better-auth's own rateLimit covers only its routes), so a
// small bucket lives here. Capacity 60 tokens, refilled at 1/sec -- a real
// client bursts a handful of vitals + the odd error; 60/min is generous for
// honest traffic and still caps a runaway error loop. Buckets self-expire from
// the map after 5 min idle so it can't grow unbounded across many clients.
const CAPACITY = 60;
const REFILL_PER_MS = 1 / 1000; // one token per second
const IDLE_EVICT_MS = 5 * 60 * 1000;

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

/** Consume one token for `key`. Returns true if allowed, false if over cap. */
function takeToken(key: string, now: number): boolean {
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: CAPACITY, updatedAt: now };
    buckets.set(key, b);
  } else {
    // Refill proportional to elapsed time, capped at CAPACITY.
    const refill = (now - b.updatedAt) * REFILL_PER_MS;
    b.tokens = Math.min(CAPACITY, b.tokens + refill);
    b.updatedAt = now;
  }
  // Opportunistic eviction of idle buckets so the map stays bounded -- cheap
  // (only when the map is non-trivial) and never on the hot single-client path.
  if (buckets.size > 256) {
    for (const [k, v] of buckets) {
      if (now - v.updatedAt > IDLE_EVICT_MS) {
        buckets.delete(k);
      }
    }
  }
  if (b.tokens < 1) {
    return false;
  }
  b.tokens -= 1;
  return true;
}

/** Test-only reset so the bucket state doesn't leak across cases. */
export function _resetRateLimit(): void {
  buckets.clear();
}

// ── Vitals beacon counter ─────────────────────────────────────────────
// Module-level counter incremented only on an accepted `type: 'vitals'` POST.
// Cleared on server restart -- e2e/web-vitals.spec.ts reads before/after
// snapshots + asserts after > before, so the absolute total never matters.
// This is the server-truth fallback for Playwright's WebKit driver, which
// doesn't reliably surface navigator.sendBeacon to page.route.
let vitalsBeaconCount = 0;
let lastBeaconAt = 0;
let lastBeaconName: string | null = null;
let lastBeaconRoute: string | null = null;

// ── Body shapes ───────────────────────────────────────────────────────
interface ErrorBody {
  type: 'error';
  level?: EventLevel;
  source?: string;
  summary?: string;
  detail?: string;
  stack?: string;
  route?: string;
  requestId?: string;
}

interface VitalsBody {
  type: 'vitals';
  name?: string;
  value?: number;
  rating?: string;
  route?: string;
  id?: string;
}

type TelemetryBody = ErrorBody | VitalsBody;

function clientKey(event: {
  getClientAddress: () => string;
  locals: App.Locals;
  request: Request;
}): string {
  let ip = 'unknown';
  try {
    ip = event.getClientAddress();
  } catch {
    // getClientAddress throws when no adapter address is available (some test
    // / build contexts) -- fall back to a constant so the bucket still works.
  }
  // Session id when present, else the bearer token tail, else just the IP.
  // Keying on IP+session means one shared NAT IP with many users each gets
  // its own bucket rather than collectively tripping the limit.
  const sid =
    event.locals.session?.id ?? event.request.headers.get('authorization')?.slice(-16) ?? 'anon';
  return `${ip}|${sid}`;
}

export const POST = async (event: {
  request: Request;
  getClientAddress: () => string;
  locals: App.Locals;
}): Promise<Response> => {
  const { request } = event;

  // Rate-limit first -- a flood shouldn't even pay the JSON-parse cost.
  if (!takeToken(clientKey(event), Date.now())) {
    return new Response(JSON.stringify({ ok: false, error: 'rate-limited' }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '1' },
    });
  }

  let body: TelemetryBody | null = null;
  try {
    body = (await request.json()) as TelemetryBody;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'invalid-json' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (!body || typeof body !== 'object') {
    return new Response(JSON.stringify({ ok: false, error: 'invalid-shape' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (body.type === 'error') {
    const summary = String(body.summary ?? '').trim();
    if (!summary) {
      return new Response(JSON.stringify({ ok: false, error: 'summary-required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    const level: EventLevel = body.level === 'info' || body.level === 'warn' ? body.level : 'error';
    // category: 'system' (not 'vitals'/'diagnostics' -- those aren't valid
    // EventCategory values; system is the existing convention for runtime
    // diagnostics). kind: 'technical' is what actually drives the quiet
    // routing (no toast / bell / OS) regardless of category.
    logEvent(String(body.source ?? 'client').slice(0, 64), summary.slice(0, 200), {
      level,
      category: 'system',
      kind: 'technical',
      message: body.detail ? String(body.detail).slice(0, 6000) : undefined,
      stack: body.stack ? String(body.stack).slice(0, 4000) : undefined,
    });
    return new Response(null, { status: 204 });
  }

  if (body.type === 'vitals') {
    const name = String(body.name ?? '').trim();
    const value = Number(body.value);
    if (!name || !Number.isFinite(value)) {
      // typeof-number accepts NaN/Infinity; Number.isFinite rejects them so a
      // NaN metric can't corrupt downstream trend math.
      return new Response(JSON.stringify({ ok: false, error: 'invalid-shape' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    const rating = body.rating ? ` (${String(body.rating)})` : '';
    logEvent('web-vitals', name, {
      level: 'info',
      category: 'system',
      kind: 'technical',
      message: `${value}${rating}`,
    });
    // Increment AFTER a successful log so a failed beacon doesn't inflate the
    // count -- e2e reads this to verify the full web-vitals -> beacon wire.
    vitalsBeaconCount += 1;
    lastBeaconAt = Date.now();
    lastBeaconName = name;
    lastBeaconRoute = body.route ?? null;
    return new Response(null, { status: 204 });
  }

  return new Response(JSON.stringify({ ok: false, error: 'unknown-type' }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });
};

/**
 * Test-only observability endpoint. Returns the cumulative number of
 * web-vitals beacons accepted since process start, plus the last beacon's
 * timestamp / name / route. Public (no per-user state -- just an integer
 * counter + the last metric name). Used by e2e/web-vitals.spec.ts to verify
 * webkit + mobile-safari actually emitted beacons even when Playwright's
 * client-side route handler doesn't fire on sendBeacon().
 */
export const GET = async (): Promise<Response> =>
  new Response(
    JSON.stringify({
      count: vitalsBeaconCount,
      lastAt: lastBeaconAt,
      lastName: lastBeaconName,
      lastRoute: lastBeaconRoute,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
