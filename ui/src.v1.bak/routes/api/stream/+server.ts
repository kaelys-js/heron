import { bus } from '$lib/server/events';

export const GET = async ({ request }) => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (ev: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
      };

      // Send recent buffered events first
      for (const ev of bus.recent()) send(ev);

      const handler = (ev: any) => send(ev);
      bus.on('event', handler);

      // Heartbeat every 25s
      const beat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': heartbeat\n\n')); }
        catch { clearInterval(beat); }
      }, 25000);

      request.signal.addEventListener('abort', () => {
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
      'Connection': 'keep-alive',
    },
  });
};
