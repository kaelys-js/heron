/** SSE stream of activity events, scoped to the current user.
 *  Emits: (1) recent in-memory buffer filtered to events tagged for this
 *  user OR broadcast, (2) live events as they fire. Auth-gated: hooks-level
 *  guard refuses anon /api/* (non-allowlist), but we re-check here so the
 *  SSE filter has a userId to gate against. */

import { bus, logEvent } from '$lib/server/events';
import { requireUserId } from '$lib/server/auth-helpers';
import { SYSTEM_USER_ID } from '$lib/server/user-context';
import type { ActivityEvent } from '$lib/types';

export const GET = async ({ request, locals }: { request: Request; locals: App.Locals }) => {
  const userId = requireUserId(locals);
  const matches = (ev: ActivityEvent) =>
    !ev.userId || ev.userId === userId || ev.userId === SYSTEM_USER_ID;
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      const send = (ev: ActivityEvent) => {
        if (closed) {
          return;
        }
        if (!matches(ev)) {
          return;
        }
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
        } catch (e: unknown) {
          closed = true;
          logEvent('stream', 'controller.enqueue failed', {
            level: 'warn',
            category: 'system',
            message: e instanceof Error ? e.message : String(e),
          });
        }
      };
      try {
        controller.enqueue(enc.encode(': connected\n\n'));
      } catch {}
      // Screenshot capture pipeline (HERON_SCREENSHOT_MODE=1) seeds a
      // handful of recent activity events so /autopilot's timeline shows
      // live data, but the SSE replay fires a `toast.success` on every
      // event the bell hasn't seen before -- that drops a green popup
      // over the bottom-right of every captured PNG. Suppress the
      // backfill in screenshot mode; the autopilot loader still reads
      // `bus.recent()` directly and renders the same events inline,
      // without going through the toast path.
      if (process.env.HERON_SCREENSHOT_MODE !== '1') {
        try {
          for (const ev of bus.recentForUser(userId)) {
            send(ev);
          }
        } catch (e: unknown) {
          logEvent('stream', 'failed to send recent events', {
            level: 'warn',
            category: 'system',
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
      const handler = (ev: ActivityEvent) => send(ev);
      bus.on('event', handler);
      const beat = setInterval(() => {
        if (closed) {
          clearInterval(beat);
          return;
        }
        try {
          controller.enqueue(enc.encode(': heartbeat\n\n'));
        } catch {
          closed = true;
          clearInterval(beat);
        }
      }, 25000);
      request.signal.addEventListener('abort', () => {
        closed = true;
        bus.off('event', handler);
        clearInterval(beat);
        try {
          controller.close();
        } catch {}
      });
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};
