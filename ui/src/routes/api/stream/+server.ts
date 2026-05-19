/**
 * SSE stream of activity events, scoped to the current user.
 *
 * Sends:
 *   1. The recent in-memory buffer (events tagged for this user OR broadcast).
 *   2. Live events as they happen.
 *
 * The endpoint requires authentication -- the hooks-level guard refuses
 * anonymous traffic to anything under /api/* that isn't on the public
 * allowlist, but we ALSO double-check here so the SSE filter has a userId
 * to gate against.
 *
 * @module
 */

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
        if (closed) return;
        if (!matches(ev)) return;
        try {
          controller.enqueue(enc.encode('data: ' + JSON.stringify(ev) + '\n\n'));
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
      try {
        for (const ev of bus.recentForUser(userId)) send(ev);
      } catch (e: unknown) {
        logEvent('stream', 'failed to send recent events', {
          level: 'warn',
          category: 'system',
          message: e instanceof Error ? e.message : String(e),
        });
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
