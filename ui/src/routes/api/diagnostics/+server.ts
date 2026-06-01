/** GET /api/diagnostics -- a downloadable, already-REDACTED diagnostics bundle
 *  the user can review + attach to a bug report. This is the consent-driven
 *  half of the local-first reporting model: a deliberate DOWNLOAD the user
 *  shares, NOT an automatic upload (that's the opt-in HERON_TELEMETRY_ENDPOINT
 *  seam in events.ts). Authenticated -- the bundle carries this user's + broadcast
 *  events (recentForUser), so it's gated to a logged-in user and never exposes
 *  another user's activity. Every event field was redacted at logEvent time
 *  (emails / API keys / Bearer tokens / home-dir paths masked), so no further
 *  masking is needed here. */
import { bus } from '$lib/server/events';

export const GET = async (event: { locals: App.Locals }): Promise<Response> => {
  const user = event.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
  // Build identity via the same guarded Vite defines hooks.server.ts uses (absent
  // in the test env -> '').
  const appVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
  const appBuild = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : '';
  const bundle = {
    generatedAt: new Date().toISOString(),
    app: { version: appVersion, build: appBuild },
    platform: `${process.platform}/${process.arch}`,
    node: process.version,
    requestId: event.locals.requestId,
    events: bus.recentForUser(user.id),
  };
  return new Response(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      // Prompt a file download rather than rendering inline.
      'content-disposition': 'attachment; filename="heron-diagnostics.json"',
    },
  });
};
