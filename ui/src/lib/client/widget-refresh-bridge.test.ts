/**
 * widget-refresh-bridge -- maps the activity-feed SSE into the iOS widget
 * refresh pipeline.
 *
 * WHY these tests exist (Rule 9): the bridge replaced a broken
 * notifications bridge that pointed EventSource at /api/notifications (a
 * plain GET-JSON route, not text/event-stream) and double-fired OS
 * notifications. Its single remaining job is poking the layout to
 * re-fetch the iOS widget snapshot. The behaviours that MUST hold:
 *
 *   1. It subscribes to /api/stream (the real SSE), not /api/notifications.
 *   2. A PRODUCT event on a widget-relevant source (apply/interview/scan/
 *      issue) dispatches exactly one `heron:notify:widgets-stale`.
 *   3. A TECHNICAL event (uncaught error, web-vitals, render crash) NEVER
 *      dispatches widgets-stale -- a diagnostic carries no job-search
 *      state, so it must not churn the home-screen widget.
 *   4. A product event on an UNRELATED source does not dispatch.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityEvent, EventCategory, EventLevel, ReportKind } from '$lib/types';

// Capture the path + onMessage handler createSseClient was constructed
// with, and expose a close spy so we can assert teardown.
let capturedPath = '';
let capturedOnMessage: ((ev: MessageEvent) => void) | undefined;
const closeSpy = vi.fn();

vi.mock('./sse-client', () => ({
  createSseClient: (path: string, opts: { onMessage?: (ev: MessageEvent) => void }) => {
    capturedPath = path;
    capturedOnMessage = opts.onMessage;
    return { close: closeSpy, restart: vi.fn() };
  },
}));

// Stable brand event name so the dispatched CustomEvent type is known.
vi.mock('./brand', () => ({
  BRAND_EVENTS: { notify: 'heron:notify' },
}));

const { installWidgetRefreshBridge } = await import('./widget-refresh-bridge');

const STALE_EVENT = 'heron:notify:widgets-stale';

function makeEvent(
  partial: Partial<ActivityEvent> & { source: string; category: EventCategory },
): ActivityEvent {
  return {
    id: 'e-' + Math.random().toString(36).slice(2),
    ts: Date.now(),
    level: 'info' as EventLevel,
    title: 't',
    ...partial,
  };
}

function emit(ev: ActivityEvent) {
  capturedOnMessage?.({ data: JSON.stringify(ev) } as MessageEvent);
}

let staleCount: number;
let staleListener: () => void;

beforeEach(() => {
  capturedPath = '';
  capturedOnMessage = undefined;
  closeSpy.mockClear();
  staleCount = 0;
  staleListener = () => {
    staleCount += 1;
  };
  window.addEventListener(STALE_EVENT, staleListener);
});

afterEach(() => {
  window.removeEventListener(STALE_EVENT, staleListener);
});

describe('widget-refresh-bridge', () => {
  it('subscribes to /api/stream, NOT the broken /api/notifications GET-JSON route', () => {
    installWidgetRefreshBridge();
    expect(capturedPath).toBe('/api/stream');
  });

  it('dispatches widgets-stale for a PRODUCT event on a widget-relevant source', () => {
    installWidgetRefreshBridge();
    emit(makeEvent({ source: 'apply-linkedin', category: 'application' }));
    expect(staleCount).toBe(1);
  });

  it.each([
    ['apply-greenhouse', 'application'],
    ['interview-schedule', 'task'],
    ['scan-broad', 'task'],
    ['issues', 'application'],
  ] as [
    string,
    EventCategory,
  ][])('recognises widget-relevant source prefix %s (category %s)', (source, category) => {
    installWidgetRefreshBridge();
    emit(makeEvent({ source, category }));
    expect(staleCount).toBe(1);
  });

  it('does NOT dispatch widgets-stale for a TECHNICAL event (system category) even on an apply-* source', () => {
    // A render crash / uncaught error tagged with a coincidental apply-ish
    // source must not poke the widget pipeline -- diagnostics carry no
    // job-search state. eventKind('system') === 'technical'.
    installWidgetRefreshBridge();
    emit(makeEvent({ source: 'apply-linkedin', category: 'system', level: 'error' }));
    expect(staleCount).toBe(0);
  });

  it('does NOT dispatch widgets-stale for a web-vitals technical event', () => {
    installWidgetRefreshBridge();
    emit(makeEvent({ source: 'web-vitals', category: 'api', kind: 'technical' as ReportKind }));
    expect(staleCount).toBe(0);
  });

  it('respects an explicit kind:"technical" override even on a product category', () => {
    // eventKind() honours an explicit ev.kind over the category mapping.
    installWidgetRefreshBridge();
    emit(
      makeEvent({
        source: 'apply-linkedin',
        category: 'application',
        kind: 'technical' as ReportKind,
      }),
    );
    expect(staleCount).toBe(0);
  });

  it('does NOT dispatch for a PRODUCT event on an unrelated source', () => {
    installWidgetRefreshBridge();
    emit(makeEvent({ source: 'profile-update', category: 'user' }));
    expect(staleCount).toBe(0);
  });

  it('ignores malformed (non-JSON) SSE payloads without throwing', () => {
    installWidgetRefreshBridge();
    expect(() => capturedOnMessage?.({ data: 'not-json{' } as MessageEvent)).not.toThrow();
    expect(staleCount).toBe(0);
  });

  it('teardown closes the underlying SSE client', () => {
    const stop = installWidgetRefreshBridge();
    stop();
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
