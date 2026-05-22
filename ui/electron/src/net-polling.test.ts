/**
 * net-polling.test -- startNetPoller transition dedup + stop semantics.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startNetPoller } from './net-polling';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startNetPoller', () => {
  it('fires onChange only on transition (not on every tick)', () => {
    const onChange = vi.fn();
    const isOnline = vi.fn(() => true);
    startNetPoller({ isOnline, onChange, intervalMs: 1000 });

    // Three ticks with same state -> no onChange.
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);
    expect(onChange).not.toHaveBeenCalled();

    // Flip to offline -> exactly one call.
    isOnline.mockReturnValue(false);
    vi.advanceTimersByTime(1000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(false);

    // Stay offline -> no further calls.
    vi.advanceTimersByTime(2000);
    expect(onChange).toHaveBeenCalledTimes(1);

    // Flip back to online -> one more call.
    isOnline.mockReturnValue(true);
    vi.advanceTimersByTime(1000);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it('reads initial state at start (no immediate onChange)', () => {
    const onChange = vi.fn();
    startNetPoller({
      isOnline: () => true,
      onChange,
      intervalMs: 1000,
    });
    // No tick yet -> no fire.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('uses default 5s interval when not specified', () => {
    const onChange = vi.fn();
    const isOnline = vi.fn(() => true);
    startNetPoller({ isOnline, onChange });

    vi.advanceTimersByTime(4999);
    expect(isOnline).toHaveBeenCalledTimes(1); // only the initial sync read
    vi.advanceTimersByTime(1);
    expect(isOnline).toHaveBeenCalledTimes(2); // first tick fired
  });

  it('stop() halts polling', () => {
    const onChange = vi.fn();
    const isOnline = vi.fn(() => true);
    const stop = startNetPoller({ isOnline, onChange, intervalMs: 1000 });

    vi.advanceTimersByTime(500);
    stop();
    isOnline.mockReturnValue(false);
    vi.advanceTimersByTime(5000);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stop() is idempotent', () => {
    const onChange = vi.fn();
    const stop = startNetPoller({
      isOnline: () => true,
      onChange,
      intervalMs: 1000,
    });
    expect(() => {
      stop();
      stop();
      stop();
    }).not.toThrow();
  });

  it('handles isOnline throwing (skips tick, retains state)', () => {
    const onChange = vi.fn();
    const isOnline = vi.fn(() => true);
    startNetPoller({ isOnline, onChange, intervalMs: 1000 });

    isOnline.mockImplementationOnce(() => {
      throw new Error('probe failed');
    });
    vi.advanceTimersByTime(1000);
    expect(onChange).not.toHaveBeenCalled();

    // Next tick recovers + still no change.
    vi.advanceTimersByTime(1000);
    expect(onChange).not.toHaveBeenCalled();

    // Real transition fires.
    isOnline.mockReturnValue(false);
    vi.advanceTimersByTime(1000);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('handles onChange throwing (poller keeps running)', () => {
    const onChange = vi.fn().mockImplementation(() => {
      throw new Error('listener broke');
    });
    const isOnline = vi.fn(() => true);
    startNetPoller({ isOnline, onChange, intervalMs: 1000 });

    isOnline.mockReturnValue(false);
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect(onChange).toHaveBeenCalledTimes(1);

    // Next transition should still fire (poller didn't die).
    isOnline.mockReturnValue(true);
    vi.advanceTimersByTime(1000);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('uses injected setInterval/clearInterval impls', () => {
    const setIntervalImpl = vi.fn(() => 42 as unknown as NodeJS.Timeout);
    const clearIntervalImpl = vi.fn();
    const stop = startNetPoller({
      isOnline: () => true,
      onChange: vi.fn(),
      intervalMs: 1234,
      setIntervalImpl: setIntervalImpl as unknown as typeof setInterval,
      clearIntervalImpl: clearIntervalImpl as unknown as typeof clearInterval,
    });
    expect(setIntervalImpl).toHaveBeenCalledWith(expect.any(Function), 1234);
    stop();
    expect(clearIntervalImpl).toHaveBeenCalledWith(42);
  });
});
