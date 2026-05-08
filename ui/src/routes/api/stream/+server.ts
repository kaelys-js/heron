/**
 * SSE stream of activity events. Sends recent buffer first, then live events.
 *
 * @module
 */

import { bus, logEvent } from '$lib/server/events';
import type { ActivityEvent } from '$lib/types';

export const GET = async ({ request }: { request: Request }) => {
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      const send = (ev: ActivityEvent) => {
        if (closed) return;
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
      // Flush a comment line immediately so EventSource fires `onopen` without
      // waiting for a real event or the 25s heartbeat.
      try {
        controller.enqueue(enc.encode(': connected\n\n'));
      } catch {}
      try {
        for (const ev of bus.recent()) send(ev);
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
        try { controller.close(); } catch {}
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
