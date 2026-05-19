/**
 * lib/confirm -- ConfirmGate double-click destructive-action helper.
 *
 * Test surface:
 *   • trigger() -- first click arms, second confirms, returns true
 *   • isArmed() -- accurate after arm/disarm
 *   • multiple keys -- independent until armed simultaneously
 *   • 3s auto-disarm
 *   • Switching keys mid-armed disarms the previous one
 *   • destroy() clears timer + armed state
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmGate } from './confirm.svelte';

describe('ConfirmGate', () => {
  let gate: ConfirmGate;

  beforeEach(() => {
    vi.useFakeTimers();
    gate = new ConfirmGate();
  });

  afterEach(() => {
    gate.destroy();
    vi.useRealTimers();
  });

  it('first trigger arms, returns false', () => {
    expect(gate.trigger('a')).toBe(false);
    expect(gate.isArmed('a')).toBe(true);
  });

  it('second trigger on same key fires + disarms', () => {
    gate.trigger('a');
    expect(gate.trigger('a')).toBe(true);
    expect(gate.isArmed('a')).toBe(false);
  });

  it('isArmed false for non-armed key', () => {
    gate.trigger('a');
    expect(gate.isArmed('b')).toBe(false);
  });

  it('different key re-arms (previous disarms)', () => {
    gate.trigger('a');
    expect(gate.isArmed('a')).toBe(true);
    expect(gate.trigger('b')).toBe(false);
    expect(gate.isArmed('a')).toBe(false);
    expect(gate.isArmed('b')).toBe(true);
  });

  it('auto-disarms after 3s', () => {
    gate.trigger('a');
    expect(gate.isArmed('a')).toBe(true);
    vi.advanceTimersByTime(3001);
    expect(gate.isArmed('a')).toBe(false);
  });

  it('does NOT auto-disarm before timeout', () => {
    gate.trigger('a');
    vi.advanceTimersByTime(2999);
    expect(gate.isArmed('a')).toBe(true);
  });

  it('custom timeout respected', () => {
    const g = new ConfirmGate(500);
    g.trigger('a');
    vi.advanceTimersByTime(499);
    expect(g.isArmed('a')).toBe(true);
    vi.advanceTimersByTime(2);
    expect(g.isArmed('a')).toBe(false);
    g.destroy();
  });

  it('destroy() clears armed state', () => {
    gate.trigger('a');
    gate.destroy();
    expect(gate.isArmed('a')).toBe(false);
  });

  it('destroy() prevents pending timer from firing', () => {
    gate.trigger('a');
    gate.destroy();
    vi.advanceTimersByTime(10_000);
    expect(gate.isArmed('a')).toBe(false);
  });

  it('multiple ConfirmGate instances are isolated', () => {
    const g2 = new ConfirmGate();
    gate.trigger('a');
    g2.trigger('a');
    // Both armed for different gate instances
    expect(gate.isArmed('a')).toBe(true);
    expect(g2.isArmed('a')).toBe(true);
    gate.disarm();
    expect(gate.isArmed('a')).toBe(false);
    expect(g2.isArmed('a')).toBe(true);
    g2.destroy();
  });

  it('arm() refreshes the timer', () => {
    gate.trigger('a');
    vi.advanceTimersByTime(2000);
    gate.arm('a');
    vi.advanceTimersByTime(2000);
    // Total 4000ms since first arm, but the second arm() reset; still armed.
    expect(gate.isArmed('a')).toBe(true);
  });
});
