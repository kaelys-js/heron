/** POST /api/vitals -- backward-compat alias for the web-vitals beacon.
 *
 *  The live client beacon (+layout.svelte) now POSTs to /api/telemetry with a
 *  `{ type: 'vitals', … }` body. This route stays as a thin alias so any
 *  in-flight native / cached client still POSTing the old `{ name, value,
 *  rating, url }` shape keeps working: it translates that body into the
 *  telemetry vitals contract and delegates to the same handler, so both paths
 *  log a single `kind: 'technical'` activity event and share one beacon
 *  counter. Poor ratings DO NOT surface as Issues -- web-vitals are quiet
 *  diagnostics; the activity feed (not the Inbox) is where they land.
 *
 *  GET re-exports the telemetry counter so the existing
 *  e2e/web-vitals.spec.ts observability check works against either path. */

import { POST as telemetryPost, GET } from '../telemetry/+server';

export { GET };

interface VitalPayload {
  name?: unknown;
  value?: unknown;
  rating?: unknown;
  id?: unknown;
  url?: unknown;
}

export const POST = async (event: {
  request: Request;
  getClientAddress: () => string;
  locals: App.Locals;
}): Promise<Response> => {
  let body: VitalPayload | null = null;
  try {
    body = (await event.request.json()) as VitalPayload;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid-json' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  // Translate the legacy shape (url -> route) into the telemetry vitals
  // contract, then delegate. A fresh Request is needed because the original
  // body stream is already consumed.
  const translated = new Request(event.request.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'vitals',
      name: body?.name,
      value: body?.value,
      rating: body?.rating,
      id: body?.id,
      route: body?.url,
    }),
  });
  return telemetryPost({ ...event, request: translated });
};
