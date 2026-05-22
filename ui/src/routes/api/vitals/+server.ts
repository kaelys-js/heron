/** POST /api/vitals -- ingest web-vitals CLS / INP / LCP / TTFB / FCP
 *  beacons fired from +layout.svelte. Poor ratings log as level=warn
 *  (surface as Issues); good/needs-improvement log level=info for trend
 *  analysis. No auth -- vitals fire before auth-state hydration on cold
 *  loads + we don't want to drop measurements. POST + JSON body only. */

import { logEvent } from '$lib/server/events';

interface VitalPayload {
  name: string;
  value: number;
  rating?: 'good' | 'needs-improvement' | 'poor';
  id?: string;
  url?: string;
  ts?: number;
}

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
  if (!body || typeof body.name !== 'string' || typeof body.value !== 'number') {
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

  return new Response(null, { status: 204 });
};
