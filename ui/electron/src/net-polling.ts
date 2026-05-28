/** Network status polling. Polls a getOnlineState() probe on an
 *  interval and fires onChange only when the state transitions. Used by
 *  the Electron main process to push net.isOnline() changes to the
 *  renderer via IPC.
 *
 *  Extracted from index.ts so the dedup-on-change logic is unit-
 *  testable without spinning up Electron's `net` module. */

export type NetPollerOptions = {
  /** Probe function -- returns current online state. */
  isOnline: () => boolean;
  /** Called when the state changes (NOT on every tick). */
  onChange: (online: boolean) => void;
  /** Poll interval in milliseconds (default 5000). */
  intervalMs?: number;
  /** Optional setInterval override (test hook). */
  setIntervalImpl?: typeof setInterval;
  /** Optional clearInterval override (test hook). */
  clearIntervalImpl?: typeof clearInterval;
};

/**
 * Start polling. Returns a stop function. Calling stop() clears the
 * interval; calling onChange after stop has no effect.
 *
 * The initial state is read synchronously at start; the first onChange
 * fires only on the FIRST transition (not on start), so callers should
 * push the initial state explicitly if they need it.
 */
export function startNetPoller(opts: NetPollerOptions): () => void {
  const intervalMs = opts.intervalMs ?? 5_000;
  const setIntervalFn = opts.setIntervalImpl ?? setInterval;
  const clearIntervalFn = opts.clearIntervalImpl ?? clearInterval;

  let lastState = opts.isOnline();
  let stopped = false;
  const timer = setIntervalFn(() => {
    if (stopped) {
      return;
    }
    let now: boolean;
    try {
      now = opts.isOnline();
    } catch {
      // Probe threw -- skip this tick, retain prior state.
      return;
    }
    if (now === lastState) {
      return;
    }
    lastState = now;
    try {
      opts.onChange(now);
    } catch {
      // Swallow onChange errors so a misbehaving listener doesn't kill
      // the poller loop.
    }
  }, intervalMs);

  return () => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearIntervalFn(timer);
  };
}
